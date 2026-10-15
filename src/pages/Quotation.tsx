import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus, 
  Search, 
  MoreVertical,
  CheckCircle2,
  XCircle,
  FileDown,
  Loader2,
  FileText,
  Calendar,
  MessageCircle,
  Send,
  Trash2,
  Pencil,
  Lock
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { quotationsApi, leadsApi, getAbsoluteApiBaseUrl } from '../services/api';
import { QUOTATION_STATUSES, apiMessage, sameStatus, statusLabel } from '@/lib/statuses';
import { cn, toDateInputValue } from '@/lib/utils';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { useRegion } from '../contexts/RegionContext';
import { useNavigate, useSearchParams } from 'react-router-dom';

// Normalize a phone number to international E.164-ish digits (no +). The CRM
// data stores numbers like "08856015973" (national, leading 0) which wa.me
// cannot resolve, so we add the Indian country code when missing.
const normalizePhone = (phone?: string): string => {
  if (!phone) return '';
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.startsWith('91') && digits.length === 12) return digits;
  if (digits.length === 10) return `91${digits}`;
  if (digits.startsWith('0')) return `91${digits.slice(1)}`;
  return digits;
};

// Every field of the partial PATCH body, as strings so "" can be sent to clear
// validUntil / notes. The numeric inputs are blank until the user types, which
// is what lets handleEditSave send only what actually changed.
const EMPTY_PRICING_FORM = {
  systemSize: '',
  panelBrand: '',
  panelCount: '',
  inverterBrand: '',
  inverterCount: '',
  totalCost: '',
  subsidyAmount: '',
  netAmount: '',
  validUntil: '',
  notes: '',
};

