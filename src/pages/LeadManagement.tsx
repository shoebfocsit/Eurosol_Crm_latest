import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Plus, Search, Filter, MoreVertical, Phone, Mail, MapPin, Calendar,
  ChevronRight, User as UserIcon, Users, Loader2, Send, MessageCircle, MessageSquare, ArrowLeftRight,
  Upload, FileSpreadsheet, Download, X, CheckCircle2, AlertCircle, Package, Edit3, Eye
} from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { leadsApi, employeesApi, settingsApi, surveysApi, quotationsApi, installationsApi, documentsApi, customersApi, paymentsApi } from '../services/api';
import { LEAD_STATUSES, apiMessage, sameStatus, statusLabel } from '@/lib/statuses';
import DocumentManager from '../components/documents/DocumentManager';
import { Lead, LeadComment } from '../types';
import { cn, toDateInputValue, toLocalDateKey } from '@/lib/utils';
import { useRegion } from '../contexts/RegionContext';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { useSearchParams } from 'react-router-dom';

// Was: lowercase ['new','contacted','qualified','site_visit','proposal',
// 'negotiation','won','lost']. The backend LeadStatus enum is SCREAMING_SNAKE
// and has no 'proposal' member at all, so every status change from this page
// 400'd. LEAD_STATUSES is the canonical list; 'proposal' is represented by
// NEGOTIATION, the stage a lead sits in once a quotation is being worked.
const STATUSES = LEAD_STATUSES;
const SOURCES = ['WEBSITE', 'REFERRAL', 'WALK_IN', 'PHONE_INQUIRY', 'EVENT', 'OTHER'] as const;

// Shortcut tabs — dropdown ka hi shortcut hain. Pending = CONTACTED
// (leads me PENDING status exist nahi karta; contact ho gaya, aage follow-up pending).
const LEAD_TABS = [
  { key: 'new', label: 'New', status: 'NEW' },
  { key: 'pending', label: 'Pending', status: 'CONTACTED', title: 'Contacted — follow-up pending' },
  { key: 'qualified', label: 'Qualified', status: 'QUALIFIED' },
  { key: 'site_visit', label: 'Site Visit', status: 'SITE_VISIT' },
  { key: 'negotiation', label: 'Negotiation', status: 'NEGOTIATION' },
  { key: 'won', label: 'Won', status: 'WON' },
  { key: 'lost', label: 'Lost', status: 'LOST' },
  { key: 'draft', label: 'Draft', status: 'DRAFT' },
  { key: 'all', label: 'All Leads', status: 'all' },
] as const;

const getStatusBadgeClass = (status: string) => {
  if (sameStatus(status, 'DRAFT')) return "bg-stone-100 text-stone-500 hover:bg-stone-100";
  if (sameStatus(status, 'NEW')) return "bg-stone-100 text-stone-600 hover:bg-stone-100";
  if (sameStatus(status, 'CONTACTED')) return "bg-blue-100 text-blue-700 hover:bg-blue-100";
  if (sameStatus(status, 'QUALIFIED')) return "bg-cyan-100 text-cyan-700 hover:bg-cyan-100";
  if (sameStatus(status, 'SITE_VISIT')) return "bg-orange-100 text-orange-700 hover:bg-orange-100";
  if (sameStatus(status, 'NEGOTIATION')) return "bg-purple-100 text-purple-700 hover:bg-purple-100";
  if (sameStatus(status, 'WON')) return "bg-green-100 text-green-700 hover:bg-green-100";
  if (sameStatus(status, 'LOST')) return "bg-red-100 text-red-700 hover:bg-red-100";
  return "";
};

// Normalize a phone number to international E.164-ish digits (no +). CRM data
// stores numbers like "08856015973" (national, leading 0) which wa.me cannot
// resolve, so we add the Indian country code when missing.
const normalizePhone = (phone?: string): string => {
  if (!phone) return '';
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.startsWith('91') && digits.length === 12) return digits;
  if (digits.length === 10) return `91${digits}`;
  if (digits.startsWith('0')) return `91${digits.slice(1)}`;
  return digits;
};