const Quotation: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const { matchRegion, selectedRegion } = useRegion();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight');
  const [quotations, setQuotations] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  // Edit individual quotation (pricing) — PATCH /quotations/:id.
  const [editQuote, setEditQuote] = useState<any | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm] = useState({ ...EMPTY_PRICING_FORM });
  // Snapshot of the form as loaded, used to compute the partial PATCH body.
  const [editBaseline, setEditBaseline] = useState({ ...EMPTY_PRICING_FORM });
  // Distinguishes "net was derived by the auto-calc" from "someone typed a
  // number". Without it the first totalCost keystroke writes a net, that value
  // then looks manual, and a later subsidy correction silently never recomputes.
  const [netManual, setNetManual] = useState(false);
  // APPROVED quotations are read-only server-side (PATCH → 409). Latch it so
  // the form renders locked instead of letting the user type into a dead form.
  const [editLocked, setEditLocked] = useState(false);

  // GET /quotations/:id is the single source for the pricing form: it returns
  // the quotation with its nested lead + payments, so a deep link
  // (/quotations?highlight=<id>&edit=1) opens a fully-populated form without
  // waiting for, or re-fetching, the list.
  const loadQuotation = async (id: string) => {
    const res = await quotationsApi.getById(id);
    const d = res?.data?.data;
    return d?.quotation || d || res?.data;
  };

  const applyEditForm = (q: any) => {
    const str = (v: any) => (v === null || v === undefined || v === '' ? '' : String(v));
    const form = {
      systemSize: str(q.systemSize ?? q.systemSizeKW),
      panelBrand: q.panelBrand || '',
      panelCount: str(q.panelCount),
      inverterBrand: q.inverterBrand || '',
      inverterCount: str(q.inverterCount),
      totalCost: str(q.totalCost ?? q.totalAmount),
      subsidyAmount: str(q.subsidyAmount),
      // Treat a stored 0 as "not priced yet". The survey→pricing deep link opens
      // a DRAFT with netAmount 0; seeding '0' made the net auto-calc below a
      // no-op and PATCHed a payable of ₹0.
      netAmount: q.netAmount ? str(q.netAmount) : '',
      validUntil: toDateInputValue(q.validUntil),
      notes: q.notes || '',
    };
    setEditForm(form);
    setEditBaseline(form);
    setNetManual(!!q.netAmount);
    return form;
  };

  const openEdit = async (q: any) => {
    setEditQuote(q);
    setEditLocked(sameStatus(q.status, 'APPROVED'));
    setEditLoading(true);
    // Seed from the list row first so the dialog never flashes empty, then
    // reconcile against the authoritative detail read.
    applyEditForm(q);
    try {
      const fresh = await loadQuotation(q.id);
      if (fresh?.id) {
        setEditQuote(fresh);
        setEditLocked(sameStatus(fresh.status, 'APPROVED'));
        applyEditForm(fresh);
      }
    } catch (error: any) {
      if (error?.response?.status !== 404) {
        toast.error(apiMessage(error, 'Quotation detail load nahi hua — list data se chal raha hai'));
      }
    } finally {
      setEditLoading(false);
    }
  };

  // UpdateQuotationDto is a partial whitelist DTO. Send ONLY the fields whose
  // string value differs from the baseline, so we never smuggle leadId/status
  // (400) and never resurrect a value the user deliberately cleared.
  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editQuote || editSaving || editLocked) return;
    setEditSaving(true);
    try {
      const payload: any = {};
      const numFields = ['systemSize', 'panelCount', 'inverterCount', 'totalCost', 'subsidyAmount', 'netAmount'] as const;
      for (const key of numFields) {
        const v = editForm[key].trim();
        if (v === editBaseline[key].trim()) continue;
        if (v === '') continue; // numeric fields are not clearable
        const n = Number(v);
        if (isNaN(n)) {
          toast.error(`${key} number hona chahiye`);
          return;
        }
        payload[key] = n;
      }
      // Text fields: '' is meaningful here — it clears the stored value, which
      // is why they are compared-and-sent rather than omitted when blank.
      for (const key of ['panelBrand', 'inverterBrand', 'validUntil', 'notes'] as const) {
        const v = editForm[key];
        if (v !== editBaseline[key]) payload[key] = v;
      }
      if (Object.keys(payload).length === 0) {
        toast.info('Kuch badla nahi — save ke liye koi field update karo.');
        return;
      }
      await quotationsApi.update(editQuote.id, payload);
      // Re-read the single entity instead of re-listing: this is the acceptance
      // check for "pricing save → re-GET matches", and it also proves the ""
      // clear actually stuck.
      const fresh = await loadQuotation(editQuote.id);
      setQuotations((prev) => prev.map((x) => (x.id === editQuote.id ? { ...x, ...fresh } : x)));
      applyEditForm(fresh);
      toast.success('Quotation updated');
      setEditQuote(null);
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 409) {
        // APPROVED (or an illegal transition) — the server is the authority.
        setEditLocked(true);
        toast.error('Ye quotation approved hai — pricing read-only hai.');
      } else if (status === 403) {
        toast.error('Permission nahi — admin se quotations permission dilwao.');
      } else {
        toast.error(apiMessage(error, 'Failed to update quotation'));
      }
    } finally {
      setEditSaving(false);
    }
  };

  const [isManualEntry, setIsManualEntry] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState('');
  // Flow lock-in: quotations normally survey-submit se banti hain — manual
  // create sirf ADMIN/MANAGER emergency override (stuck flow ka escape hatch).
  const _role = String(user?.role || '');
  const isAdminManager = _role === 'ADMIN' || _role === 'SUPER_ADMIN' || !!user?.isSuperAdmin || _role === 'MANAGER';
  const ALLOW_MANUAL_CREATE = isAdminManager;

  // Reactive (not mount-only) so the sidebar "+" works even when already on
  // this page, and `status` deep-links apply. Uses a copy — `searchParams`
  // from the hook must not be mutated in place.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    let changed = false;
    if (next.get('new') === '1') { setIsCreateDialogOpen(true); next.delete('new'); changed = true; }
    const preset = next.get('status');
    if (preset) { setStatusFilter(preset.toUpperCase()); next.delete('status'); changed = true; }
    if (changed) setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // Survey-submit ke baad ?highlight=<id>&edit=1 aata hai — DRAFT ka pricing
  // form (wahi fields jo new form me hain) seedha kholo, data loss nahi.
  // If the row is not in the list (page filter, or the list hasn't resolved
  // yet) we still open it: GET /quotations/:id is authoritative.
  const autoEditDone = React.useRef(false);
  useEffect(() => {
    const hid = searchParams.get('highlight');
    if (searchParams.get('edit') !== '1' || !hid || autoEditDone.current) return;
    if (isLoading) return;
    autoEditDone.current = true;
    searchParams.delete('edit');
    setSearchParams(searchParams, { replace: true });
    const known = quotations.find((x: any) => x.id === hid);
    openEdit(known || ({ id: hid } as any));
  }, [quotations, searchParams, isLoading]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [whatsAppLoading, setWhatsAppLoading] = useState<string | null>(null);
  const [emailLoading, setEmailLoading] = useState<string | null>(null);

  const fetchQuotations = async () => {
    setIsLoading(true);
    try {
      const response = await quotationsApi.getAll();
      const data = response.data.data?.quotations || response.data.data;
      setQuotations(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error('Failed to fetch quotations');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchLeads = useCallback(async () => {
    try {
      const response = await leadsApi.getAll();
      const data = response.data.data?.leads || response.data.data;
      const leadsData = Array.isArray(data) ? data : [];
      setLeads(leadsData.filter((l: any) => {
        const s = String(l.status || '').toUpperCase();
        return s === 'QUALIFIED' || s === 'NEGOTIATION' || s === 'SITE_VISIT' || s === 'WON';
      }));
    } catch (error) {
      console.error('Failed to fetch leads', error);
    }
  }, []);

  useEffect(() => {
    fetchQuotations();
    fetchLeads();
  }, []);

  const handleOpenChange = (open: boolean) => {
    setIsCreateDialogOpen(open);
    if (!open) {
      setIsManualEntry(false);
      setSelectedLeadId('');
    }
  };

  // DELETE /quotations/:id is live — individual quotation delete with confirm.
  const handleDeleteConfirm = async () => {
    if (!deleteId || deleteLoading) return;
    setDeleteLoading(true);
    try {
      await quotationsApi.delete(deleteId);
      toast.success('Quotation deleted');
      setDeleteId(null);
      fetchQuotations();
    } catch (error: any) {
      const raw = error.response?.data?.message || 'Failed to delete quotation';
      toast.error(Array.isArray(raw) ? raw.join(', ') : raw);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    try {
      const res = await quotationsApi.updateStatus(id, { status: newStatus });
      const msg = res?.data?.message;
      // APPROVED = backend khud lead WON + installation + Customer banata hai
      // (region lead se copy; subsidy>0 → APPLIED). Frontend double-create NA kare —
      // lead page + Customers tab refresh karo, nayi entry khud aa jayegi.
      if (newStatus === 'APPROVED') {
        toast.success(typeof msg === 'string' && msg ? msg : 'Customer created');
        fetchQuotations();
        navigate('/customers');
        return;
      }
      // REJECTED → lead wapas NEGOTIATION stage taaki rework ho sake.
      // NOTE: it used to send status 'proposal', which is not in the canonical
      // LeadStatus enum — the API rejected it with 400 "proposal must be one of
      // the following values". NEGOTIATION is the intended pre-quote stage.
      if (newStatus === 'REJECTED') {
        const q = quotations.find((x: any) => x.id === id);
        const leadId = q?.leadId || q?.lead?.id;
        if (leadId) {
          try {
            await leadsApi.update(leadId, { status: 'NEGOTIATION' });
          } catch (leadErr: any) {
            if (leadErr?.response?.status === 400) {
              toast.error(apiMessage(leadErr, 'Lead wapas NEGOTIATION par nahi ja saka'));
            }
          }
        }
        toast.success(typeof msg === 'string' && msg ? msg : 'Quotation rejected — lead wapas negotiation stage me');
        fetchQuotations();
        return;
      }
      toast.success(typeof msg === 'string' && msg ? msg : `Quotation status updated to ${newStatus}`);
      fetchQuotations();
    } catch (error: any) {
      const status = error?.response?.status;
      const raw = error.response?.data?.message || error.message || 'Failed to update status';
      const msg = Array.isArray(raw) ? raw.join(', ') : raw;
      if (status === 403) toast.error('Permission nahi — admin se quotations permission dilwao.');
      else toast.error(msg);
    }
  };

  // leadId → region lookup (quotation list API nested lead me region nahi deta).
  const leadRegionById: Record<string, any> = useMemo(() => {
    const map: Record<string, any> = {};
    for (const l of leads) {
      const key = String(l.id || l._id || '');
      if (key) map[key] = l.region || l.regionId;
    }
    return map;
  }, [leads]);

  const filteredQuotations = quotations.filter(q => {
    const matchesSearch = (q.lead?.name || q.leadName || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                         (q.id || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || sameStatus(q.status, statusFilter);
    // Global region filter: quotation list API nested lead me region nahi bhejta,
    // isliye loaded leads se leadId → region map karke match karo. Region pata na
    // chale to item dikhao (keepUnknown) taaki data gayab na ho.
    const leadRegion = q.lead?.region || q.lead?.regionId || q.regionId || leadRegionById[q.leadId || q.lead?.id];
    const matchesRegion = matchRegion(leadRegion, true);
    return matchesSearch && matchesStatus && matchesRegion;
  });

  // Region-aware counts (global filter ke hisab se).
  const regionQuotations = selectedRegion === 'all'
    ? quotations
    : quotations.filter(q => {
        const leadRegion = q.lead?.region || q.lead?.regionId || q.regionId || leadRegionById[q.leadId || q.lead?.id];
        return matchRegion(leadRegion, true);
      });

  const handleCreateQuotation = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setIsSubmitting(true);

    try {
      let leadId = formData.get('leadId') as string;

      if (isManualEntry) {
        const leadData: any = {
          name: formData.get('leadName') as string,
          phone: formData.get('clientPhone') as string,
        };
        if (formData.get('clientCity')) leadData.city = formData.get('clientCity') as string;
        if (formData.get('clientEmail')) leadData.email = formData.get('clientEmail') as string;
        const leadRes = await leadsApi.create(leadData);
        const newLead = leadRes.data.data || leadRes.data;
        leadId = newLead.id || newLead._id;
      }

      const totalCost = Number(formData.get('totalAmount'));
      const quotationData = {
        leadId,
        systemSize: Number(formData.get('systemSizeKW')),
        totalCost,
        netAmount: totalCost,
        validUntil: formData.get('validUntil') as string,
        notes: formData.get('notes') as string,
      };

      await quotationsApi.create(quotationData);
      fetchQuotations();
      fetchLeads();
      // Route through handleOpenChange: Radix does not fire onOpenChange for a
      // programmatic close, so selectedLeadId survived and the next "New
      // Quotation" could silently create a second quotation for the same lead.
      handleOpenChange(false);
      toast.success('Quotation created successfully!');
    } catch (error: any) {
      const msg = error.response?.data?.message || error.message || 'Failed to create quotation';
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadPdf = async (id: string) => {
    try {
      const res = await quotationsApi.downloadPdf(id);
      const blob = res.data;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quotation-${id.slice(0, 8)}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('PDF downloaded successfully!');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to generate PDF');
    }
  };

  const handleSendWhatsApp = async (id: string) => {
    const q = quotations.find((x) => x.id === id);
    if (!q) { toast.error('Quotation not found'); return; }
    const phone = normalizePhone(q?.lead?.phone);
    if (!phone) { toast.error('No phone number available'); return; }
    setWhatsAppLoading(id);
    try {
      const clientName = q.lead?.name || q.leadName || 'Client';
      const amount = (q.totalCost || q.totalAmount || 0).toLocaleString();
      const systemSize = q.systemSize || q.systemSizeKW || 0;
      const validUntil = q.validUntil ? new Date(q.validUntil).toLocaleDateString('en-IN') : 'N/A';
      const qShort = (q.id || '').substring(0, 8).toUpperCase();
      const pdfUrl = `${getAbsoluteApiBaseUrl()}/quotations/${id}/download`;

      // 1) Download PDF blob authenticated (so we can actually attach it — wa.me text alone cannot attach files)
      let pdfBlob: Blob | null = null;
      try {
        const res = await quotationsApi.downloadPdf(id);
        const raw = res.data as Blob;
        pdfBlob = raw instanceof Blob ? raw : new Blob([raw as any], { type: 'application/pdf' });
        if (pdfBlob.type !== 'application/pdf') {
          pdfBlob = new Blob([pdfBlob], { type: 'application/pdf' });
        }
      } catch (e) {
        console.warn('[quotation] PDF download failed, will send link only', e);
      }

      const baseMsg =
        `Dear ${clientName},\n\nThank you for choosing Eurosol Prime!\n\n` +
        `Here is your quotation:\n` +
        `📄 Quotation ID: #${qShort}\n` +
        `⚡ System Size: ${systemSize} KW\n` +
        `💰 Total Amount: ₹ ${amount}\n` +
        `📅 Valid Until: ${validUntil}\n\n` +
        `For any queries, contact us at +91-79-12345678\n\nRegards,\nEurosol Prime`;

      // 2) Try Web Share API with files (mobile Chrome/Safari) — this actually ATTACHES the PDF to WhatsApp
      if (pdfBlob) {
        const pdfFile = new File([pdfBlob], `Quotation-${qShort}.pdf`, { type: 'application/pdf' });
        const canShareFile =
          typeof navigator !== 'undefined' &&
          (navigator as any).canShare &&
          (navigator as any).canShare({ files: [pdfFile] });
        if (canShareFile && (navigator as any).share) {
          try {
            await (navigator as any).share({
              title: `Quotation ${qShort} - Eurosol Prime`,
              text: baseMsg,
              files: [pdfFile],
            });
            toast.success('PDF shared to WhatsApp!');
            return;
          } catch (shareErr: any) {
            // AbortError = user cancelled share sheet — don't fallback to wa.me
            if (shareErr?.name === 'AbortError') return;
            console.warn('[quotation] navigator.share failed, falling back to wa.me', shareErr);
          }
        }
      }

      // 3) Fallback: wa.me text + auto-download so user can manually attach
      // wa.me cannot carry file attachments via URL — we must download the PDF for manual attach.
      if (pdfBlob) {
        const blobUrl = window.URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `Quotation-${qShort}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(blobUrl);
        // Brief pause so download starts before opening WhatsApp
        await new Promise((r) => setTimeout(r, 600));
      }

      const waMsg = pdfBlob
        ? `${baseMsg}\n\n📎 PDF downloaded as Quotation-${qShort}.pdf — please attach it in WhatsApp.\n(Link for reference: ${pdfUrl})`
        : `${baseMsg}\n\n📄 Quotation PDF: ${pdfUrl}`;
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(waMsg)}`, '_blank');
      toast.success(pdfBlob ? 'PDF downloaded + WhatsApp opened — attach the file!' : 'WhatsApp opened with PDF link!');
    } catch {
      toast.error('Failed to open WhatsApp');
    } finally {
      setWhatsAppLoading(null);
    }
  };

  const handleSendEmail = async (id: string) => {
    const q = quotations.find((x) => x.id === id);
    if (!q) { toast.error('Quotation not found'); return; }
    // The quotation's nested lead does not include the email field, so fall
    // back to fetching the full lead when needed.
    let email = q?.lead?.email;
    if (!email && q?.leadId) {
      try {
        const leadRes: any = await leadsApi.getById(q.leadId);
        email = leadRes?.data?.email || leadRes?.data?.data?.email || leadRes?.data?.data?.lead?.email;
      } catch { /* ignore, handled below */ }
    }
    if (!email) { toast.error('No email address added for this lead'); return; }
    setEmailLoading(id);
    try {
      const clientName = q?.lead?.name || q?.leadName || 'Client';
      const amount = (q.totalCost || q.totalAmount || 0).toLocaleString();
      const systemSize = q.systemSize || q.systemSizeKW || 0;
      const qShort = (q.id || '').substring(0, 8).toUpperCase();
      const validUntil = q.validUntil ? new Date(q.validUntil).toLocaleDateString('en-IN') : 'N/A';
      const subject = `Quotation - ${clientName} - Eurosol Prime`;
      const bodyText =
        `Dear ${clientName},\n\n` +
        `Please find your quotation from Eurosol Prime below:\n\n` +
        `Quotation ID: #${qShort}\n` +
        `System Size: ${systemSize} KW\n` +
        `Total Amount: ₹ ${amount}\n` +
        `Valid Until: ${validUntil}\n\n` +
        `For any queries, contact us at +91-79-12345678\n\nRegards,\nEurosol Prime`;
      const pdfUrl = `${getAbsoluteApiBaseUrl()}/quotations/${id}/download`;

      // 1) Download PDF blob authenticated
      let pdfBlob: Blob | null = null;
      try {
        const res = await quotationsApi.downloadPdf(id);
        const raw = res.data as Blob;
        pdfBlob = raw instanceof Blob ? raw : new Blob([raw as any], { type: 'application/pdf' });
        if (pdfBlob.type !== 'application/pdf') pdfBlob = new Blob([pdfBlob], { type: 'application/pdf' });
      } catch (e) {
        console.warn('[quotation] PDF download failed, will send link only', e);
      }

      // 2) Try Web Share API with file (mobile) — attaches PDF directly
      if (pdfBlob) {
        const pdfFile = new File([pdfBlob], `Quotation-${qShort}.pdf`, { type: 'application/pdf' });
        const canShareFile =
          typeof navigator !== 'undefined' &&
          (navigator as any).canShare &&
          (navigator as any).canShare({ files: [pdfFile] });
        if (canShareFile && (navigator as any).share) {
          try {
            await (navigator as any).share({
              title: subject,
              text: bodyText,
              files: [pdfFile],
            });
            toast.success('PDF shared via email app!');
            return;
          } catch (shareErr: any) {
            if (shareErr?.name === 'AbortError') return;
            console.warn('[quotation] navigator.share failed, falling back to mailto', shareErr);
          }
        }
      }

      // 3) Fallback: download PDF + open mailto: (mailto: cannot attach files — user must attach manually)
      if (pdfBlob) {
        const blobUrl = window.URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `Quotation-${qShort}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(blobUrl);
        await new Promise((r) => setTimeout(r, 600));
      }
      const mailBody = pdfBlob
        ? `${bodyText}\n\n📎 PDF downloaded as Quotation-${qShort}.pdf — please attach it to this email.\n(Reference link: ${pdfUrl})`
        : `${bodyText}\n\n📄 PDF: ${pdfUrl}`;
      window.open(`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(mailBody)}`, '_blank');
      toast.success(pdfBlob ? 'PDF downloaded + email draft opened — attach the file!' : 'Email draft opened with PDF link!');
    } catch {
      toast.error('Failed to send email');
    } finally {
      setEmailLoading(null);
    }
  };

  const totalStats = {
    all: regionQuotations.length,
    approved: regionQuotations.filter(q => q.status === 'APPROVED' || q.status === 'Approved').length,
    sent: regionQuotations.filter(q => q.status === 'SENT' || q.status === 'Sent').length,
    draft: regionQuotations.filter(q => q.status === 'DRAFT' || q.status === 'Draft').length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card rounded-xl border border-stone-200 p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-xl bg-orange-50 flex items-center justify-center">
            <FileText size={28} className="text-orange-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-stone-900">Quotations / Proposals</h1>
            <p className="text-stone-500 text-sm mt-0.5">Create and manage project proposals</p>
          </div>
        </div>
        {hasPermission('quotations', 'create') && ALLOW_MANUAL_CREATE && <Dialog open={isCreateDialogOpen} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <Button className="bg-orange-600 hover:bg-orange-700 text-white shadow-lg shadow-orange-200 h-11 px-6">
              <Plus size={18} className="mr-2" />
              New Quotation
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Quotation</DialogTitle>
              <DialogDescription>Generate a formal proposal for a lead or enter details manually.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateQuotation} className="space-y-4 py-3">
              
              <div className="flex items-center space-x-2 bg-orange-50/50 p-2.5 rounded-md border border-orange-100">
                <input
                  type="checkbox"
                  id="manualEntryCheck"
                  checked={isManualEntry}
                  onChange={(e) => setIsManualEntry(e.target.checked)}
                  className="h-4 w-4 rounded border-stone-300 text-orange-600 focus:ring-orange-500 cursor-pointer"
                />
                <Label htmlFor="manualEntryCheck" className="text-xs font-semibold text-stone-700 cursor-pointer select-none">
                  Enter customer/client details manually (No survey / lead)
                </Label>
              </div>

              {!isManualEntry ? (
                <div className="space-y-2">
                  <Label htmlFor="leadId">Select Lead</Label>
                  <Select name="leadId" value={selectedLeadId} onValueChange={setSelectedLeadId} required>
                    <SelectTrigger id="leadId">
                      <SelectValue placeholder="Select lead" />
                    </SelectTrigger>
                    <SelectContent>
                      {leads.map(l => (
                        <SelectItem key={l.id} value={l.id}>{l.name} ({l.city})</SelectItem>
                      ))}
                      {leads.length === 0 && (
                        <div className="p-2 text-center text-xs text-stone-400">No leads available</div>
                      )}
                    </SelectContent>
                  </Select>
                  <input type="hidden" name="leadId" value={selectedLeadId} />
                </div>
              ) : (
                <div className="space-y-3 p-3 bg-stone-50 rounded-lg border border-stone-100">
                  <p className="text-xs font-bold text-stone-500 uppercase tracking-widest">Manual Client Profile</p>
                  <div className="space-y-2">
                    <Label htmlFor="leadName">Client / Customer Name</Label>
                    <Input id="leadName" name="leadName" placeholder="e.g. Mukesh Ambani" required />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="clientPhone" className="text-xs text-stone-600">Phone Number</Label>
                      <Input id="clientPhone" name="clientPhone" placeholder="e.g. 9876543210" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="clientCity" className="text-xs text-stone-600">City / Region</Label>
                      <Input id="clientCity" name="clientCity" placeholder="e.g. Mumbai, MH" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="clientEmail" className="text-xs text-stone-600">Email Address (Optional)</Label>
                    <Input id="clientEmail" name="clientEmail" type="email" placeholder="e.g. client@example.com" />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="systemSizeKW">System Size (KW)</Label>
                  <Input id="systemSizeKW" name="systemSizeKW" type="number" step="any" placeholder="5" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="totalAmount">Total Amount (₹)</Label>
                  <Input id="totalAmount" name="totalAmount" type="number" placeholder="250000" required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="validUntil">Valid Until</Label>
                <Input id="validUntil" name="validUntil" type="date" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes / Special Terms</Label>
                <Input id="notes" name="notes" placeholder="e.g. 50% advance on signing" />
              </div>
              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
                <Button type="submit" className="bg-orange-600 hover:bg-orange-700 text-white" disabled={isSubmitting}>
                  {isSubmitting ? 'Creating...' : 'Create'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card rounded-xl border border-stone-200 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">Total</p>
              <p className="text-2xl font-bold text-stone-900 mt-1">{totalStats.all}</p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <FileText size={20} className="text-blue-600" />
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-stone-200 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">Approved</p>
              <p className="text-2xl font-bold text-green-700 mt-1">{totalStats.approved}</p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-green-50 flex items-center justify-center">
              <CheckCircle2 size={20} className="text-green-600" />
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-stone-200 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">Sent</p>
              <p className="text-2xl font-bold text-blue-700 mt-1">{totalStats.sent}</p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <FileDown size={20} className="text-blue-600" />
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-stone-200 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">Draft</p>
              <p className="text-2xl font-bold text-stone-600 mt-1">{totalStats.draft}</p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-stone-50 flex items-center justify-center">
              <FileText size={20} className="text-stone-500" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters & Table */}
      <Card className="border-stone-200 shadow-sm rounded-xl overflow-hidden">
        <CardHeader className="p-5 border-b border-stone-100 bg-card">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
              <Input 
                placeholder="Search by client or quotation ID..." 
                className="pl-10 h-10 border-stone-200 focus-visible:ring-orange-500 bg-stone-50"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button variant={statusFilter === 'DRAFT' ? 'default' : 'outline'} size="sm" className={statusFilter === 'DRAFT' ? 'bg-orange-600 hover:bg-orange-700 text-white' : ''} onClick={() => setStatusFilter(statusFilter === 'DRAFT' ? 'all' : 'DRAFT')} title="Survey se aaye zero-pricing drafts">
                Drafts from Survey
              </Button>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px] h-10 border-stone-200 bg-stone-50">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {/* Canonical enum — EXPIRED was missing from this filter. */}
                  {QUOTATION_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-stone-50 border-b border-stone-100">
                <TableHead className="text-xs font-semibold text-stone-500 uppercase tracking-wider py-4">#</TableHead>
                <TableHead className="text-xs font-semibold text-stone-500 uppercase tracking-wider py-4">Client Name</TableHead>
                <TableHead className="text-xs font-semibold text-stone-500 uppercase tracking-wider py-4">System</TableHead>
                <TableHead className="text-xs font-semibold text-stone-500 uppercase tracking-wider py-4">Amount</TableHead>
                <TableHead className="text-xs font-semibold text-stone-500 uppercase tracking-wider py-4">Status</TableHead>
                <TableHead className="text-xs font-semibold text-stone-500 uppercase tracking-wider py-4">Date</TableHead>
                <TableHead className="text-right text-xs font-semibold text-stone-500 uppercase tracking-wider py-4">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center text-stone-400">
                      <Loader2 size={48} className="mb-4 animate-spin opacity-20" />
                      <p className="text-lg font-medium">Loading quotations...</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredQuotations.length > 0 ? (
                filteredQuotations.map((q, idx) => (
                  <TableRow key={q.id} className={cn("border-b border-stone-50 hover:bg-stone-50/50 transition-colors", highlightId === q.id && "bg-orange-50/60 ring-1 ring-inset ring-orange-200")}>
                    <TableCell className="font-mono text-xs text-stone-400 py-4">{(q.id || '').substring(0, 7)}</TableCell>
                    <TableCell>
                      <div className="flex items-start flex-col">
                        <span className="font-semibold text-stone-800">{q.lead?.name || q.leadName || 'N/A'}</span>
                        {q.lead?.phone && <span className="text-xs text-stone-400 mt-0.5">{q.lead.phone}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-stone-700">{(q.systemSize || q.systemSizeKW || 0)} <span className="text-xs text-stone-400">KW</span></TableCell>
                    <TableCell className="font-semibold text-stone-800">₹{((q.totalCost || q.totalAmount || 0)).toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge className={cn(
                        "font-medium px-3 py-1 rounded-full text-xs",
                        (q.status === 'APPROVED' || q.status === 'Approved') && "bg-green-50 text-green-700 border border-green-200",
                        (q.status === 'SENT' || q.status === 'Sent') && "bg-blue-50 text-blue-700 border border-blue-200",
                        (q.status === 'DRAFT' || q.status === 'Draft') && "bg-stone-100 text-stone-600 border border-stone-200",
                        (q.status === 'REJECTED' || q.status === 'Rejected') && "bg-red-50 text-red-700 border border-red-200",
                        (q.status === 'EXPIRED' || q.status === 'Expired') && "bg-amber-50 text-amber-700 border border-amber-200",
                      )}>
                        {statusLabel(q.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-stone-500">
                      <div className="flex items-center gap-1.5">
                        <Calendar size={13} className="text-stone-400" />
                        {new Date(q.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="h-8 px-2.5 text-xs text-stone-600 border-stone-200 hover:bg-orange-50 hover:text-orange-600 hover:border-orange-200"
                          onClick={() => handleDownloadPdf(q.id)}
                          title="Download PDF"
                        >
                          <FileDown size={13} />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="h-8 w-8 p-0 text-xs text-green-600 border-stone-200 hover:bg-green-50 hover:text-green-700 hover:border-green-200 disabled:opacity-40"
                          onClick={() => handleSendWhatsApp(q.id)}
                          disabled={whatsAppLoading === q.id}
                          title={q.lead?.phone ? "Send via WhatsApp" : "No phone number"}
                        >
                          {whatsAppLoading === q.id ? <Loader2 size={13} className="animate-spin" /> : <MessageCircle size={13} />}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 w-8 p-0 text-xs text-blue-600 border-stone-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 disabled:opacity-40"
                          onClick={() => handleSendEmail(q.id)}
                          disabled={emailLoading === q.id || (!q?.lead?.email && !q?.leadId)}
                          title={q.lead?.email || q?.leadId ? "Send via Email (with PDF)" : "No email added"}
                        >
                          {emailLoading === q.id ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-stone-100 rounded-full">
                              <MoreVertical size={16} className="text-stone-400" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuLabel className="text-xs text-stone-500">Actions</DropdownMenuLabel>
                            <DropdownMenuItem className="cursor-pointer hover:bg-stone-50 text-sm" onClick={() => handleDownloadPdf(q.id)}>
                              <FileDown size={14} className="mr-2 text-stone-500" /> Download PDF
                            </DropdownMenuItem>
                            <DropdownMenuItem className="cursor-pointer hover:bg-green-50 text-sm" onClick={() => handleSendWhatsApp(q.id)} disabled={!q?.lead?.phone}>
                              <MessageCircle size={14} className="mr-2 text-green-500" /> {q?.lead?.phone ? 'Send WhatsApp' : 'No phone number'}
                            </DropdownMenuItem>
                            <DropdownMenuItem className="cursor-pointer hover:bg-blue-50 text-sm" onClick={() => handleSendEmail(q.id)} disabled={emailLoading === q.id || (!q?.lead?.email && !q?.leadId)}>
                              <Send size={14} className="mr-2 text-blue-500" /> {emailLoading === q.id ? 'Sending...' : q?.lead?.email || q?.leadId ? 'Send Email (with PDF)' : 'No email added'}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {hasPermission('quotations', 'update') && <>
                              <DropdownMenuItem className="cursor-pointer hover:bg-stone-50 text-sm" onClick={() => openEdit(q)}>
                                <Pencil size={14} className="mr-2 text-stone-500" /> Edit Quotation
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuLabel className="text-[10px] text-stone-400 uppercase tracking-wider font-semibold py-1 px-2">Change Status</DropdownMenuLabel>
                              <DropdownMenuItem className="cursor-pointer hover:bg-stone-50 text-sm" onClick={() => handleUpdateStatus(q.id, 'DRAFT')}>
                                <FileText size={14} className="mr-2 text-stone-500" /> Set as Draft
                              </DropdownMenuItem>
                              <DropdownMenuItem className="cursor-pointer hover:bg-stone-50 text-sm" onClick={() => handleUpdateStatus(q.id, 'SENT')}>
                                <FileDown size={14} className="mr-2 text-blue-500" /> Mark as Sent
                              </DropdownMenuItem>
                              <DropdownMenuItem className="cursor-pointer hover:bg-stone-50 text-sm" onClick={() => handleUpdateStatus(q.id, 'APPROVED')}>
                                <CheckCircle2 size={14} className="mr-2 text-green-500" /> Mark as Approved
                              </DropdownMenuItem>
                              <DropdownMenuItem className="cursor-pointer hover:bg-stone-50 text-sm" onClick={() => handleUpdateStatus(q.id, 'REJECTED')}>
                                <XCircle size={14} className="mr-2 text-red-500" /> Mark as Rejected
                              </DropdownMenuItem>
                              <DropdownMenuItem className="cursor-pointer hover:bg-stone-50 text-sm" onClick={() => handleUpdateStatus(q.id, 'EXPIRED')}>
                                <Calendar size={14} className="mr-2 text-amber-500" /> Mark as Expired
                              </DropdownMenuItem>
                            </>}
                            {hasPermission('quotations', 'delete') && <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="cursor-pointer hover:bg-red-50 text-sm text-red-600" onClick={() => setDeleteId(q.id)}>
                                <Trash2 size={14} className="mr-2" /> Delete Quotation
                              </DropdownMenuItem>
                            </>}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center text-stone-400">
                      <FileText size={48} className="mb-4 opacity-20" />
                      <p className="text-lg font-medium">No quotations found</p>
                      <p className="text-sm text-stone-400 mt-1">Create your first quotation to get started</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Quotation (pricing) */}
      <Dialog open={!!editQuote} onOpenChange={o => { if (!o) setEditQuote(null); }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          {editLoading && (
            <div className="flex items-center gap-2 text-xs text-stone-500">
              <Loader2 size={13} className="animate-spin" /> Quotation load ho raha hai…
            </div>
          )}
            <DialogHeader>
              <DialogTitle>Edit Quotation</DialogTitle>
              <DialogDescription>
                Pricing bharo/update karo. Save par sirf badle hue fields PATCH hote hain,
                phir <code className="font-mono">GET /quotations/:id</code> se verify hota hai.
              </DialogDescription>
            </DialogHeader>
          {editQuote && (
            <form onSubmit={handleEditSave} className="space-y-4 py-2">
              <div className="rounded-lg bg-stone-50 border border-stone-200 px-3 py-2 text-sm">
                <p className="font-bold text-stone-900">{editQuote.lead?.name || editQuote.leadName || 'Quotation'}</p>
                <p className="text-xs text-stone-500">Status: {statusLabel(editQuote.status)}</p>
              </div>
              {editLocked && (
                <div className="rounded-lg border border-green-300 bg-green-50 p-3 flex items-start gap-2" role="status">
                  <Lock size={15} className="mt-0.5 shrink-0 text-green-700" />
                  <p className="text-xs text-green-900 leading-relaxed">
                    <span className="font-semibold">Approved — read only.</span> Pricing server par lock hai
                    (PATCH 409). Status change ke liye quotation actions use karo.
                  </p>
                </div>
              )}
              <fieldset disabled={editLocked || editLoading} className="space-y-4 disabled:opacity-60">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>System Size (KW)</Label><Input type="number" step="any" value={editForm.systemSize} onChange={(e) => setEditForm({ ...editForm, systemSize: e.target.value })} placeholder="5" /></div>
                <div className="space-y-1.5"><Label>Panel Count</Label><Input type="number" step="1" min="0" value={editForm.panelCount} onChange={(e) => setEditForm({ ...editForm, panelCount: e.target.value })} placeholder="20" /></div>
                <div className="space-y-1.5"><Label>Inverter Count</Label><Input type="number" step="1" min="0" value={editForm.inverterCount} onChange={(e) => setEditForm({ ...editForm, inverterCount: e.target.value })} placeholder="1" /></div>
                <div className="space-y-1.5"><Label htmlFor="edit-totalCost">Total Cost (₹)</Label><Input id="edit-totalCost" type="number" step="any" value={editForm.totalCost} onChange={(e) => {
                  const totalCost = e.target.value;
                  setEditForm((prev) => {
                    // Net auto-calc only while net is untouched. Clamp: a subsidy
                    // above the total produced a negative payable.
                    if (netManual || totalCost === '' || isNaN(Number(totalCost))) return { ...prev, totalCost };
                    const sub = prev.subsidyAmount !== '' && !isNaN(Number(prev.subsidyAmount)) ? Number(prev.subsidyAmount) : 0;
                    return { ...prev, totalCost, netAmount: String(Math.max(0, Number(totalCost) - sub)) };
                  });
                }} placeholder="250000" /></div>
                <div className="space-y-1.5"><Label>Subsidy Amount (₹)</Label><Input type="number" step="any" value={editForm.subsidyAmount} onChange={(e) => {
                  const subsidyAmount = e.target.value;
                  setEditForm((prev) => {
                    if (netManual || prev.totalCost === '' || isNaN(Number(prev.totalCost))) return { ...prev, subsidyAmount };
                    const sub = subsidyAmount !== '' && !isNaN(Number(subsidyAmount)) ? Number(subsidyAmount) : 0;
                    return { ...prev, subsidyAmount, netAmount: String(Math.max(0, Number(prev.totalCost) - sub)) };
                  });
                }} placeholder="78000" /></div>
                <div className="space-y-1.5"><Label>Net Amount (₹)</Label><Input type="number" step="any" value={editForm.netAmount} onChange={(e) => {
                  // Clearing net hands control back to the auto-calc; typing any
                  // value pins it as a deliberate manual override.
                  setNetManual(e.target.value !== '');
                  setEditForm({ ...editForm, netAmount: e.target.value });
                }} placeholder="172000" /></div>
              </div>
              <div className="space-y-1.5"><Label>Panel Brand</Label><Input value={editForm.panelBrand} onChange={(e) => setEditForm({ ...editForm, panelBrand: e.target.value })} placeholder="e.g. Tata Power" /></div>
              <div className="space-y-1.5"><Label>Inverter Brand</Label><Input value={editForm.inverterBrand} onChange={(e) => setEditForm({ ...editForm, inverterBrand: e.target.value })} placeholder="e.g. Solis" /></div>
                <div className="space-y-1.5"><Label htmlFor="edit-validUntil">Valid Until</Label><Input id="edit-validUntil" type="date" value={editForm.validUntil} onChange={(e) => setEditForm({ ...editForm, validUntil: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Notes</Label><Input value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} placeholder="Terms / remarks" /></div>
              </fieldset>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditQuote(null)}>Cancel</Button>
                <Button type="submit" disabled={editSaving || editLocked || editLoading} className="bg-orange-600 hover:bg-orange-700 text-white">
                  {editSaving ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : null} Save
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Quotation — confirm */}      <Dialog open={!!deleteId} onOpenChange={o => { if (!o) setDeleteId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Delete Quotation</DialogTitle><DialogDescription>Are you sure? This cannot be undone.</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={deleteLoading}>{deleteLoading && <Loader2 size={16} className="mr-2 animate-spin" />}Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Quotation;