const LeadManagement: React.FC = () => {
  const { hasPermission } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [regions, setRegions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  // Server-side search (?search=, backend supported) — har keystroke par API
  // na mare isliye debounced. Client-side filteredLeads hata diya taaki
  // page 2-3 ke leads bhi search me milen.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 500);
    return () => clearTimeout(t);
  }, [searchTerm]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [assignedToMe, setAssignedToMe] = useState(false);
  const { regions: allRegions, selectedRegion, setSelectedRegion } = useRegion();
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, pages: 1 });
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [leadToDelete, setLeadToDelete] = useState<Lead | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const hasHandledNewLead = useRef(false);
  useEffect(() => {
    if (!hasHandledNewLead.current && searchParams.get('new') === '1') {
      hasHandledNewLead.current = true;
      setIsAddDialogOpen(true);
      searchParams.delete('new');
      setSearchParams(searchParams, { replace: true });
    }
    // Navbar global search se ?q= aata hai — use list filter me lagao aur
    // status All par le jao, warna default New tab me (galat) khaali dikhega.
    const q = searchParams.get('q');
    if (q !== null) {
      if (q !== searchTerm) setSearchTerm(q);
      if (q.trim() && statusFilter !== 'all') setStatusFilter('all');
      searchParams.delete('q');
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, setSearchParams]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isViewDetailsOpen, setIsViewDetailsOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [transferOwnerId, setTransferOwnerId] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [whatsAppLoading, setWhatsAppLoading] = useState<string | null>(null);
  const [comments, setComments] = useState<LeadComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [updateStatus, setUpdateStatus] = useState('');
  const [inventoryUsage, setInventoryUsage] = useState<any[]>([]);

  // Schedule Survey (SCREEN 1) — QUALIFIED leads only, never WON.
  const [surveyLead, setSurveyLead] = useState<any | null>(null);
  const [surveyEngineerId, setSurveyEngineerId] = useState('');
  const [surveyDate, setSurveyDate] = useState('');
  const [surveyNotes, setSurveyNotes] = useState('');
  const [surveySaving, setSurveySaving] = useState(false);
  const surveyEngineers = employees.filter((e: any) => ['ENGINEER', 'ADMIN', 'SUPER_ADMIN'].includes(e.role));
  const canScheduleSurvey = hasPermission('surveys', 'create') || hasPermission('leads', 'update');

  const handleScheduleSurvey = async () => {
    if (!surveyLead) return;
    if (!surveyEngineerId) { toast.error('Engineer select karo'); return; }
    if (!surveyDate) { toast.error('Scheduled date select karo'); return; }
    if (surveySaving) return;
    setSurveySaving(true);
    try {
      await surveysApi.create({ leadId: surveyLead.id, engineerId: surveyEngineerId, scheduledDate: surveyDate, notes: surveyNotes || undefined });
      try { await leadsApi.update(surveyLead.id, { status: 'SITE_VISIT' }); } catch { /* status move best-effort */ }
      toast.success('Survey scheduled — lead SITE_VISIT me move ho gaya');
      setSurveyLead(null); setSurveyEngineerId(''); setSurveyDate(''); setSurveyNotes('');
      fetchLeads(pagination.page);
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join(', ') : (msg || 'Failed to schedule survey'));
    } finally { setSurveySaving(false); }
  };

  // Bulk upload
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkRegionIds, setBulkRegionIds] = useState<string[]>([]);
  const [bulkAllRegions, setBulkAllRegions] = useState(true);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkPreview, setBulkPreview] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Add lead form state
  const [addForm, setAddForm] = useState({
    name: '', phone: '', email: '', source: '', regionId: '',
    address: '', city: '', state: '', pincode: '', notes: '',
    bookingDate: '', projectStage: '', nmApplicationId: '', channelPartner: '',
    projectCost: '', ivrsNumber: '', projectType: '',
    liaisoningWork: '', liaisoningCost: '', liaisoningStage: '',
    googleLocation: '', sanctionedLoadKw: '', dcCapacityKw: '',
    numberOfPanels: '', solarPanelBrand: '', solarPanelWp: '',
    inverterCapacityKw: '', inverterBrand: '', structureSize: '',
    numberOfStructure: '', bookingAmount: '', finalPayment: '',
    loanAmount: '', loanBankName: '', dateOfInstallation: '',
    dateOfCommissioning: '', documentsHandOverDate: '', amcServices: '',
    tentativeInstallationDate: '',
  });
  const [addSaving, setAddSaving] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [addStep, setAddStep] = useState(0);
  const [editLead, setEditLead] = useState<any>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editStep, setEditStep] = useState(0);

  // Race guard: tabs/search/region tezi se badalne par purana (slow) response
  // naye filter ke upar render na ho — sirf latest request ka data lagao.
  const leadsReqId = useRef(0);

  const fetchLeads = useCallback(async (page = 1) => {
    const myReq = ++leadsReqId.current;
    setIsLoading(true);
    try {
      const params: any = { page, limit: pagination.limit };
      if (statusFilter !== 'all') params.status = statusFilter;
      if (selectedRegion !== 'all') params.regionId = selectedRegion;
      if (debouncedSearch) params.search = debouncedSearch;
      // Only apply the owner filter when the "My Leads" checkbox is ticked.
      // Default is to show all leads the user has permission to read.
      if (assignedToMe) params.assignedToMe = true;
      const response = await leadsApi.getAll(params);
      if (leadsReqId.current !== myReq) return; // stale — koi aur fetch nikal chuki
      const leadsData = response.data.data;
      setLeads(Array.isArray(leadsData?.leads) ? leadsData.leads : Array.isArray(leadsData) ? leadsData : []);
      const pag = response.data.data?.pagination || response.data.pagination;
      // API `totalPages` bhejta hai — `pages` yahin sync karo, warna neeche
      // `pagination.pages > 1` kabhi true nahi hota aur Next/Previous kabhi dikhte hi nahi.
      if (pag) setPagination((prev: any) => ({ ...prev, page: pag.page, limit: pag.limit, total: pag.total, pages: pag.totalPages ?? pag.pages ?? prev.pages, totalPages: pag.totalPages ?? pag.pages ?? prev.pages }));
    } catch (error: any) {
      if (leadsReqId.current === myReq) toast.error(error.response?.data?.message || 'Failed to fetch leads');
    } finally {
      if (leadsReqId.current === myReq) setIsLoading(false);
    }
  }, [statusFilter, assignedToMe, selectedRegion, debouncedSearch]);

  const fetchInitialData = async () => {
    // Independent fetches: ek ka 403/500 doosre ka data nahi khayega.
    try {
      const empRes = await employeesApi.getAll();
      setEmployees(empRes.data.data?.employees || empRes.data.data || []);
    } catch (error) {
      console.error('Failed to fetch employees', error);
    }
    try {
      const regRes = await settingsApi.getRegions();
      setRegions(regRes.data.data?.regions || regRes.data.data || []);
    } catch (error: any) {
      // Regions endpoint admin-gated ho sakta hai — silent, list nested data se chalegi.
      if (error?.response?.status !== 403) console.error('Failed to fetch regions', error);
      setRegions([]);
    }
  };

  const fetchComments = async (leadId: string) => {
    setCommentsLoading(true);
    try {
      const response = await leadsApi.getComments(leadId);
      const data = response.data.data?.comments || response.data.data;
      setComments(Array.isArray(data) ? data : []);
    } catch { setComments([]) } finally { setCommentsLoading(false); }
  };

  useEffect(() => { fetchLeads(); }, [fetchLeads]);
  useEffect(() => { fetchInitialData(); }, []);

  const handleDeleteConfirm = async () => {
    if (!leadToDelete || deleteLoading) return;
    setDeleteLoading(true);
    try {
      const lid = leadToDelete.id;
      // 1) Linked records fetch (best-effort, independent — ek fail to baaki ruke nahi).
      const [qRes, iRes, dRes, cRes, pRes] = await Promise.allSettled([
        quotationsApi.getAll(),
        installationsApi.getAll(),
        documentsApi.getAll({ leadId: lid }),
        customersApi.getAll(),
        paymentsApi.getAll(),
      ]);
      const val = (r: any) => (r.status === 'fulfilled' ? r.value : null);
      const asList = (res: any, key: string) => {
        const d = res?.data?.data;
        const arr = d?.[key] || d;
        return Array.isArray(arr) ? arr : [];
      };
      const sameLead = (x: any) => (x.leadId || x.lead?.id) === lid;
      const quotes = asList(val(qRes), 'quotations').filter(sameLead);
      const insts = asList(val(iRes), 'installations').filter(sameLead);
      const docs = asList(val(dRes), 'documents').filter(sameLead);
      const custs = asList(val(cRes), 'customers').filter(sameLead);
      const quoteIds = new Set(quotes.map((q: any) => q.id));
      const pays = asList(val(pRes), 'payments').filter((p: any) => quoteIds.has(p.quotationId));
      // 2) Delete children jinke endpoints hain (surveys/payments ka DELETE
      // backend me nahi — wo backend cascade se remove honge).
      const dels: Array<Promise<any>> = [
        ...quotes.map((q: any) => quotationsApi.delete(q.id)),
        ...insts.map((x: any) => installationsApi.delete(x.id)),
        ...docs.map((d: any) => documentsApi.delete(d.id)),
        ...custs.map((c: any) => customersApi.delete(c.id)),
      ];
      const results = await Promise.allSettled(dels);
      const failedKids = results.filter((r) => r.status === 'rejected').length;
      // 3) Lead khud delete karo. Backend single source of truth hai — success
      // maan-ne se pehle server se fresh list lekar verify karo (local filter
      // akela kaafi nahi: backend persist na kare to lead next login par wapas
      // aa jati hai aur user ko false success dikhta hai).
      const delRes = await leadsApi.delete(lid);
      if (delRes?.data && delRes.data.success === false) {
        toast.error(delRes.data.message || 'Backend ne delete confirm nahi kiya');
        return;
      }
      setIsDeleteDialogOpen(false);
      setLeadToDelete(null);
      await fetchLeads(pagination.page);
      try {
        const verify = await leadsApi.getAll({ page: 1, limit: 100 });
        const fresh = verify.data.data;
        const list = Array.isArray(fresh?.leads) ? fresh.leads : Array.isArray(fresh) ? fresh : [];
        if (list.some((l: any) => l.id === lid)) {
          toast.warning('Delete server par save nahi hua — lead wapas dikhegi. Backend team ko bolo.');
          return;
        }
      } catch { /* refetch already done above; ignore verify failure */ }
      const removedKids = dels.length - failedKids;
      toast.success(removedKids > 0 ? `Lead + ${removedKids} linked record${removedKids > 1 ? 's' : ''} deleted` : 'Lead deleted successfully!');
      if (pays.length > 0) toast.info(`${pays.length} payment(s) backend se auto-remove honge`);
      if (failedKids > 0) toast.warning(`${failedKids} linked record(s) skip hue — backend se हटेंगे`);
    } catch (error: any) {
      const msg = error.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join(', ') : (msg || 'Failed to delete lead'));
    } finally {
      setDeleteLoading(false);
    }
  };

  const getLeadMsg = (lead: Lead) => {
    const statusMsgs: Record<string, string> = {
      DRAFT: 'Thank you for your interest in Eurosol Prime! We are reviewing your requirements and will get back to you shortly with the best solar solution.',
      NEW: 'Thank you for your interest in Eurosol Prime! We are reviewing your requirements and will get back to you shortly with the best solar solution.',
      CONTACTED: 'It was great speaking with you! We are preparing a customized solar solution tailored to your needs.',
      QUALIFIED: 'We have analyzed your requirements and have a great solar solution ready for you. Let us share the proposal.',
      SITE_VISIT: 'Our site visit is scheduled. We will assess your roof and finalize the system design on site.',
      // The old map had a 'proposal' entry, but that status does not exist in
      // the enum — its copy belonged to the quoting stage, i.e. NEGOTIATION.
      NEGOTIATION: 'Your solar proposal is ready! Please review it at your earliest convenience. We are here to answer any questions.',
      WON: 'Congratulations! Welcome to the Eurosol Prime family. We will begin the installation process shortly.',
      LOST: 'We are sorry we could not work together. If your needs change in the future, please do reach out to us.',
    };
    const key = LEAD_STATUSES.find((s) => sameStatus(lead.status, s));
    return (key && statusMsgs[key]) || 'Thank you for connecting with Eurosol Prime!';
  };

  const handleSendWhatsApp = (lead: Lead) => {
    if (!lead.phone) { toast.error('No phone number available'); return; }
    setWhatsAppLoading(lead.id);
    try {
      const msg = `Dear ${lead.name},\n\n${getLeadMsg(lead)}\n\n📋 Status: ${lead.status?.toUpperCase()}\n📅 Date: ${new Date(lead.createdAt).toLocaleDateString('en-IN')}\n\nRegards,\nEurosol Prime\n📞 +91-79-12345678`;
      window.open(`https://wa.me/${normalizePhone(lead.phone)}?text=${encodeURIComponent(msg)}`, '_blank');
    } catch { toast.error('Failed to open WhatsApp'); }
    finally { setWhatsAppLoading(null); }
  };

  const handleSendEmail = (lead: Lead) => {
    if (!lead.email) { toast.error('No email address added'); return; }
    const subject = encodeURIComponent(`Update on your inquiry - ${lead.name} - Eurosol Prime`);
    const body = encodeURIComponent(`Dear ${lead.name},\n\n${getLeadMsg(lead)}\n\nStatus: ${lead.status?.toUpperCase()}\nDate: ${new Date(lead.createdAt).toLocaleDateString('en-IN')}\n\nRegards,\nEurosol Prime\n📞 +91-79-12345678`);
    window.open(`mailto:${lead.email}?subject=${subject}&body=${body}`, '_blank');
  };

  // Lead detail (documents[] samet) refresh — DocumentManager embedded
  // mode ke onChanged se bhi yahi lagta hai.
  const refreshSelectedLead = async (id?: string) => {
    const lid = id || selectedLead?.id;
    if (!lid) return;
    try {
      const response = await leadsApi.getById(lid);
      setSelectedLead(response.data.data || response.data);
    } catch {}
  };

  const handleViewDetails = async (lead: Lead) => {
    setSelectedLead(lead);
    setIsViewDetailsOpen(true);
    setUpdateStatus(lead.status);
    refreshSelectedLead(lead.id);
    fetchComments(lead.id);
    leadsApi.getInventoryUsage(lead.id).then(r => {
      const raw = r.data.data?.items || r.data.data || [];
      setInventoryUsage(Array.isArray(raw) ? raw : []);
    }).catch(() => setInventoryUsage([]));
  };

  const handleStatusUpdate = async (newStatus: string) => {
    if (!selectedLead) return;
    try {
      await leadsApi.update(selectedLead.id, { status: newStatus });
      setSelectedLead({ ...selectedLead, status: newStatus as any });
      setLeads((prev) => prev.map(l => l.id === selectedLead.id ? { ...l, status: newStatus as any } : l));
      setUpdateStatus(newStatus);
      setIsStatusOpen(false);
      toast.success(`Status updated to ${statusLabel(newStatus)}`);
    } catch (error: any) {
      // A 400 from @IsEnum carries the legal list in `message`; show it verbatim
      // so a bad status value is diagnosable instead of a generic failure.
      if (error?.response?.status === 403) {
        toast.error('Permission nahi — admin se leads permission dilwao.');
      } else {
        toast.error(apiMessage(error, 'Failed to update status'));
      }
    }
  };

  const handleAddComment = async () => {
    if (!selectedLead || !newComment.trim()) return;
    try {
      const response = await leadsApi.addComment(selectedLead.id, { comment: newComment.trim() });
      const comment = response.data.data || response.data;
      setComments(prev => [comment, ...prev]);
      setNewComment('');
      toast.success('Comment added');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to add comment');
    }
  };

  const handleTransfer = async () => {
    if (!selectedLead || !transferOwnerId) return;
    try {
      await leadsApi.transfer(selectedLead.id, { newOwnerId: transferOwnerId, reason: transferReason });
      toast.success('Lead transferred successfully!');
      setIsTransferOpen(false);
      setTransferReason('');
      fetchComments(selectedLead.id);
      fetchLeads(pagination.page);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to transfer lead');
    }
  };

  const handleAddLead = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!addForm.name) { toast.error('Name is required'); return; }
    // Client-side duplicate check (phone/email)
    if (addForm.phone && leads.some(l => l.phone === addForm.phone)) {
      toast.error('Lead with this phone already exists');
      return;
    }
    if (addForm.email && leads.some(l => l.email === addForm.email)) {
      toast.error('Lead with this email already exists');
      return;
    }
    setAddSaving(true);
    try {
      const payload: any = { name: addForm.name };
      if (addForm.phone) payload.phone = addForm.phone;
      if (addForm.email) payload.email = addForm.email;
      if (addForm.source) payload.source = addForm.source;
      if (addForm.regionId) payload.regionId = addForm.regionId;
      if (addForm.address) payload.address = addForm.address;
      if (addForm.city) payload.city = addForm.city;
      if (addForm.state) payload.state = addForm.state;
      if (addForm.pincode) payload.pincode = addForm.pincode;
      if (addForm.notes) payload.notes = addForm.notes;
      ['bookingDate', 'nmApplicationId', 'channelPartner', 'projectCost', 'ivrsNumber', 'projectType',
       'liaisoningWork', 'liaisoningCost', 'liaisoningStage', 'googleLocation', 'sanctionedLoadKw',
       'dcCapacityKw', 'numberOfPanels', 'solarPanelBrand', 'solarPanelWp', 'inverterCapacityKw',
       'inverterBrand', 'structureSize', 'numberOfStructure', 'bookingAmount', 'finalPayment',
       'loanAmount', 'loanBankName', 'dateOfInstallation', 'dateOfCommissioning',
       'documentsHandOverDate', 'amcServices', 'tentativeInstallationDate'
      ].forEach(k => { const v = (addForm as any)[k]; if (v) payload[k] = isNaN(Number(v)) ? v : Number(v); });
      await leadsApi.create(payload);
      fetchLeads();
      setIsAddDialogOpen(false);
      setAddStep(0);
      setAddForm({ name: '', phone: '', email: '', source: '', regionId: '', address: '', city: '', state: '', pincode: '', notes: '',
        bookingDate: '', projectStage: '', nmApplicationId: '', channelPartner: '', projectCost: '', ivrsNumber: '', projectType: '',
        liaisoningWork: '', liaisoningCost: '', liaisoningStage: '', googleLocation: '', sanctionedLoadKw: '', dcCapacityKw: '',
        numberOfPanels: '', solarPanelBrand: '', solarPanelWp: '', inverterCapacityKw: '', inverterBrand: '', structureSize: '',
        numberOfStructure: '', bookingAmount: '', finalPayment: '', loanAmount: '', loanBankName: '',
        dateOfInstallation: '', dateOfCommissioning: '', documentsHandOverDate: '', amcServices: '', tentativeInstallationDate: '' });
      toast.success('Lead created successfully!');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to create lead');
    } finally { setAddSaving(false); }
  };

  const handleEditLead = async () => {
    if (!editLead) return;
    setEditSaving(true);
    try {
      const payload: any = {};
      const fields = ['name', 'phone', 'email', 'source', 'regionId', 'address', 'city', 'state', 'pincode', 'notes',
        'bookingDate', 'nmApplicationId', 'channelPartner', 'projectCost', 'ivrsNumber', 'projectType',
        'liaisoningWork', 'liaisoningCost', 'liaisoningStage', 'googleLocation', 'sanctionedLoadKw',
        'dcCapacityKw', 'numberOfPanels', 'solarPanelBrand', 'solarPanelWp', 'inverterCapacityKw',
        'inverterBrand', 'structureSize', 'numberOfStructure', 'bookingAmount', 'finalPayment',
        'loanAmount', 'loanBankName', 'dateOfInstallation', 'dateOfCommissioning',
        'documentsHandOverDate', 'amcServices', 'tentativeInstallationDate'];
      fields.forEach(k => {
        const v = editLead[k];
        if (v !== null && v !== undefined && v !== '') {
          payload[k] = typeof v === 'string' && !isNaN(Number(v)) && v.trim() !== '' ? Number(v) : v;
        }
      });
      await leadsApi.update(editLead.id, payload);
      toast.success('Lead updated successfully');
      setIsEditOpen(false);
      setEditLead(null);
      setEditStep(0);
      fetchLeads();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to update lead');
    } finally { setEditSaving(false); }
  };

  const handleBulkFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) { toast.error('File must have a header row and at least one data row'); return; }
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const data = lines.slice(1).map(line => {
        const vals = line.split(',').map(v => v.trim());
        const obj: any = {};
        headers.forEach((h, i) => obj[h] = vals[i] || '');
        return obj;
      });
      setBulkPreview(data);
    };
    reader.readAsText(file);
  };

  const handleBulkUpload = async () => {
    if (!bulkFile) { toast.error('Please select a CSV file'); return; }
    if (!bulkAllRegions && bulkRegionIds.length === 0) { toast.error('Please select at least one region'); return; }
    setBulkUploading(true);
    let success = 0, failed = 0, duplicates = 0;
    const targetRegions = bulkAllRegions ? regions.map(r => r.id) : bulkRegionIds;
    const existingPhones = new Set(leads.map(l => l.phone).filter(Boolean));
    const existingEmails = new Set(leads.map(l => l.email).filter(Boolean));
    for (const row of bulkPreview) {
      if (!row.name && !row.phone) { failed++; continue; }
      const phone = row.phone || row.mobile || row.contact;
      const email = row.email;
      if (phone && existingPhones.has(phone)) { duplicates++; failed++; continue; }
      if (email && existingEmails.has(email)) { duplicates++; failed++; continue; }
      try {
        await leadsApi.create({
          name: row.name || row.fullname || row.customer,
          phone,
          email: email || undefined,
          source: row.source || 'OTHER',
          regionId: targetRegions.length === 1 ? targetRegions[0] : undefined,
          address: row.address || undefined,
          city: row.city || undefined,
          state: row.state || undefined,
          notes: row.notes || row.note || undefined,
        });
        if (phone) existingPhones.add(phone);
        if (email) existingEmails.add(email);
        success++;
      } catch { failed++; }
    }
    toast.success(`${success} leads created${failed ? `, ${failed} failed` : ''}${duplicates ? `, ${duplicates} duplicates skipped` : ''}`);
    setIsBulkOpen(false);
    setBulkFile(null);
    setBulkPreview([]);
    setBulkUploading(false);
    fetchLeads();
  };

  // Search ab server-side (?search=) hota hai — ye sirf list ka alias hai.
  const filteredLeads = leads;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Lead Management</h1>
          <p className="text-stone-500">Track and manage your potential customers</p>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={isBulkOpen} onOpenChange={setIsBulkOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="border-stone-200">
                <Upload size={16} className="mr-2" /> Bulk Upload
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto" preventOutsideClick>
              <DialogHeader>
                <DialogTitle>Bulk Lead Upload</DialogTitle>
                <DialogDescription>Upload a CSV file with lead data. Required columns: <strong>name, phone</strong>.</DialogDescription>
              </DialogHeader>
              <div className="space-y-5 py-4">
                {/* Region Selection */}
                <div className="space-y-3 p-4 bg-stone-50 rounded-lg border">
                  <Label className="text-sm font-semibold">Assign to Regions</Label>
                  <div className="flex items-center gap-2 mb-2">
                    <Checkbox id="bulkAllRegions" checked={bulkAllRegions} onCheckedChange={c => setBulkAllRegions(!!c)} />
                    <label htmlFor="bulkAllRegions" className="text-sm cursor-pointer font-medium">All Regions</label>
                  </div>
                  {!bulkAllRegions && (
                    <div className="grid grid-cols-2 gap-2 max-h-[140px] overflow-y-auto border rounded-md bg-card p-2">
                      {regions.map(r => (
                        <label key={r.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-stone-50 p-1 rounded">
                          <Checkbox checked={bulkRegionIds.includes(r.id)} onCheckedChange={ch => setBulkRegionIds(p => ch ? [...p, r.id] : p.filter(x => x !== r.id))} />
                          {r.name}
                        </label>
                      ))}
                      {!regions.length && <span className="text-xs text-stone-400 col-span-2">No regions</span>}
                    </div>
                  )}
                </div>

                {/* File Upload */}
                <div className="space-y-3 p-4 bg-stone-50 rounded-lg border">
                  <Label className="text-sm font-semibold">CSV File</Label>
                  <div className="flex items-center gap-3">
                    <Input ref={fileInputRef} type="file" accept=".csv" onChange={handleBulkFileChange} className="flex-1" />
                  </div>
                  {bulkPreview.length > 0 && (
                    <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-xs text-green-700 flex items-center gap-2">
                      <CheckCircle2 size={14} /> {bulkPreview.length} leads parsed from file
                    </div>
                  )}
                </div>

                {/* CSV Format Hint */}
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
                  <p className="font-medium mb-1">CSV Format: </p>
                  <code className="text-[10px]">name, phone, email, source, address, city, state, notes</code>
                </div>

                {/* Preview */}
                {bulkPreview.length > 0 && (
                  <div className="max-h-[200px] overflow-y-auto border rounded-lg">
                    <table className="w-full text-xs">
                      <thead><tr className="bg-stone-100">{Object.keys(bulkPreview[0]).map(h => <th key={h} className="p-2 text-left font-medium capitalize">{h}</th>)}</tr></thead>
                      <tbody>
                        {bulkPreview.slice(0, 10).map((row, i) => (
                          <tr key={i} className="border-t border-stone-100">
                            {Object.values(row).map((v: any, j) => <td key={j} className="p-2 truncate max-w-[120px]">{v}</td>)}
                          </tr>
                        ))}
                        {bulkPreview.length > 10 && <tr className="border-t text-stone-400"><td colSpan={99} className="p-2 text-center">...and {bulkPreview.length - 10} more</td></tr>}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setIsBulkOpen(false); setBulkFile(null); setBulkPreview([]); }}>Cancel</Button>
                <Button className="bg-orange-600 hover:bg-orange-700 text-white" onClick={handleBulkUpload} disabled={!bulkFile || bulkUploading}>
                  {bulkUploading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Upload size={16} className="mr-2" />}
                  Upload {bulkPreview.length > 0 ? `${bulkPreview.length} Leads` : ''}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isAddDialogOpen} onOpenChange={o => { setIsAddDialogOpen(o); if (!o) setAddStep(0); }}>
            {hasPermission('leads', 'create') && <DialogTrigger asChild>
              <Button className="bg-orange-600 hover:bg-orange-700 text-white">
                <Plus size={18} className="mr-2" /> Add New Lead
              </Button>
            </DialogTrigger>}
            <DialogContent className="fixed inset-0 z-50 flex flex-col bg-popover rounded-none p-0 translate-x-0 translate-y-0 top-0 left-0" showCloseButton={false} preventOutsideClick>
              <div className="flex items-center justify-between p-4 border-b shrink-0">
                <div className="flex items-center gap-3">
                  <DialogTitle className="text-xl font-bold">Add New Lead</DialogTitle>
                  <button type="button" onClick={() => { setIsAddDialogOpen(false); setAddStep(0); }} className="p-1.5 rounded-md hover:bg-stone-100 text-stone-400 hover:text-stone-700"><X size={18} /></button>
                </div>
                <div className="flex items-center gap-2">
                  {[0,1,2,3,4,5].map(i => (
                    <div key={i} className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                      addStep === i ? 'bg-orange-600 text-white' : addStep > i ? 'bg-green-500 text-white' : 'bg-stone-200 text-stone-500'
                    }`}>{addStep > i ? '✓' : i + 1}</div>
                  ))}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                <form id="addLeadForm" onSubmit={handleAddLead} className="max-w-3xl mx-auto space-y-5">
                  {addStep === 0 && (
                    <div className="p-6 bg-stone-50 rounded-lg border space-y-4">
                      <h3 className="text-base font-semibold text-stone-800 flex items-center gap-2"><UserIcon size={16} /> Contact Information</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label className="text-sm font-medium">Full Name <span className="text-red-500">*</span></Label>
                          <Input value={addForm.name} onChange={e => setAddForm(p => ({ ...p, name: e.target.value }))} placeholder="John Doe" required className="h-11" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-sm font-medium">Phone Number</Label>
                          <Input value={addForm.phone} onChange={e => setAddForm(p => ({ ...p, phone: e.target.value }))} placeholder="9876543210" className="h-11" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-sm font-medium">Email Address</Label>
                          <Input value={addForm.email} onChange={e => setAddForm(p => ({ ...p, email: e.target.value }))} type="email" placeholder="john@example.com" className="h-11" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-sm font-medium">Source</Label>
                          <Select value={addForm.source} onValueChange={v => setAddForm(p => ({ ...p, source: v }))}>
                            <SelectTrigger className="h-11"><SelectValue placeholder="Select source" /></SelectTrigger>
                            <SelectContent>
                              {SOURCES.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  )}
                  {addStep === 1 && (
                    <div className="p-6 bg-stone-50 rounded-lg border space-y-4">
                      <h3 className="text-base font-semibold text-stone-800 flex items-center gap-2"><MapPin size={16} /> Location & Region</h3>
                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium">Address</Label>
                        <Input value={addForm.address} onChange={e => setAddForm(p => ({ ...p, address: e.target.value }))} placeholder="123, Street Name" className="h-11" />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1.5"><Label className="text-sm font-medium">City</Label><Input value={addForm.city} onChange={e => setAddForm(p => ({ ...p, city: e.target.value }))} placeholder="Ahmedabad" className="h-11" /></div>
                        <div className="space-y-1.5"><Label className="text-sm font-medium">State</Label><Input value={addForm.state} onChange={e => setAddForm(p => ({ ...p, state: e.target.value }))} placeholder="Gujarat" className="h-11" /></div>
                        <div className="space-y-1.5"><Label className="text-sm font-medium">Pincode</Label><Input value={addForm.pincode} onChange={e => setAddForm(p => ({ ...p, pincode: e.target.value }))} placeholder="380001" className="h-11" /></div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium">Region</Label>
                        <Select value={addForm.regionId} onValueChange={v => setAddForm(p => ({ ...p, regionId: v }))}>
                          <SelectTrigger className="h-11"><SelectValue placeholder="Select region" /></SelectTrigger>
                          <SelectContent>
                            {regions.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                  {addStep === 2 && (
                    <div className="p-6 bg-stone-50 rounded-lg border space-y-4">
                      <h3 className="text-base font-semibold text-stone-800 flex items-center gap-2"><Package size={16} /> Technical Details</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5"><Label className="text-sm font-medium">Sanctioned Load (kW)</Label><Input type="number" step="0.1" value={addForm.sanctionedLoadKw} onChange={e => setAddForm(p => ({ ...p, sanctionedLoadKw: e.target.value }))} placeholder="5" className="h-11" /></div>
                        <div className="space-y-1.5"><Label className="text-sm font-medium">DC Capacity (kW)</Label><Input type="number" step="0.1" value={addForm.dcCapacityKw} onChange={e => setAddForm(p => ({ ...p, dcCapacityKw: e.target.value }))} placeholder="5.4" className="h-11" /></div>
                        <div className="space-y-1.5"><Label className="text-sm font-medium">Number of Panels</Label><Input type="number" value={addForm.numberOfPanels} onChange={e => setAddForm(p => ({ ...p, numberOfPanels: e.target.value }))} placeholder="12" className="h-11" /></div>
                        <div className="space-y-1.5"><Label className="text-sm font-medium">Solar Panel Brand</Label><Input value={addForm.solarPanelBrand} onChange={e => setAddForm(p => ({ ...p, solarPanelBrand: e.target.value }))} placeholder="Waree" className="h-11" /></div>
                        <div className="space-y-1.5"><Label className="text-sm font-medium">Solar Panel Wp</Label><Input value={addForm.solarPanelWp} onChange={e => setAddForm(p => ({ ...p, solarPanelWp: e.target.value }))} placeholder="550W" className="h-11" /></div>
                        <div className="space-y-1.5"><Label className="text-sm font-medium">Inverter Capacity (kW)</Label><Input type="number" step="0.1" value={addForm.inverterCapacityKw} onChange={e => setAddForm(p => ({ ...p, inverterCapacityKw: e.target.value }))} placeholder="5" className="h-11" /></div>
                        <div className="space-y-1.5"><Label className="text-sm font-medium">Inverter Brand</Label><Input value={addForm.inverterBrand} onChange={e => setAddForm(p => ({ ...p, inverterBrand: e.target.value }))} placeholder="Huawei" className="h-11" /></div>
                        <div className="space-y-1.5"><Label className="text-sm font-medium">Structure Size</Label><Input value={addForm.structureSize} onChange={e => setAddForm(p => ({ ...p, structureSize: e.target.value }))} placeholder="L3" className="h-11" /></div>
                        <div className="space-y-1.5"><Label className="text-sm font-medium">Number of Structure</Label><Input type="number" value={addForm.numberOfStructure} onChange={e => setAddForm(p => ({ ...p, numberOfStructure: e.target.value }))} placeholder="6" className="h-11" /></div>
                        <div className="space-y-1.5"><Label className="text-sm font-medium">Project Type</Label><Input value={addForm.projectType} onChange={e => setAddForm(p => ({ ...p, projectType: e.target.value }))} placeholder="Rooftop, Ground Mount..." className="h-11" /></div>
                        <div className="space-y-1.5"><Label className="text-sm font-medium">NM Application ID</Label><Input value={addForm.nmApplicationId} onChange={e => setAddForm(p => ({ ...p, nmApplicationId: e.target.value }))} placeholder="NM-2025-001" className="h-11" /></div>
                        <div className="space-y-1.5"><Label className="text-sm font-medium">IVRS Number</Label><Input value={addForm.ivrsNumber} onChange={e => setAddForm(p => ({ ...p, ivrsNumber: e.target.value }))} placeholder="IVRS-123" className="h-11" /></div>
                        <div className="space-y-1.5"><Label className="text-sm font-medium">Channel Partner</Label><Input value={addForm.channelPartner} onChange={e => setAddForm(p => ({ ...p, channelPartner: e.target.value }))} placeholder="SolarWorld" className="h-11" /></div>
                      </div>
                    </div>
                  )}
                  {addStep === 3 && (
                    <div className="p-6 bg-stone-50 rounded-lg border space-y-4">
                      <h3 className="text-base font-semibold text-stone-800 flex items-center gap-2">₹ Financial Details</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5"><Label className="text-sm font-medium">Project Cost (₹)</Label><Input type="number" value={addForm.projectCost} onChange={e => setAddForm(p => ({ ...p, projectCost: e.target.value }))} placeholder="450000" className="h-11" /></div>
                        <div className="space-y-1.5"><Label className="text-sm font-medium">Booking Amount (₹)</Label><Input type="number" value={addForm.bookingAmount} onChange={e => setAddForm(p => ({ ...p, bookingAmount: e.target.value }))} placeholder="50000" className="h-11" /></div>
                        <div className="space-y-1.5"><Label className="text-sm font-medium">Final Payment (₹)</Label><Input type="number" value={addForm.finalPayment} onChange={e => setAddForm(p => ({ ...p, finalPayment: e.target.value }))} placeholder="350000" className="h-11" /></div>
                        <div className="space-y-1.5"><Label className="text-sm font-medium">Loan Amount (₹)</Label><Input type="number" value={addForm.loanAmount} onChange={e => setAddForm(p => ({ ...p, loanAmount: e.target.value }))} placeholder="200000" className="h-11" /></div>
                        <div className="space-y-1.5"><Label className="text-sm font-medium">Loan Bank Name</Label><Input value={addForm.loanBankName} onChange={e => setAddForm(p => ({ ...p, loanBankName: e.target.value }))} placeholder="SBI" className="h-11" /></div>
                        <div className="space-y-1.5"><Label className="text-sm font-medium">Liaisoning Work</Label><Input value={addForm.liaisoningWork} onChange={e => setAddForm(p => ({ ...p, liaisoningWork: e.target.value }))} placeholder="In Progress" className="h-11" /></div>
                        <div className="space-y-1.5"><Label className="text-sm font-medium">Liaisoning Cost (₹)</Label><Input type="number" value={addForm.liaisoningCost} onChange={e => setAddForm(p => ({ ...p, liaisoningCost: e.target.value }))} placeholder="5000" className="h-11" /></div>
                        <div className="space-y-1.5"><Label className="text-sm font-medium">Liaisoning Stage</Label><Input value={addForm.liaisoningStage} onChange={e => setAddForm(p => ({ ...p, liaisoningStage: e.target.value }))} placeholder="Completed" className="h-11" /></div>
                      </div>
                    </div>
                  )}
                  {addStep === 4 && (
                    <div className="p-6 bg-stone-50 rounded-lg border space-y-4">
                      <h3 className="text-base font-semibold text-stone-800 flex items-center gap-2"><Calendar size={16} /> Dates & Notes</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5"><Label className="text-sm font-medium">Booking Date</Label><Input type="date" value={addForm.bookingDate} onChange={e => setAddForm(p => ({ ...p, bookingDate: e.target.value }))} className="h-11" /></div>
                        <div className="space-y-1.5"><Label className="text-sm font-medium">Date of Installation</Label><Input type="date" value={addForm.dateOfInstallation} onChange={e => setAddForm(p => ({ ...p, dateOfInstallation: e.target.value }))} className="h-11" /></div>
                        <div className="space-y-1.5"><Label className="text-sm font-medium">Date of Commissioning</Label><Input type="date" value={addForm.dateOfCommissioning} onChange={e => setAddForm(p => ({ ...p, dateOfCommissioning: e.target.value }))} className="h-11" /></div>
                        <div className="space-y-1.5"><Label className="text-sm font-medium">Documents Handover Date</Label><Input type="date" value={addForm.documentsHandOverDate} onChange={e => setAddForm(p => ({ ...p, documentsHandOverDate: e.target.value }))} className="h-11" /></div>
                        <div className="space-y-1.5"><Label className="text-sm font-medium">Tentative Installation Date</Label><Input type="date" value={addForm.tentativeInstallationDate} onChange={e => setAddForm(p => ({ ...p, tentativeInstallationDate: e.target.value }))} className="h-11" /></div>
                        <div className="space-y-1.5"><Label className="text-sm font-medium">AMC Services</Label><Input value={addForm.amcServices} onChange={e => setAddForm(p => ({ ...p, amcServices: e.target.value }))} placeholder="AMC-2025" className="h-11" /></div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium">Project Stage</Label>
                        <Input value={addForm.projectStage} onChange={e => setAddForm(p => ({ ...p, projectStage: e.target.value }))} placeholder="Site Survey, Installation..." className="h-11" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium">Google Location URL</Label>
                        <Input value={addForm.googleLocation} onChange={e => setAddForm(p => ({ ...p, googleLocation: e.target.value }))} placeholder="https://maps.google.com/..." className="h-11" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium">Notes</Label>
                        <Textarea value={addForm.notes} onChange={e => setAddForm(p => ({ ...p, notes: e.target.value }))} placeholder="Any additional information..." className="min-h-[80px]" />
                      </div>
                    </div>
                  )}
                  {addStep === 5 && (
                    <div className="space-y-5">
                      <h3 className="text-lg font-bold text-stone-900">Preview Lead</h3>
                      <div className="border rounded-lg overflow-hidden">
                        {[
                          { label: 'Contact Info', fields: [
                            ['Full Name', addForm.name, true], ['Phone', addForm.phone], ['Email', addForm.email], ['Source', addForm.source],
                          ]},
                          { label: 'Location', fields: [
                            ['Address', addForm.address], ['City', addForm.city], ['State', addForm.state],
                            ['Pincode', addForm.pincode], ['Region', regions.find(r => r.id === addForm.regionId)?.name],
                          ]},
                          { label: 'Technical Details', fields: [
                            ['Sanctioned Load', addForm.sanctionedLoadKw ? `${addForm.sanctionedLoadKw} kW` : ''],
                            ['DC Capacity', addForm.dcCapacityKw ? `${addForm.dcCapacityKw} kW` : ''],
                            ['Panels', addForm.numberOfPanels], ['Panel Brand', addForm.solarPanelBrand],
                            ['Panel Wp', addForm.solarPanelWp], ['Inverter Capacity', addForm.inverterCapacityKw ? `${addForm.inverterCapacityKw} kW` : ''],
                            ['Inverter Brand', addForm.inverterBrand], ['Structure Size', addForm.structureSize],
                            ['No. of Structure', addForm.numberOfStructure], ['Project Type', addForm.projectType],
                            ['NM App ID', addForm.nmApplicationId], ['IVRS No.', addForm.ivrsNumber],
                            ['Channel Partner', addForm.channelPartner],
                          ]},
                          { label: 'Financial Details', fields: [
                            ['Project Cost', addForm.projectCost ? `₹${Number(addForm.projectCost).toLocaleString()}` : ''],
                            ['Booking Amount', addForm.bookingAmount ? `₹${Number(addForm.bookingAmount).toLocaleString()}` : ''],
                            ['Final Payment', addForm.finalPayment ? `₹${Number(addForm.finalPayment).toLocaleString()}` : ''],
                            ['Loan Amount', addForm.loanAmount ? `₹${Number(addForm.loanAmount).toLocaleString()}` : ''],
                            ['Loan Bank', addForm.loanBankName], ['Liaisoning Work', addForm.liaisoningWork],
                            ['Liaisoning Cost', addForm.liaisoningCost ? `₹${Number(addForm.liaisoningCost).toLocaleString()}` : ''],
                            ['Liaisoning Stage', addForm.liaisoningStage],
                          ]},
                          { label: 'Dates & Notes', fields: [
                            ['Booking Date', addForm.bookingDate], ['Installation Date', addForm.dateOfInstallation],
                            ['Commissioning Date', addForm.dateOfCommissioning], ['Doc Handover Date', addForm.documentsHandOverDate],
                            ['Tentative Install Date', addForm.tentativeInstallationDate],
                            ['AMC Services', addForm.amcServices], ['Project Stage', addForm.projectStage],
                            ['Google Location', addForm.googleLocation],
                          ]},
                        ].map(section => {
                          const hasFields = section.fields.some(([, v]) => v);
                          if (!hasFields) return null;
                          return (
                            <div key={section.label} className="border-b last:border-0">
                              <div className="px-5 py-2.5 bg-stone-50 text-sm font-semibold text-stone-700">{section.label}</div>
                              <div className="px-5 py-2 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                                {section.fields.map(([label, val]) => val ? (
                                  <div key={label} className="flex justify-between border-b border-stone-100 py-1">
                                    <span className="text-stone-500">{label}</span>
                                    <span className="font-medium text-stone-900">{val}</span>
                                  </div>
                                ) : null)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {!addForm.name && (
                        <p className="text-sm text-amber-600 flex items-center gap-1"><AlertCircle size={14} /> Name is required — will be saved as DRAFT.</p>
                      )}
                    </div>
                  )}
                </form>
              </div>
              <div className="flex items-center justify-between p-4 border-t shrink-0 bg-card">
                <Button type="button" variant="outline" onClick={() => { if (addStep === 0) setIsAddDialogOpen(false); else setAddStep(s => s - 1); }}>
                  {addStep === 0 ? 'Cancel' : 'Previous'}
                </Button>
                <div className="flex gap-2">
                  {addStep < 5 ? (
                    <Button type="button" className="bg-orange-600 hover:bg-orange-700 text-white" onClick={() => {
                      if (addStep === 0 && !addForm.name) { toast.error('Name is required'); return; }
                      setAddStep(s => s + 1);
                    }}>
                      Next
                    </Button>
                  ) : (
                    <Button type="submit" form="addLeadForm" className="bg-orange-600 hover:bg-orange-700 text-white" disabled={addSaving}>
                      {addSaving ? <Loader2 size={16} className="mr-2 animate-spin" /> : null}
                      Save as DRAFT
                    </Button>
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters + Table */}
      <Card className="border-stone-200 shadow-sm">
        <CardHeader className="p-4 border-b border-stone-100 bg-stone-50/50">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
              <Input placeholder="Search by name, ID or phone..." className="pl-10 h-10" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <input type="checkbox" id="myLeads" checked={assignedToMe} onChange={e => setAssignedToMe(e.target.checked)} className="rounded" />
                <label htmlFor="myLeads" className="text-sm text-stone-600 cursor-pointer">My Leads</label>
              </div>
              <Filter size={16} className="text-stone-400" />
              <Select value={selectedRegion} onValueChange={setSelectedRegion}>
                <SelectTrigger className="w-[160px] h-10"><SelectValue placeholder="All Regions" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Regions</SelectItem>
                  {(allRegions.length > 0 ? allRegions : regions).map(r => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); }}>
                <SelectTrigger className="w-[160px] h-10"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {/* Status shortcut tabs — default New. Ye statusFilter ka hi shortcut
              hai; dropdown se koi aur status chunne par koi tab highlight nahi hoga. */}
          <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-stone-100 overflow-x-auto">
            {LEAD_TABS.map(tab => {
              const active = statusFilter === tab.status;
              return (
                <button
                  key={tab.key}
                  type="button"
                  title={(tab as any).title || `${tab.label} leads`}
                  onClick={() => setStatusFilter(tab.status)}
                  className={cn(
                    'h-8 px-4 rounded-full text-sm font-medium whitespace-nowrap transition-colors border',
                    active
                      ? 'bg-orange-600 text-white border-orange-600 shadow-sm shadow-orange-200'
                      : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50 hover:text-stone-900'
                  )}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-stone-50">
                  <TableHead className="w-[90px]">Lead ID</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assigned To</TableHead>
                  <TableHead>Created At</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={8} className="h-64 text-center"><Loader2 size={48} className="mx-auto mb-4 animate-spin opacity-20" /><p className="text-lg font-medium text-stone-400">Loading leads...</p></TableCell></TableRow>
                ) : filteredLeads.length > 0 ? (
                  filteredLeads.map(lead => (
                    <TableRow key={lead.id} className="group cursor-pointer hover:bg-stone-50/80" onClick={() => handleViewDetails(lead)}>
                      <TableCell className="font-mono text-xs text-stone-500">{(lead.id || '').substring(0, 8)}</TableCell>
                      <TableCell>
                        <span className="font-semibold text-stone-900">{lead.name}</span>
                        <span className="text-xs text-stone-400 block">{lead.city ? `${lead.city}${lead.state ? `, ${lead.state}` : ''}` : ''}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm flex items-center gap-1 text-stone-600"><Phone size={12} />{lead.phone}</span>
                        {lead.email && <span className="text-xs text-stone-400 block">{lead.email}</span>}
                      </TableCell>
<TableCell><Badge variant="outline" className="font-normal">{lead.region?.name || (lead.regionId && regions.find(r => r.id === lead.regionId)?.name) || '—'}</Badge></TableCell>
                      <TableCell><Badge className={cn("font-medium capitalize", getStatusBadgeClass(lead.status))}>{lead.status}</Badge></TableCell>
                      <TableCell>
                        <span className="text-sm text-stone-700">{lead.owner?.name || 'Unassigned'}</span>
                      </TableCell>
                      <TableCell className="text-stone-500 text-sm">{new Date(lead.createdAt || Date.now()).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-50 disabled:opacity-40" onClick={() => handleSendWhatsApp(lead)} disabled={whatsAppLoading === lead.id} title={lead.phone ? "Send WhatsApp" : "No phone"}>
                            {whatsAppLoading === lead.id ? <Loader2 size={14} className="animate-spin" /> : <MessageCircle size={14} />}
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50 disabled:opacity-40" onClick={() => handleSendEmail(lead)} disabled={!lead.email} title={lead.email ? "Send Email" : "No email added"}>
                            <Send size={14} />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "h-8 w-8")}><MoreVertical size={18} /></DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuItem className="cursor-pointer" onClick={() => handleViewDetails(lead)}><ChevronRight size={14} className="mr-2" /> View Details</DropdownMenuItem>
                              {hasPermission('leads', 'update') && <DropdownMenuItem className="cursor-pointer" onClick={() => { setSelectedLead(lead); setUpdateStatus(lead.status); setIsStatusOpen(true); }}><CheckCircle2 size={14} className="mr-2 text-blue-500" /> Change Status</DropdownMenuItem>}
                              {hasPermission('leads', 'update') && <DropdownMenuItem className="cursor-pointer" onClick={() => { const d = (v: any) => toDateInputValue(v) || ''; setEditLead({ ...lead, bookingDate: d((lead as any).bookingDate), dateOfInstallation: d((lead as any).dateOfInstallation), dateOfCommissioning: d((lead as any).dateOfCommissioning), documentsHandOverDate: d((lead as any).documentsHandOverDate), tentativeInstallationDate: d((lead as any).tentativeInstallationDate) }); setIsEditOpen(true); }}><Edit3 size={14} className="mr-2" /> Edit</DropdownMenuItem>}
                              <DropdownMenuItem className="cursor-pointer" onClick={() => handleSendWhatsApp(lead)} disabled={!lead.phone}><MessageCircle size={14} className="mr-2 text-green-500" /> {lead.phone ? 'WhatsApp' : 'No phone'}</DropdownMenuItem>
                              <DropdownMenuItem className="cursor-pointer" onClick={() => handleSendEmail(lead)} disabled={!lead.email}><Send size={14} className="mr-2 text-blue-500" /> {lead.email ? 'Email' : 'No email'}</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="cursor-pointer" onClick={() => { setSelectedLead(lead); setTransferOwnerId(lead.owner?.id || ''); setIsTransferOpen(true); }}><ArrowLeftRight size={14} className="mr-2" /> Transfer</DropdownMenuItem>
                              {canScheduleSurvey && sameStatus(lead.status, 'QUALIFIED') && (
                                <DropdownMenuItem className="cursor-pointer" onClick={() => { setSurveyLead(lead); setSurveyEngineerId(''); setSurveyDate(toLocalDateKey()); setSurveyNotes(''); }}>
                                  <Calendar size={14} className="mr-2 text-orange-500" /> Schedule Survey
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              {hasPermission('leads', 'delete') && <DropdownMenuItem className="text-red-600 cursor-pointer" onClick={() => { setLeadToDelete(lead); setIsDeleteDialogOpen(true); }}>Delete</DropdownMenuItem>}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow><TableCell colSpan={8} className="h-64 text-center"><Users size={48} className="mx-auto mb-4 opacity-20" /><p className="text-lg font-medium text-stone-400">No leads found</p></TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex items-center justify-between text-sm text-stone-500">
          <span>Page {pagination.page} of {pagination.pages} ({pagination.total} total)</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={pagination.page <= 1} onClick={() => fetchLeads(pagination.page - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={pagination.page >= pagination.pages} onClick={() => fetchLeads(pagination.page + 1)}>Next</Button>
          </div>
        </div>
      )}

      {/* Change Status Dialog */}
      <Dialog open={isStatusOpen} onOpenChange={setIsStatusOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Change Status</DialogTitle><DialogDescription>Update status for <span className="font-semibold">{selectedLead?.name}</span>.</DialogDescription></DialogHeader>
          <div className="py-4">
            <Label>Status</Label>
            <Select value={updateStatus} onValueChange={handleStatusUpdate}>
              <SelectTrigger className="w-full mt-2"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setIsStatusOpen(false)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Confirm Deletion</DialogTitle><DialogDescription>Delete lead <span className="font-semibold">{leadToDelete?.name}</span> along with its quotations, installations, documents & customer? This cannot be undone.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} disabled={deleteLoading}>Cancel</Button><Button variant="destructive" onClick={handleDeleteConfirm} disabled={deleteLoading}>{deleteLoading ? <Loader2 size={16} className="mr-2 animate-spin" /> : null}Delete</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lead Detail Dialog */}
      <Dialog open={isViewDetailsOpen} onOpenChange={setIsViewDetailsOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <span>{selectedLead?.name}</span>
              {selectedLead && <Badge className={cn("capitalize", getStatusBadgeClass(selectedLead.status))}>{selectedLead.status}</Badge>}
            </DialogTitle>
          </DialogHeader>

          {selectedLead && (
            <div className="space-y-6 py-4">
              <div className="flex items-center gap-3 p-3 bg-stone-50 rounded-lg border">
                <span className="text-sm font-medium text-stone-600">Update Status:</span>
                <Select value={updateStatus} onValueChange={handleStatusUpdate}>
                  <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 p-4 bg-stone-50 rounded-lg border text-sm">
                  <h3 className="font-semibold text-stone-900 border-b pb-1 mb-2">Contact</h3>
                  <div className="flex items-center gap-2"><Phone size={14} className="text-stone-400" /><span>{selectedLead.phone}</span>
                    <button onClick={() => handleSendWhatsApp(selectedLead)} className="ml-auto text-green-600 hover:text-green-700 p-1 rounded hover:bg-green-50" title="Send WhatsApp"><MessageCircle size={16} /></button>
                  </div>
                  <div className="flex items-center gap-2"><Mail size={14} className="text-stone-400" /><span>{selectedLead.email || '—'}</span>
                    {selectedLead.email && <button onClick={() => handleSendEmail(selectedLead)} className="ml-auto text-blue-600 hover:text-blue-700 p-1 rounded hover:bg-blue-50" title="Send Email"><Send size={16} /></button>}
                  </div>
                </div>
                <div className="space-y-2 p-4 bg-stone-50 rounded-lg border text-sm">
                  <h3 className="font-semibold text-stone-900 border-b pb-1 mb-2">Assignment</h3>
                  <div className="flex justify-between"><span className="text-stone-500">Owner:</span><span className="font-medium">{selectedLead.owner?.name || 'Unassigned'}</span></div>
                  <div className="flex justify-between"><span className="text-stone-500">Region:</span><span className="font-medium">{selectedLead.region?.name || (selectedLead.regionId && regions.find(r => r.id === selectedLead.regionId)?.name) || '—'}</span></div>
                  <div className="flex justify-between"><span className="text-stone-500">Source:</span><span className="font-medium">{selectedLead.source}</span></div>
                </div>
              </div>

              {(selectedLead.address || selectedLead.city) && (
                <div className="p-4 bg-stone-50 rounded-lg border text-sm">
                  <h3 className="font-semibold text-stone-900 border-b pb-1 mb-2">Address</h3>
                  <p>{selectedLead.address}{selectedLead.city ? `, ${selectedLead.city}` : ''}{selectedLead.state ? `, ${selectedLead.state}` : ''}{selectedLead.pincode ? ` - ${selectedLead.pincode}` : ''}</p>
                </div>
              )}

              {selectedLead.notes && (
                <div className="p-4 bg-stone-50 rounded-lg border text-sm">
                  <h3 className="font-semibold text-stone-900 border-b pb-1 mb-2">Notes</h3>
                  <p className="text-stone-700">{selectedLead.notes}</p>
                </div>
              )}

              {[
                ['Booking Date', 'bookingDate'], ['Project Stage', 'projectStage'], ['NM Application ID', 'nmApplicationId'],
                ['Channel Partner', 'channelPartner'], ['Project Cost', 'projectCost'], ['IVRS Number', 'ivrsNumber'],
                ['Project Type', 'projectType'], ['Liaisoning Work', 'liaisoningWork'], ['Liaisoning Cost', 'liaisoningCost'],
                ['Liaisoning Stage', 'liaisoningStage'], ['Sanctioned Load', 'sanctionedLoadKw', 'kW'],
                ['DC Capacity', 'dcCapacityKw', 'kW'], ['Panels', 'numberOfPanels'], ['Panel Brand', 'solarPanelBrand'],
                ['Panel Wp', 'solarPanelWp'], ['Inverter Capacity', 'inverterCapacityKw', 'kW'],
                ['Inverter Brand', 'inverterBrand'], ['Structure Size', 'structureSize'],
                ['No. of Structure', 'numberOfStructure'], ['Booking Amount', 'bookingAmount', '₹'],
                ['Final Payment', 'finalPayment', '₹'], ['Loan Amount', 'loanAmount', '₹'],
                ['Loan Bank', 'loanBankName'], ['Installation Date', 'dateOfInstallation'],
                ['Commissioning Date', 'dateOfCommissioning'], ['Doc Handover Date', 'documentsHandOverDate'],
                ['AMC Services', 'amcServices'], ['Tentative Install Date', 'tentativeInstallationDate'],
                ['Google Location', 'googleLocation']
              ].filter(([_, k]) => (selectedLead as any)[k]).length > 0 && (
                <div className="border rounded-lg">
                  <div className="p-4 border-b bg-stone-50">
                    <h3 className="font-semibold text-stone-900">Technical & Financial Details</h3>
                  </div>
                  <div className="p-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    {[
                      ['Booking Date', 'bookingDate'], ['Project Stage', 'projectStage'], ['NM Application ID', 'nmApplicationId'],
                      ['Channel Partner', 'channelPartner'], ['Project Cost', 'projectCost', '₹'], ['IVRS Number', 'ivrsNumber'],
                      ['Project Type', 'projectType'], ['Liaisoning Work', 'liaisoningWork'], ['Liaisoning Cost', 'liaisoningCost', '₹'],
                      ['Liaisoning Stage', 'liaisoningStage'], ['Sanctioned Load', 'sanctionedLoadKw', 'kW'],
                      ['DC Capacity', 'dcCapacityKw', 'kW'], ['Panels', 'numberOfPanels'], ['Panel Brand', 'solarPanelBrand'],
                      ['Panel Wp', 'solarPanelWp'], ['Inverter Capacity', 'inverterCapacityKw', 'kW'],
                      ['Inverter Brand', 'inverterBrand'], ['Structure Size', 'structureSize'],
                      ['No. of Structure', 'numberOfStructure'], ['Booking Amount', 'bookingAmount', '₹'],
                      ['Final Payment', 'finalPayment', '₹'], ['Loan Amount', 'loanAmount', '₹'],
                      ['Loan Bank', 'loanBankName'], ['Installation Date', 'dateOfInstallation'],
                      ['Commissioning Date', 'dateOfCommissioning'], ['Doc Handover Date', 'documentsHandOverDate'],
                      ['AMC Services', 'amcServices'], ['Tentative Install Date', 'tentativeInstallationDate'],
                      ['Google Location', 'googleLocation']
                    ].map(([label, key, prefix]) => {
                      const val = (selectedLead as any)[key];
                      if (!val) return null;
                      return (
                        <div key={key} className="flex justify-between border-b border-stone-100 py-1.5">
                          <span className="text-stone-500">{label}</span>
                          <span className="font-medium text-stone-900">{prefix === '₹' ? `₹${Number(val).toLocaleString()}` : prefix ? `${val} ${prefix}` : val}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {inventoryUsage.length > 0 && (
                <div className="border rounded-lg">
                  <div className="p-4 border-b bg-stone-50">
                    <h3 className="font-semibold text-stone-900 flex items-center gap-2"><Package size={16} /> Inventory Usage</h3>
                  </div>
                  <div className="p-4 space-y-3">
                    {inventoryUsage.map((u: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                        <div>
                          <span className="font-medium text-stone-900">{u.itemName}</span>
                          <span className="text-stone-500 ml-2">{u.brand}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-semibold text-stone-900">{u.quantity} × ₹{u.unitPrice?.toLocaleString()}</span>
                          <span className="text-stone-500 ml-2">= ₹{u.totalPrice?.toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-between text-sm font-bold border-t pt-2 mt-2">
                      <span>Total Used Value</span>
                      <span>₹{inventoryUsage.reduce((s: number, u: any) => s + (u.totalPrice || 0), 0).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <Button variant="outline" onClick={() => { setTransferOwnerId(selectedLead.owner?.id || ''); setIsTransferOpen(true); }} className="gap-2">
                  <ArrowLeftRight size={14} /> Transfer Lead
                </Button>
              </div>

              {/* Lead-stage documents — leadId filter wali list (section 1). 360 wali embedded list Customers page par hai. */}
              <div className="border rounded-lg">
                <div className="p-4 border-b bg-stone-50">
                  <h3 className="font-semibold text-stone-900 flex items-center gap-2"><Package size={16} /> Documents</h3>
                  <p className="text-[11px] text-stone-400 mt-0.5">fileUrl hi preview/download link hai · verify par Customer docVerifyStatus auto-sync hota hai</p>
                </div>
                <div className="p-4">
                  {/* Lead detail API me documents[] aata hai — embedded mode me
                      alag documents hit nahi hota; verify/delete par detail refresh. */}
                  <DocumentManager leadId={selectedLead.id} defaultDocType="KYC" compact embedded initialDocs={(selectedLead as any)?.documents} onChanged={refreshSelectedLead} />
                </div>
              </div>

              <div className="border rounded-lg">
                <div className="p-4 border-b bg-stone-50">
                  <h3 className="font-semibold text-stone-900 flex items-center gap-2"><MessageSquare size={16} /> Timeline</h3>
                </div>
                <div className="p-4 border-b">
                  <div className="flex gap-2">
                    <Input value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="Type a comment..." className="flex-1" onKeyDown={e => e.key === 'Enter' && handleAddComment()} />
                    <Button size="icon" onClick={handleAddComment} disabled={!newComment.trim()}><Send size={16} /></Button>
                  </div>
                </div>
                <div className="max-h-64 overflow-y-auto p-4 space-y-3">
                  {commentsLoading ? (
                    <Loader2 size={20} className="mx-auto animate-spin text-stone-300" />
                  ) : comments.length === 0 ? (
                    <p className="text-sm text-stone-400 text-center py-4">No comments yet</p>
                  ) : (
                    comments.map(c => (
                      <div key={c.id} className="flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-xs font-bold text-orange-700 flex-shrink-0">
                          {(c.user?.name || '?').charAt(0)}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm">{c.user?.name}</span>
                            <span className="text-[10px] text-stone-400">{c.user?.role}</span>
                            <span className="text-[10px] text-stone-400 ml-auto">{new Date(c.createdAt).toLocaleString()}</span>
                          </div>
                          <p className="text-sm text-stone-700 mt-1">{c.comment}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="text-right">
                <Button onClick={() => setIsViewDetailsOpen(false)} className="bg-orange-600 hover:bg-orange-700 text-white">Close</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Transfer Dialog */}
      <Dialog open={isTransferOpen} onOpenChange={setIsTransferOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Transfer Lead</DialogTitle><DialogDescription>Transfer <span className="font-semibold">{selectedLead?.name}</span> to another executive.</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>New Owner</Label>
              <Select value={transferOwnerId} onValueChange={setTransferOwnerId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select executive" /></SelectTrigger>
                <SelectContent>
                  {employees.filter(u => ['SALES_EXECUTIVE', 'ADMIN', 'MANAGER'].includes(u.role)).map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.name} ({u.role.replace(/_/g, ' ')})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Input value={transferReason} onChange={e => setTransferReason(e.target.value)} placeholder="e.g. Regional assignment" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTransferOpen(false)}>Cancel</Button>
            <Button className="bg-orange-600 hover:bg-orange-700 text-white" onClick={handleTransfer} disabled={!transferOwnerId}>Transfer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule Survey Dialog (SCREEN 1) — lead pre-selected with zone */}
      <Dialog open={!!surveyLead} onOpenChange={o => { if (!o) setSurveyLead(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Schedule Survey</DialogTitle><DialogDescription>Site survey schedule karo — success par lead SITE_VISIT me move hoga.</DialogDescription></DialogHeader>
          {surveyLead && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-orange-50 border border-orange-100 px-4 py-3 text-sm space-y-1">
                <p className="font-bold text-stone-900">{surveyLead.name}</p>
                <p className="text-stone-600 text-xs">{surveyLead.phone || 'No phone'}{surveyLead.city ? ` · ${surveyLead.city}` : ''}</p>
                <p className="text-xs"><span className="text-stone-500">Zone:</span> <span className="font-semibold text-orange-700">{surveyLead.region?.name || (surveyLead.regionId && regions.find(r => r.id === surveyLead.regionId)?.name) || '—'}</span></p>
              </div>
              <div className="space-y-2">
                <Label>Engineer</Label>
                <Select value={surveyEngineerId} onValueChange={setSurveyEngineerId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select engineer" /></SelectTrigger>
                  <SelectContent>
                    {surveyEngineers.map(e => <SelectItem key={e.id} value={e.id}>{e.name} ({String(e.role || '').replace(/_/g, ' ')})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Scheduled Date</Label>
                <Input type="date" value={surveyDate} onChange={e => setSurveyDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea value={surveyNotes} onChange={e => setSurveyNotes(e.target.value)} placeholder="Site notes..." rows={2} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSurveyLead(null)}>Cancel</Button>
            <Button className="bg-orange-600 hover:bg-orange-700 text-white" onClick={handleScheduleSurvey} disabled={surveySaving || !surveyEngineerId || !surveyDate}>{surveySaving ? 'Scheduling...' : 'Schedule Survey'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Lead Modal — Full Screen Multi-Step */}
      <Dialog open={isEditOpen} onOpenChange={o => { setIsEditOpen(o); if (!o) { setEditLead(null); setEditStep(0); } }}>
        <DialogContent className="fixed inset-0 z-50 flex flex-col bg-popover rounded-none p-0 translate-x-0 translate-y-0 top-0 left-0" showCloseButton={false}>
          <div className="flex items-center justify-between p-4 border-b shrink-0">
            <div className="flex items-center gap-3">
              <DialogTitle className="text-xl font-bold">Edit Lead {editLead && `- ${editLead.name}`}</DialogTitle>
              <button type="button" onClick={() => { setIsEditOpen(false); setEditLead(null); setEditStep(0); }} className="p-1.5 rounded-md hover:bg-stone-100 text-stone-400 hover:text-stone-700"><X size={18} /></button>
            </div>
            <div className="flex items-center gap-2">
              {[0,1,2,3,4,5].map(i => (
                <div key={i} className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  editStep === i ? 'bg-orange-600 text-white' : editStep > i ? 'bg-green-500 text-white' : 'bg-stone-200 text-stone-500'
                }`}>{editStep > i ? '✓' : i + 1}</div>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            {editLead && (
              <div className="max-w-3xl mx-auto space-y-5">
                {editStep === 0 && (
                  <div className="p-6 bg-stone-50 rounded-lg border space-y-4">
                    <h3 className="text-base font-semibold text-stone-800 flex items-center gap-2"><UserIcon size={16} /> Contact Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5"><Label className="text-sm font-medium">Name <span className="text-red-500">*</span></Label><Input value={editLead.name} onChange={e => setEditLead({ ...editLead, name: e.target.value })} className="h-11" /></div>
                      <div className="space-y-1.5"><Label className="text-sm font-medium">Phone</Label><Input value={editLead.phone || ''} onChange={e => setEditLead({ ...editLead, phone: e.target.value })} className="h-11" /></div>
                      <div className="space-y-1.5"><Label className="text-sm font-medium">Email</Label><Input value={editLead.email || ''} onChange={e => setEditLead({ ...editLead, email: e.target.value })} className="h-11" /></div>
                      <div className="space-y-1.5"><Label className="text-sm font-medium">Source</Label>
                        <Select value={editLead.source || ''} onValueChange={v => setEditLead({ ...editLead, source: v })}>
                          <SelectTrigger className="h-11"><SelectValue placeholder="Select source" /></SelectTrigger>
                          <SelectContent>{SOURCES.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}
                {editStep === 1 && (
                  <div className="p-6 bg-stone-50 rounded-lg border space-y-4">
                    <h3 className="text-base font-semibold text-stone-800 flex items-center gap-2"><MapPin size={16} /> Location & Region</h3>
                    <div className="space-y-1.5"><Label className="text-sm font-medium">Address</Label><Input value={editLead.address || ''} onChange={e => setEditLead({ ...editLead, address: e.target.value })} className="h-11" /></div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-1.5"><Label className="text-sm font-medium">City</Label><Input value={editLead.city || ''} onChange={e => setEditLead({ ...editLead, city: e.target.value })} className="h-11" /></div>
                      <div className="space-y-1.5"><Label className="text-sm font-medium">State</Label><Input value={editLead.state || ''} onChange={e => setEditLead({ ...editLead, state: e.target.value })} className="h-11" /></div>
                      <div className="space-y-1.5"><Label className="text-sm font-medium">Pincode</Label><Input value={editLead.pincode || ''} onChange={e => setEditLead({ ...editLead, pincode: e.target.value })} className="h-11" /></div>
                    </div>
                    <div className="space-y-1.5"><Label className="text-sm font-medium">Region</Label>
                      <Select value={editLead.regionId || ''} onValueChange={v => setEditLead({ ...editLead, regionId: v })}>
                        <SelectTrigger className="h-11"><SelectValue placeholder="Select region" /></SelectTrigger>
                        <SelectContent>{regions.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
                {editStep === 2 && (
                  <div className="p-6 bg-stone-50 rounded-lg border space-y-4">
                    <h3 className="text-base font-semibold text-stone-800 flex items-center gap-2"><Package size={16} /> Technical Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5"><Label className="text-sm font-medium">Sanctioned Load (kW)</Label><Input type="number" step="0.1" value={editLead.sanctionedLoadKw || ''} onChange={e => setEditLead({ ...editLead, sanctionedLoadKw: e.target.value })} className="h-11" /></div>
                      <div className="space-y-1.5"><Label className="text-sm font-medium">DC Capacity (kW)</Label><Input type="number" step="0.1" value={editLead.dcCapacityKw || ''} onChange={e => setEditLead({ ...editLead, dcCapacityKw: e.target.value })} className="h-11" /></div>
                      <div className="space-y-1.5"><Label className="text-sm font-medium">Number of Panels</Label><Input type="number" value={editLead.numberOfPanels || ''} onChange={e => setEditLead({ ...editLead, numberOfPanels: e.target.value })} className="h-11" /></div>
                      <div className="space-y-1.5"><Label className="text-sm font-medium">Solar Panel Brand</Label><Input value={editLead.solarPanelBrand || ''} onChange={e => setEditLead({ ...editLead, solarPanelBrand: e.target.value })} className="h-11" /></div>
                      <div className="space-y-1.5"><Label className="text-sm font-medium">Solar Panel Wp</Label><Input value={editLead.solarPanelWp || ''} onChange={e => setEditLead({ ...editLead, solarPanelWp: e.target.value })} className="h-11" /></div>
                      <div className="space-y-1.5"><Label className="text-sm font-medium">Inverter Capacity (kW)</Label><Input type="number" step="0.1" value={editLead.inverterCapacityKw || ''} onChange={e => setEditLead({ ...editLead, inverterCapacityKw: e.target.value })} className="h-11" /></div>
                      <div className="space-y-1.5"><Label className="text-sm font-medium">Inverter Brand</Label><Input value={editLead.inverterBrand || ''} onChange={e => setEditLead({ ...editLead, inverterBrand: e.target.value })} className="h-11" /></div>
                      <div className="space-y-1.5"><Label className="text-sm font-medium">Structure Size</Label><Input value={editLead.structureSize || ''} onChange={e => setEditLead({ ...editLead, structureSize: e.target.value })} className="h-11" /></div>
                      <div className="space-y-1.5"><Label className="text-sm font-medium">Number of Structure</Label><Input type="number" value={editLead.numberOfStructure || ''} onChange={e => setEditLead({ ...editLead, numberOfStructure: e.target.value })} className="h-11" /></div>
                      <div className="space-y-1.5"><Label className="text-sm font-medium">Project Type</Label><Input value={editLead.projectType || ''} onChange={e => setEditLead({ ...editLead, projectType: e.target.value })} className="h-11" /></div>
                      <div className="space-y-1.5"><Label className="text-sm font-medium">NM Application ID</Label><Input value={editLead.nmApplicationId || ''} onChange={e => setEditLead({ ...editLead, nmApplicationId: e.target.value })} className="h-11" /></div>
                      <div className="space-y-1.5"><Label className="text-sm font-medium">IVRS Number</Label><Input value={editLead.ivrsNumber || ''} onChange={e => setEditLead({ ...editLead, ivrsNumber: e.target.value })} className="h-11" /></div>
                      <div className="space-y-1.5"><Label className="text-sm font-medium">Channel Partner</Label><Input value={editLead.channelPartner || ''} onChange={e => setEditLead({ ...editLead, channelPartner: e.target.value })} className="h-11" /></div>
                    </div>
                  </div>
                )}
                {editStep === 3 && (
                  <div className="p-6 bg-stone-50 rounded-lg border space-y-4">
                    <h3 className="text-base font-semibold text-stone-800 flex items-center gap-2">₹ Financial Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5"><Label className="text-sm font-medium">Project Cost (₹)</Label><Input type="number" value={editLead.projectCost || ''} onChange={e => setEditLead({ ...editLead, projectCost: e.target.value })} className="h-11" /></div>
                      <div className="space-y-1.5"><Label className="text-sm font-medium">Booking Amount (₹)</Label><Input type="number" value={editLead.bookingAmount || ''} onChange={e => setEditLead({ ...editLead, bookingAmount: e.target.value })} className="h-11" /></div>
                      <div className="space-y-1.5"><Label className="text-sm font-medium">Final Payment (₹)</Label><Input type="number" value={editLead.finalPayment || ''} onChange={e => setEditLead({ ...editLead, finalPayment: e.target.value })} className="h-11" /></div>
                      <div className="space-y-1.5"><Label className="text-sm font-medium">Loan Amount (₹)</Label><Input type="number" value={editLead.loanAmount || ''} onChange={e => setEditLead({ ...editLead, loanAmount: e.target.value })} className="h-11" /></div>
                      <div className="space-y-1.5"><Label className="text-sm font-medium">Loan Bank Name</Label><Input value={editLead.loanBankName || ''} onChange={e => setEditLead({ ...editLead, loanBankName: e.target.value })} className="h-11" /></div>
                      <div className="space-y-1.5"><Label className="text-sm font-medium">Liaisoning Work</Label><Input value={editLead.liaisoningWork || ''} onChange={e => setEditLead({ ...editLead, liaisoningWork: e.target.value })} className="h-11" /></div>
                      <div className="space-y-1.5"><Label className="text-sm font-medium">Liaisoning Cost (₹)</Label><Input type="number" value={editLead.liaisoningCost || ''} onChange={e => setEditLead({ ...editLead, liaisoningCost: e.target.value })} className="h-11" /></div>
                      <div className="space-y-1.5"><Label className="text-sm font-medium">Liaisoning Stage</Label><Input value={editLead.liaisoningStage || ''} onChange={e => setEditLead({ ...editLead, liaisoningStage: e.target.value })} className="h-11" /></div>
                    </div>
                  </div>
                )}
                {editStep === 4 && (
                  <div className="p-6 bg-stone-50 rounded-lg border space-y-4">
                    <h3 className="text-base font-semibold text-stone-800 flex items-center gap-2"><Calendar size={16} /> Dates & Notes</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5"><Label className="text-sm font-medium">Booking Date</Label><Input type="date" value={editLead.bookingDate || ''} onChange={e => setEditLead({ ...editLead, bookingDate: e.target.value })} className="h-11" /></div>
                      <div className="space-y-1.5"><Label className="text-sm font-medium">Date of Installation</Label><Input type="date" value={editLead.dateOfInstallation || ''} onChange={e => setEditLead({ ...editLead, dateOfInstallation: e.target.value })} className="h-11" /></div>
                      <div className="space-y-1.5"><Label className="text-sm font-medium">Date of Commissioning</Label><Input type="date" value={editLead.dateOfCommissioning || ''} onChange={e => setEditLead({ ...editLead, dateOfCommissioning: e.target.value })} className="h-11" /></div>
                      <div className="space-y-1.5"><Label className="text-sm font-medium">Documents Handover Date</Label><Input type="date" value={editLead.documentsHandOverDate || ''} onChange={e => setEditLead({ ...editLead, documentsHandOverDate: e.target.value })} className="h-11" /></div>
                      <div className="space-y-1.5"><Label className="text-sm font-medium">Tentative Installation Date</Label><Input type="date" value={editLead.tentativeInstallationDate || ''} onChange={e => setEditLead({ ...editLead, tentativeInstallationDate: e.target.value })} className="h-11" /></div>
                      <div className="space-y-1.5"><Label className="text-sm font-medium">AMC Services</Label><Input value={editLead.amcServices || ''} onChange={e => setEditLead({ ...editLead, amcServices: e.target.value })} className="h-11" /></div>
                    </div>
                    <div className="space-y-1.5"><Label className="text-sm font-medium">Project Stage</Label><Input value={editLead.projectStage || ''} onChange={e => setEditLead({ ...editLead, projectStage: e.target.value })} className="h-11" /></div>
                    <div className="space-y-1.5"><Label className="text-sm font-medium">Google Location URL</Label><Input value={editLead.googleLocation || ''} onChange={e => setEditLead({ ...editLead, googleLocation: e.target.value })} className="h-11" /></div>
                    <div className="space-y-1.5"><Label className="text-sm font-medium">Notes</Label><Textarea value={editLead.notes || ''} onChange={e => setEditLead({ ...editLead, notes: e.target.value })} className="min-h-[80px]" /></div>
                  </div>
                )}
                {editStep === 5 && (
                  <div className="space-y-5">
                    <h3 className="text-lg font-bold text-stone-900">Preview Changes</h3>
                    <div className="border rounded-lg overflow-hidden">
                      {[
                        { label: 'Contact Info', fields: [
                          ['Full Name', editLead.name, true], ['Phone', editLead.phone], ['Email', editLead.email], ['Source', editLead.source],
                        ]},
                        { label: 'Location', fields: [
                          ['Address', editLead.address], ['City', editLead.city], ['State', editLead.state],
                          ['Pincode', editLead.pincode], ['Region', editLead.regionId ? (regions.find(r => r.id === editLead.regionId)?.name || editLead.regionId) : ''],
                        ]},
                        { label: 'Technical Details', fields: [
                          ['Sanctioned Load', editLead.sanctionedLoadKw ? `${editLead.sanctionedLoadKw} kW` : ''],
                          ['DC Capacity', editLead.dcCapacityKw ? `${editLead.dcCapacityKw} kW` : ''],
                          ['Panels', editLead.numberOfPanels], ['Panel Brand', editLead.solarPanelBrand],
                          ['Panel Wp', editLead.solarPanelWp],
                          ['Inverter Capacity', editLead.inverterCapacityKw ? `${editLead.inverterCapacityKw} kW` : ''],
                          ['Inverter Brand', editLead.inverterBrand], ['Structure Size', editLead.structureSize],
                          ['No. of Structure', editLead.numberOfStructure], ['Project Type', editLead.projectType],
                          ['NM App ID', editLead.nmApplicationId], ['IVRS No.', editLead.ivrsNumber],
                          ['Channel Partner', editLead.channelPartner],
                        ]},
                        { label: 'Financial Details', fields: [
                          ['Project Cost', editLead.projectCost ? `₹${Number(editLead.projectCost).toLocaleString()}` : ''],
                          ['Booking Amount', editLead.bookingAmount ? `₹${Number(editLead.bookingAmount).toLocaleString()}` : ''],
                          ['Final Payment', editLead.finalPayment ? `₹${Number(editLead.finalPayment).toLocaleString()}` : ''],
                          ['Loan Amount', editLead.loanAmount ? `₹${Number(editLead.loanAmount).toLocaleString()}` : ''],
                          ['Loan Bank', editLead.loanBankName], ['Liaisoning Work', editLead.liaisoningWork],
                          ['Liaisoning Cost', editLead.liaisoningCost ? `₹${Number(editLead.liaisoningCost).toLocaleString()}` : ''],
                          ['Liaisoning Stage', editLead.liaisoningStage],
                        ]},
                        { label: 'Dates & Notes', fields: [
                          ['Booking Date', editLead.bookingDate], ['Installation Date', editLead.dateOfInstallation],
                          ['Commissioning Date', editLead.dateOfCommissioning], ['Doc Handover Date', editLead.documentsHandOverDate],
                          ['Tentative Install Date', editLead.tentativeInstallationDate],
                          ['AMC Services', editLead.amcServices], ['Project Stage', editLead.projectStage],
                          ['Google Location', editLead.googleLocation], ['Notes', editLead.notes],
                        ]},
                      ].map(section => {
                        const hasFields = section.fields.some(([, v]) => v);
                        if (!hasFields) return null;
                        return (
                          <div key={section.label} className="border-b last:border-0">
                            <div className="px-5 py-2.5 bg-stone-50 text-sm font-semibold text-stone-700">{section.label}</div>
                            <div className="px-5 py-2 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                              {section.fields.map(([label, val]) => val ? (
                                <div key={label} className="flex justify-between border-b border-stone-100 py-1">
                                  <span className="text-stone-500">{label}</span>
                                  <span className="font-medium text-stone-900">{val}</span>
                                </div>
                              ) : null)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between p-4 border-t shrink-0 bg-card">
            <Button variant="outline" onClick={() => { if (editStep === 0) { setIsEditOpen(false); setEditLead(null); setEditStep(0); } else setEditStep(s => s - 1); }}>
              {editStep === 0 ? 'Cancel' : 'Previous'}
            </Button>
            <div className="flex gap-2">
              {editStep < 5 ? (
                <Button className="bg-orange-600 hover:bg-orange-700 text-white" onClick={() => {
                  if (editStep === 0 && !editLead?.name) { toast.error('Name is required'); return; }
                  setEditStep(s => s + 1);
                }}>
                  Next
                </Button>
              ) : (
                <Button className="bg-orange-600 hover:bg-orange-700 text-white" onClick={handleEditLead} disabled={editSaving}>
                  {editSaving ? <Loader2 size={16} className="mr-2 animate-spin" /> : null}
                  Update Lead
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LeadManagement;
