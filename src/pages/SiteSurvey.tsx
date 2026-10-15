import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, 
  Search, 
  Filter, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  MoreVertical,
  Camera,
  FileText,
  Printer,
  Loader2,
  Upload,
  Send,
  Ban,
  Pencil
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { surveysApi, leadsApi, employeesApi } from '../services/api';
import { SURVEY_STATUSES, statusLabel } from '@/lib/statuses';
import { useAuth } from '../contexts/AuthContext';
import { useRegion } from '../contexts/RegionContext';
import { cn, toDateTimeInputValue, toApiIso } from '@/lib/utils';
import { AppImage } from '../components/AppImage';
import DocumentManager, { getApiMessage, handleDocApiError } from '../components/documents/DocumentManager';
import { toast } from 'sonner';

// Canonical list comes from @/lib/statuses so the dropdown, the filter and
// the PATCH body can never drift apart. This helper only exists to read
// legacy rows that stored Title Case / US spelling.
const normSurveyStatus = (s: any): string => {
  const v = String(s || '').toUpperCase().replace(/[\s-]+/g, '_');
  if (v === 'INPROGRESS') return 'IN_PROGRESS';
  if (v === 'CANCELED') return 'CANCELLED';
  return SURVEY_STATUSES.find((x) => x === v) || v || 'SCHEDULED';
};

const surveyBadgeClass = (status: any): string => {
  const s = normSurveyStatus(status);
  if (s === 'COMPLETED') return 'bg-green-100 text-green-700 hover:bg-green-100';
  if (s === 'SCHEDULED') return 'bg-blue-100 text-blue-700 hover:bg-blue-100';
  if (s === 'IN_PROGRESS') return 'bg-amber-100 text-amber-700 hover:bg-amber-100';
  if (s === 'CANCELLED') return 'bg-stone-200 text-stone-500 hover:bg-stone-200';
  return 'bg-stone-100 text-stone-700';
};

const surveyLabel = (status: any): string => statusLabel(normSurveyStatus(status));

const SiteSurvey: React.FC = () => {
  const { isLoading: isAuthLoading, user, hasPermission } = useAuth();
  const navigate = useNavigate();
  const role = String(user?.role || '');
  const isAdminManager = role === 'ADMIN' || role === 'SUPER_ADMIN' || !!user?.isSuperAdmin || role === 'MANAGER';
  const canSubmitQuotation = role === 'ENGINEER' || isAdminManager;
  // ENGINEER sirf apni assigned surveys submit kare (backend bhi 403 deta hai).
  const isOwnSurvey = (s: any) => {
    if (isAdminManager) return true;
    if (role !== 'ENGINEER') return false;
    const mine = [user?.id, selfEngineer?.id, selfEngineer?.email, user?.email].filter(Boolean).map(String);
    return mine.includes(String(s.engineerId || '')) || mine.includes(String(s.engineer?.id || '')) ||
      (s.engineer?.email && user?.email && String(s.engineer.email).toLowerCase() === String(user.email).toLowerCase());
  };
  // Leads/employees list endpoints 403 for roles without read permission
  // (e.g. ENGINEER). Pre-gate the fetches so we never fire doomed requests.
  const canReadLeads = hasPermission('leads', 'read');
  const canReadEngineers = hasPermission('employees', 'read');
  const { matchRegion } = useRegion();
  const [leadsBlocked, setLeadsBlocked] = useState(false);
  const [engineersBlocked, setEngineersBlocked] = useState(false);
  const [surveys, setSurveys] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [engineers, setEngineers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [tab, setTab] = useState('scheduled');
  // Each tab owns its own search box. One shared `searchTerm` let a term typed
  // on the Scheduled tab silently filter the New Leads list, which has no
  // visible input and no way to clear.
  const [surveySearch, setSurveySearch] = useState('');
  const [leadSearch, setLeadSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [selectedEngineerId, setSelectedEngineerId] = useState('');
  const [reportSurvey, setReportSurvey] = useState<any>(null);
  // Pipeline update: submit-quotation + cancel flows
  const [submitSurvey, setSubmitSurvey] = useState<any>(null);
  const [submitSaving, setSubmitSaving] = useState(false);
  const [submitForm, setSubmitForm] = useState({ roofType: '', roofArea: '', structureType: '', shadingIssues: '', meterType: '', sanctionedLoad: '', notes: '' });
  const [cancelSurvey, setCancelSurvey] = useState<any>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelSaving, setCancelSaving] = useState(false);
  const [photoUploading, setPhotoUploading] = useState<string | null>(null);
  // Edit survey (logged-in employee): report fields + scheduledDate + photos.
  const [editSurvey, setEditSurvey] = useState<any>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm] = useState({ roofType: '', roofArea: '', structureType: '', shadingIssues: '', meterType: '', sanctionedLoad: '', notes: '', scheduledDate: '' });
  const canEditSurvey = isAdminManager || role === 'ENGINEER';

  const openEdit = (s: any) => {
    setEditSurvey(s);
    setEditForm({
      roofType: s.roofType || '',
      roofArea: s.roofArea != null ? String(s.roofArea) : '',
      structureType: s.structureType || '',
      shadingIssues: s.shadingIssues || '',
      meterType: s.meterType || '',
      sanctionedLoad: s.sanctionedLoad != null ? String(s.sanctionedLoad) : '',
      notes: s.notes || '',
      scheduledDate: s.scheduledDate ? toDateTimeInputValue(s.scheduledDate) : '',
    });
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editSurvey || editSaving) return;
    if (role === 'ENGINEER' && !isOwnSurvey(editSurvey)) {
      toast.error('Sirf apni assigned survey edit kar sakte ho.');
      return;
    }
    setEditSaving(true);
    try {
      const payload: any = {};
      if (editForm.roofType) payload.roofType = editForm.roofType;
      if (editForm.roofArea !== '') payload.roofArea = Number(editForm.roofArea);
      if (editForm.structureType) payload.structureType = editForm.structureType;
      if (editForm.shadingIssues) payload.shadingIssues = editForm.shadingIssues;
      if (editForm.meterType) payload.meterType = editForm.meterType;
      if (editForm.sanctionedLoad !== '') payload.sanctionedLoad = Number(editForm.sanctionedLoad);
      if (editForm.notes) payload.notes = editForm.notes;
      const schedIso = toApiIso(editForm.scheduledDate);
      if (schedIso) payload.scheduledDate = schedIso;
      await surveysApi.update(editSurvey.id, payload);
      toast.success('Survey updated');
      setEditSurvey(null);
      fetchSurveys(() => isMounted.current);
    } catch (error: any) {
      if (error?.response?.status === 403) toast.error('Permission nahi — admin se surveys permission dilwao.');
      else toast.error(getApiMessage(error, 'Failed to update survey'));
    } finally {
      setEditSaving(false);
    }
  };

  const handleEditPhotoUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !editSurvey) return;
    if (role === 'ENGINEER' && !isOwnSurvey(editSurvey)) {
      toast.error('Sirf apni assigned survey ke photos upload kar sakte ho.');
      return;
    }
    await handlePhotoUpload(editSurvey.id, files);
    // Single-fetch refresh: GET /surveys/:id for this one record, not a full
    // list re-fetch. Also splice it into `surveys` so the table reflects the
    // new photos without a second round trip.
    const fresh = await fetchSurveyById(editSurvey.id);
    if (fresh) {
      setEditSurvey(fresh);
      setSurveys((prev) => prev.map((x: any) => (x.id === fresh.id ? { ...x, ...fresh } : x)));
    }
  };

  const handleSetStatus = async (s: any, status: string) => {
    if (normSurveyStatus(s.status) === status) return;
    if (role === 'ENGINEER' && !isOwnSurvey(s)) {
      toast.error('Sirf apni assigned survey ka status change kar sakte ho.');
      return;
    }
    try {
      await surveysApi.update(s.id, { status });
      toast.success(`Status → ${status}`);
      fetchSurveys(() => isMounted.current);
    } catch (error: any) {
      if (error?.response?.status === 403) toast.error('Permission nahi — admin se surveys permission dilwao.');
      else toast.error(getApiMessage(error, 'Failed to update status'));
    }
  };

  // Single-fetch read for one survey. Unwraps the interceptor's
  // { data: { data } } envelope down to the record itself.
  const fetchSurveyById = async (id: string): Promise<any | null> => {
    try {
      const res = await surveysApi.getById(id);
      const body = res?.data?.data;
      return body?.survey || body || null;
    } catch {
      return null;
    }
  };

  const fetchSurveys = async (isMounted: () => boolean) => {
    setIsLoading(true);
    try {
      const response = await surveysApi.getAll();
      // Guard against setting state after unmount.
      if (!isMounted()) return;
      const data = response.data.data?.surveys || response.data.data;
      setSurveys(Array.isArray(data) ? data : []);
      setLoadError(null);
    } catch (error: any) {
      if (!isMounted()) return;
      const status = error?.response?.status;
      if (status === 401) {
        setLoadError('Your session has expired. Please sign in again.');
      } else if (status === 403) {
        setLoadError("You don't have permission to view surveys.");
      } else {
        setLoadError('Failed to fetch surveys. Please try again.');
        toast.error('Failed to fetch surveys');
      }
    } finally {
      if (isMounted()) setIsLoading(false);
    }
  };

  const fetchInitialData = async (isMounted: () => boolean) => {
    // Fetch leads + engineers independently: one 403 must not discard the other.
    const jobs: Array<Promise<void>> = [];
    if (canReadLeads) {
      jobs.push(
        leadsApi.getAll({ limit: 200 }).then((leadsRes) => {
          if (!isMounted()) return;
          const leadsData = leadsRes.data.data?.leads || leadsRes.data.data || [];
          // Show all leads eligible for a survey. The real API uses statuses like
          // DRAFT/NEW/WON, so we no longer hard-filter to a fixed lowercase list
          // (that left the dropdown empty for every user).
          setLeads(leadsData);
          setLeadsBlocked(false);
        }).catch((error: any) => {
          if (!isMounted()) return;
          // Backend permission decision, not a frontend bug — inline notice only.
          if (error?.response?.status === 403) setLeadsBlocked(true);
          else {
            console.error('Failed to fetch leads for survey options', { status: error?.response?.status, message: error?.message });
            toast.error('Failed to load survey options');
          }
        })
      );
    } else {
      setLeads([]);
      setLeadsBlocked(true);
    }
    if (canReadEngineers) {
      jobs.push(
        employeesApi.getAll().then((empRes) => {
          if (!isMounted()) return;
          const employeesData = empRes.data.data?.employees || empRes.data.data || [];
          setEngineers(employeesData.filter((e: any) => e.role === 'ENGINEER' || e.role === 'ADMIN'));
          setEngineersBlocked(false);
        }).catch((error: any) => {
          if (!isMounted()) return;
          if (error?.response?.status === 403) setEngineersBlocked(true);
          else {
            console.error('Failed to fetch engineers for survey options', { status: error?.response?.status, message: error?.message });
            toast.error('Failed to load survey options');
          }
        })
      );
    } else {
      setEngineers([]);
      setEngineersBlocked(true);
    }
    await Promise.all(jobs);
  };

  // Fetch only once the session has been validated (Layout blocks rendering
  // until then, but guard that there is an established auth session anyway) and
  // guard against duplicate invocations from React StrictMode.
  const loadInFlight = React.useRef(false);
  const isMounted = React.useRef(true);
  useEffect(() => {
    isMounted.current = true;
    loadInFlight.current = false;
    return () => {
      isMounted.current = false;
      loadInFlight.current = false;
    };
  }, []);

  useEffect(() => {
    if (isAuthLoading) return;
    if (loadInFlight.current) return;
    loadInFlight.current = true;
    const alive = () => isMounted.current;
    fetchSurveys(alive);
    fetchInitialData(alive);
    // fetchSurveys/fetchInitialData are self-guarding for unmount; keep the
    // callback list intentionally small to avoid re-triggering.
  }, [isAuthLoading]);

  const filteredSurveys = surveys.filter(s => {
  const matchesSearch = (s.lead?.name || '').toLowerCase().includes(surveySearch.toLowerCase()) ||
    (s.id || '').toLowerCase().includes(surveySearch.toLowerCase());
    const matchesStatus = statusFilter === 'all' || normSurveyStatus(s.status) === statusFilter;
    const matchesRegion = matchRegion(s.lead?.region || s.lead?.regionId, true);
    return matchesSearch && matchesStatus && matchesRegion;
  });

  // The backend enforces a unique constraint on leadId (one survey per lead),
  // so exclude leads that already have a survey from the picker to avoid a 500.
  const scheduledLeadIds = new Set(surveys.map((s: any) => s.leadId).filter(Boolean));
  const availableLeads = leads.filter((l: any) => !scheduledLeadIds.has(l.id));
  // Tab A — survey ke liye eligible leads: early stages (new/contacted/
  // qualified). Won/lost/site_visit bahar; jinka survey hai wo availableLeads
  // me pehle hi excluded hain.
  const SURVEY_ELIGIBLE = ['new', 'contacted', 'qualified'];
  const qualifiedLeads = availableLeads.filter((l: any) => SURVEY_ELIGIBLE.includes(String(l.status || '').toLowerCase()));
  const qualifiedSearch = qualifiedLeads.filter((l: any) =>
    (`${l.name || ''} ${l.phone || ''} ${l.city || ''} ${l.region?.name || ''}`).toLowerCase().includes(leadSearch.toLowerCase())
  );
  // Selected lead preview (engineer ko naam + zone dikhe).
  const scheduledLead = leads.find((l: any) => l.id === selectedLeadId);
  // Schedule modal logic: ENGINEER khud ko assign karta hai (locked),
  // ADMIN/MANAGER kisi bhi engineer ko manage kar sakta hai (free choice).
  const selfEngineer = engineers.find((e: any) => e.id === user?.id)
    || engineers.find((e: any) => e.email && user?.email && String(e.email).toLowerCase() === String(user.email).toLowerCase());
  const selfEngineerId = selfEngineer?.id || (role === 'ENGINEER' ? user?.id : '') || '';
  const selfEngineerName = selfEngineer?.name || user?.name || 'You';
  const openSchedule = (leadId?: string) => {
    if (leadId) setSelectedLeadId(leadId);
    // Engineer self-lock; admin/manager keeps free choice (existing selection rakho).
    if (role === 'ENGINEER' && selfEngineerId) setSelectedEngineerId(selfEngineerId);
    if (role !== 'ENGINEER' && !selectedEngineerId) setSelectedEngineerId('');
    setIsScheduleDialogOpen(true);
  };
  const leadZone = (l: any) => l?.region?.name || l?.zone || l?.city || 'N/A';

  const handleScheduleSurvey = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedLeadId || !selectedEngineerId) {
      toast.error('Please select a lead and an engineer');
      return;
    }
    const formData = new FormData(e.currentTarget);
    const surveyData = {
      leadId: selectedLeadId,
      engineerId: selectedEngineerId,
      scheduledDate: formData.get('scheduledDate') as string,
      notes: formData.get('notes') as string,
    };

    try {
      await surveysApi.create(surveyData);
      fetchSurveys(() => isMounted.current);
      setIsScheduleDialogOpen(false);
      setSelectedLeadId('');
      setSelectedEngineerId('');
      toast.success('Survey scheduled successfully!');
    } catch (error: any) {
      const msg = error?.response?.data?.message || '';
      const msgStr = Array.isArray(msg) ? msg.join(', ') : String(msg);
      const status = error?.response?.status;
      const isDuplicate = status === 409 || status === 500 ||
        msgStr.toLowerCase().includes('leadid') ||
        msgStr.toLowerCase().includes('unique') ||
        msgStr.toLowerCase().includes('already exists');
      if (isDuplicate) {
        // Backend 409: survey pehle se hai — modal band karke existing survey dikhao.
        const nm = leads.find((l: any) => l.id === selectedLeadId)?.name || '';
        setIsScheduleDialogOpen(false);
        setSelectedLeadId('');
        setSelectedEngineerId('');
        setTab('scheduled');
        if (nm) setSurveySearch(nm);
        fetchSurveys(() => isMounted.current);
        toast.info(msgStr || 'Survey already exists — existing survey dikha raha hoon');
        return;
      }
      toast.error(getApiMessage(error, 'Failed to schedule survey'));
    }
  };

  const openSubmit = (s: any) => {
    setSubmitSurvey(s);
    setSubmitForm({
      roofType: s.roofType || '',
      roofArea: s.roofArea != null ? String(s.roofArea) : '',
      structureType: s.structureType || '',
      shadingIssues: s.shadingIssues || '',
      meterType: s.meterType || '',
      sanctionedLoad: s.sanctionedLoad != null ? String(s.sanctionedLoad) : '',
      notes: s.notes || '',
    });
  };

  // POST /surveys/:id/submit-quotation — body = report fields only. There is no
  // status field on this form and `status` is never sent: the DTO has no status
  // property, and the backend owns the transition (survey COMPLETED, quotation
  // DRAFT, lead NEGOTIATION). Response { survey, quotation }.
  // Guard: if a `status` key ever sneaks into `payload` below, the API answers
  // 400 "status should not exist" and the survey never submits.
  const handleSubmitQuotation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!submitSurvey || submitSaving) return;
    // Double-submit / already-done guard: COMPLETED survey dobara submit nahi.
    if (normSurveyStatus(submitSurvey.status) === 'COMPLETED') {
      toast.info('Ye survey already submitted hai');
      setSubmitSurvey(null);
      fetchSurveys(() => isMounted.current);
      return;
    }
    if (role === 'ENGINEER' && !isOwnSurvey(submitSurvey)) {
      toast.error('Sirf apni assigned survey submit kar sakte ho.');
      return;
    }
    setSubmitSaving(true);
    try {
      const numOrOmit = (v: string) => (v !== '' && !isNaN(Number(v)) ? Number(v) : undefined);
      const payload: any = {};
      if (submitForm.roofType.trim()) payload.roofType = submitForm.roofType.trim();
      const roofArea = numOrOmit(submitForm.roofArea);
      if (roofArea !== undefined) payload.roofArea = roofArea;
      if (submitForm.structureType.trim()) payload.structureType = submitForm.structureType.trim();
      if (submitForm.shadingIssues.trim()) payload.shadingIssues = submitForm.shadingIssues.trim();
      if (submitForm.meterType.trim()) payload.meterType = submitForm.meterType.trim();
      const sanctionedLoad = numOrOmit(submitForm.sanctionedLoad);
      if (sanctionedLoad !== undefined) payload.sanctionedLoad = sanctionedLoad;
      if (submitForm.notes.trim()) payload.notes = submitForm.notes.trim();
      if ('status' in payload) delete payload.status;
      const res = await surveysApi.submitQuotation(submitSurvey.id, payload);
      const quotation = res.data?.data?.quotation || res.data?.quotation || res.data?.data?.data?.quotation;
      fetchSurveys(() => isMounted.current);
      setSubmitSurvey(null);
      toast.success('Quotation DRAFT generated — pricing bharo');
      navigate(quotation?.id ? `/quotations?highlight=${quotation.id}&edit=1` : '/quotations?status=DRAFT');
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 403) toast.error('Permission nahi — admin se surveys permission dilwao.');
      else if (status === 400) {
        toast.error(getApiMessage(error, 'Already submitted — list refresh ho rahi hai'));
        setSubmitSurvey(null);
        fetchSurveys(() => isMounted.current);
      }
      else toast.error(getApiMessage(error, 'Failed to submit quotation'));
    } finally {
      setSubmitSaving(false);
    }
  };

  // POST /surveys/:id/cancel { reason? } — ADMIN/MANAGER only. COMPLETED → 400 (button disabled).
  const handleCancelSurvey = async () => {
    if (!cancelSurvey) return;
    setCancelSaving(true);
    try {
      await surveysApi.cancel(cancelSurvey.id, cancelReason.trim() ? { reason: cancelReason.trim() } : {});
      toast.success('Survey cancelled — lead wapas QUALIFIED');
      setCancelSurvey(null);
      setCancelReason('');
      fetchSurveys(() => isMounted.current);
    } catch (error: any) {
      if (error?.response?.status === 403) toast.error('Permission nahi — sirf ADMIN/MANAGER cancel kar sakta hai.');
      else toast.error(getApiMessage(error, 'Failed to cancel survey'));
    } finally {
      setCancelSaving(false);
    }
  };

  // POST /surveys/:id/upload — field `photos` (max 10).
  const handlePhotoUpload = async (surveyId: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (files.length > 10) { toast.error('Max 10 photos at once'); return; }
    setPhotoUploading(surveyId);
    try {
      const fd = new FormData();
      Array.from(files).forEach((f) => fd.append('photos', f));
      await surveysApi.upload(surveyId, fd);
      toast.success('Photos uploaded');
      fetchSurveys(() => isMounted.current);
    } catch (error: any) {
      handleDocApiError(error, 'Failed to upload photos');
    } finally {
      setPhotoUploading(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Site Survey</h1>
          <p className="text-stone-500">Manage technical site assessments for solar installations</p>
        </div>
        
        <div className="flex items-center gap-2">
          {(!leadsBlocked && !engineersBlocked) && (
            <Dialog open={isScheduleDialogOpen} onOpenChange={(open) => { setIsScheduleDialogOpen(open); if (!open) { setSelectedLeadId(''); setSelectedEngineerId(''); } }}>
            <DialogTrigger asChild>
              <Button className="bg-orange-600 hover:bg-orange-700 text-white" onClick={() => openSchedule()}>
                <Plus size={18} className="mr-2" />
                Schedule Survey
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Schedule New Survey</DialogTitle>
                <DialogDescription>Assign an engineer to conduct a site survey for a lead.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleScheduleSurvey} className="space-y-4 py-4">
                 <div className="space-y-2">
                  <Label htmlFor="leadId">Select Lead</Label>
                  <Select value={selectedLeadId} onValueChange={setSelectedLeadId} required>
                    <SelectTrigger id="leadId">
                      <SelectValue placeholder="Select lead" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableLeads.length === 0 ? (
                        <div className="px-2 py-1.5 text-xs text-stone-400">All leads already have a survey</div>
                      ) : (
                        availableLeads.map(l => (
                          <SelectItem key={l.id} value={l.id}>{l.name} ({l.city || 'N/A'} · {leadZone(l)})</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <input type="hidden" name="leadId" value={selectedLeadId} />
                  {scheduledLead && (
                    <div className="rounded-lg bg-orange-50 border border-orange-100 px-3 py-2.5 text-sm space-y-0.5">
                      <p className="font-bold text-stone-900">{scheduledLead.name}</p>
                      <p className="text-xs text-stone-600">{scheduledLead.phone || 'No phone'}{scheduledLead.city ? ` · ${scheduledLead.city}` : ''}</p>
                      <p className="text-xs"><span className="text-stone-500">Zone:</span> <span className="font-semibold text-orange-700">{leadZone(scheduledLead)}</span></p>
                    </div>
                  )}
                </div>
                 <div className="space-y-2">
                  <Label htmlFor="engineerId">Assign Engineer</Label>
                  {role === 'ENGINEER' ? (
                    <div className="rounded-lg bg-stone-50 border border-stone-200 px-3 py-2.5 text-sm">
                      <span className="font-semibold text-stone-800">{selfEngineerName}</span>
                      <span className="text-xs text-stone-500"> (you — locked)</span>
                    </div>
                  ) : (
                  <Select value={selectedEngineerId} onValueChange={setSelectedEngineerId} required>
                    <SelectTrigger id="engineerId">
                      <SelectValue placeholder="Select engineer" />
                    </SelectTrigger>
                    <SelectContent>
                      {engineers.map(e => (
                        <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  )}
                  <input type="hidden" name="engineerId" value={selectedEngineerId} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="scheduledDate">Survey Date</Label>
                  <Input id="scheduledDate" name="scheduledDate" type="datetime-local" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Input id="notes" name="notes" placeholder="Special instructions for the engineer" />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsScheduleDialogOpen(false)}>Cancel</Button>
                  <Button type="submit" className="bg-orange-600 hover:bg-orange-700 text-white">Schedule</Button>
                </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}

          <Dialog open={!!reportSurvey} onOpenChange={(open) => { if (!open) setReportSurvey(null); }}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Survey Report</DialogTitle>
                <DialogDescription>Site survey details {reportSurvey ? `· ${reportSurvey.id.substring(0, 8)}` : ''}</DialogDescription>
              </DialogHeader>
              {reportSurvey && (
                <div className="space-y-4 text-sm max-h-[70vh] overflow-y-auto">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-stone-400">Client</p>
                      <p className="font-medium">{reportSurvey.lead?.name || 'N/A'}</p>
                      <p className="text-stone-500">{reportSurvey.lead?.city || 'N/A'}{reportSurvey.lead?.phone ? ` · ${reportSurvey.lead.phone}` : ''}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-stone-400">Engineer</p>
                      <p className="font-medium">{reportSurvey.engineer?.name || 'Unassigned'}</p>
                      <p className="text-stone-500">{reportSurvey.engineer?.phone || ''}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-stone-400">Scheduled Date</p>
                      <p className="font-medium">{reportSurvey.scheduledDate ? new Date(reportSurvey.scheduledDate).toLocaleString() : 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-stone-400">Status</p>
                      <Badge className={cn("font-medium", surveyBadgeClass(reportSurvey.status))}>{surveyLabel(reportSurvey.status)}</Badge>
                    </div>
                  </div>

                  {reportSurvey.notes && (
                    <div>
                      <p className="text-xs uppercase tracking-wide text-stone-400">Notes</p>
                      <p className="text-stone-700">{reportSurvey.notes}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 border-t border-stone-100 pt-3">
                    {[
                      ['Roof Type', reportSurvey.roofType],
                      ['Roof Area', reportSurvey.roofArea],
                      ['Structure Type', reportSurvey.structureType],
                      ['Shading Issues', reportSurvey.shadingIssues],
                      ['Meter Type', reportSurvey.meterType],
                      ['Sanctioned Load', reportSurvey.sanctionedLoad],
                    ].filter(([, v]) => v !== null && v !== undefined && v !== '').map(([label, value]) => (
                      <div key={label as string}>
                        <p className="text-xs uppercase tracking-wide text-stone-400">{label}</p>
                        <p className="text-stone-700">{String(value)}</p>
                      </div>
                    ))}
                  </div>

                  {Array.isArray(reportSurvey.photos) && reportSurvey.photos.length > 0 && (
                    <div>
                      <p className="text-xs uppercase tracking-wide text-stone-400">Photos</p>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {reportSurvey.photos.map((p: any, i: number) => (
                          <AppImage key={i} src={typeof p === 'string' ? p : p.url} alt="survey" className="h-20 w-20 rounded object-cover border border-stone-200" />
                        ))}
                      </div>
                    </div>
                  )}

                  {reportSurvey.leadId && (
                    <div className="border-t border-stone-100 pt-3">
                      <p className="text-xs uppercase tracking-wide text-stone-400 mb-2">Site / KYC Documents</p>
                      <DocumentManager leadId={reportSurvey.leadId} defaultDocType="SITE" compact
                        onChanged={() => fetchSurveys(() => isMounted.current)} />
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="outline" onClick={() => window.print()}>
                      <Printer size={14} className="mr-2" /> Print Report
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {loadError && (
        <div className="flex items-center gap-2 p-3 text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-xl">
          <AlertCircle size={16} className="shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="scheduled">Scheduled ({filteredSurveys.length})</TabsTrigger>
          <TabsTrigger value="new">New Leads ({qualifiedSearch.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="scheduled">
      <Card className="border-stone-200 shadow-sm">
        <CardHeader className="p-4 border-b border-stone-100">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
              <Input 
                placeholder="Search by client or survey ID..." 
                className="pl-10 h-10 border-stone-200 focus-visible:ring-orange-500"
                value={surveySearch}
                onChange={(e) => setSurveySearch(e.target.value)}
              />
            </div>
            
            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px] h-10 border-stone-200">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {SURVEY_STATUSES.map((s) => (
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
              <TableRow className="bg-stone-50">
                  <TableHead>Survey ID</TableHead>
                  <TableHead>Client Name</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead>Engineer Assigned</TableHead>
                <TableHead>Survey Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center text-stone-400">
                      <Loader2 size={48} className="mb-4 animate-spin opacity-20" />
                      <p className="text-lg font-medium">Loading surveys...</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredSurveys.length > 0 ? (
                filteredSurveys.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.id.substring(0, 8)}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-semibold">{s.lead?.name || 'N/A'}</span>
                        <span className="text-xs text-stone-500">{s.lead?.city || 'N/A'}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {s.lead?.region?.name ? (
                        <Badge variant="outline" className="font-normal">{s.lead.region.name}</Badge>
                      ) : (
                        <Badge variant="outline" className="font-normal text-stone-400" title="Lead ka region set nahi hai">Unassigned</Badge>
                      )}
                    </TableCell>
                    <TableCell>{s.engineer?.name || 'Unassigned'}</TableCell>
                    <TableCell className="text-sm text-stone-600">
                      {s.scheduledDate ? new Date(s.scheduledDate).toLocaleString() : 'N/A'}
                    </TableCell>
                    <TableCell>
                      <Badge className={cn("font-medium", surveyBadgeClass(s.status))}>
                        {surveyLabel(s.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {canSubmitQuotation && isOwnSurvey(s) && normSurveyStatus(s.status) !== 'COMPLETED' && normSurveyStatus(s.status) !== 'CANCELLED' && (
                          <Button
                            size="sm"
                            className="h-8 bg-orange-600 hover:bg-orange-700 text-white text-xs"
                            onClick={() => openSubmit(s)}
                            title="Submit & Generate Quotation (DRAFT)"
                          >
                            <Send size={13} className="mr-1.5" /> Submit
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-stone-600 border-stone-200"
                          onClick={() => setReportSurvey(s)}
                        >
                          <FileText size={14} className="mr-2" /> Report
                        </Button>
                        {canEditSurvey && isOwnSurvey(s) && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-stone-600 border-stone-200"
                            onClick={() => openEdit(s)}
                            title="Edit survey (fields + photos)"
                          >
                            <Pencil size={14} className="mr-2" /> Edit
                          </Button>
                        )}
                        {canEditSurvey && isOwnSurvey(s) && normSurveyStatus(s.status) !== 'CANCELLED' && (
                          (s.photos?.length || 0) >= 10 ? (
                            <span className="h-8 px-2.5 inline-flex items-center gap-1.5 text-xs rounded-md border border-stone-200 text-stone-400 cursor-not-allowed" title="Max 10 photos — limit full hai">
                              <Upload size={13} /> Photos
                            </span>
                          ) : (
                          <label className="h-8 px-2.5 inline-flex items-center gap-1.5 text-xs rounded-md border border-stone-200 text-stone-600 cursor-pointer hover:bg-stone-50" title="Upload site photos — sirf JPEG/PNG/WebP, max 10, 10MB each">
                            {photoUploading === s.id ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                            Photos
                            <input
                              type="file"
                              accept="image/*"
                              multiple
                              className="hidden"
                              onChange={(e) => {
                                const files = e.target.files;
                                // The per-row path is a second write entry point —
                                // it must carry the same ownership check as the dialog.
                                if (role === 'ENGINEER' && !isOwnSurvey(s)) {
                                  toast.error('Sirf apni assigned survey me photos upload kar sakte ho.');
                                  e.target.value = '';
                                  return;
                                }
                                handlePhotoUpload(s.id, files);
                              }}
                            />
                          </label>
                          )
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="More actions">
                              <MoreVertical size={16} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setReportSurvey(s)}>
                              <FileText size={14} className="mr-2" /> View Details
                            </DropdownMenuItem>
                            {canEditSurvey && isOwnSurvey(s) && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuLabel className="text-xs text-stone-500">Set Status (backend)</DropdownMenuLabel>
                                {SURVEY_STATUSES.map((st) => (
                                  <DropdownMenuItem
                                    key={st}
                                    disabled={normSurveyStatus(s.status) === st}
                                    onClick={() => handleSetStatus(s, st)}
                                  >
                                    <CheckCircle2 size={14} className="mr-2" /> {st}
                                    {normSurveyStatus(s.status) === st && <span className="ml-auto text-[10px] text-stone-400">current</span>}
                                  </DropdownMenuItem>
                                ))}
                              </>
                            )}
                            {isAdminManager && normSurveyStatus(s.status) !== 'COMPLETED' && normSurveyStatus(s.status) !== 'CANCELLED' && (
                              <DropdownMenuItem className="text-red-600" onClick={() => setCancelSurvey(s)}>
                                <Ban size={14} className="mr-2" /> Cancel Survey
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => {
                              setReportSurvey(s);
                              setTimeout(() => window.print(), 300);
                            }}>
                              <Printer size={14} className="mr-2" /> Print Report
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => {
                                navigator.clipboard?.writeText(s.id);
                                toast.success('Survey ID copied');
                              }}
                            >
                              <Camera size={14} className="mr-2" /> Copy Survey ID
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="h-64 text-center text-stone-400">
                    No surveys found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
        </TabsContent>
        <TabsContent value="new">
          <Card className="border-stone-200 shadow-sm">
            <CardHeader className="p-4 border-b border-stone-100">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
                <Input
                  placeholder="Search leads by name, phone, city..."
                  className="pl-10 h-10 border-stone-200 focus-visible:ring-orange-500"
                  value={leadSearch}
                  onChange={(e) => setLeadSearch(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-stone-50">
                    <TableHead>Client Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Zone</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leadsBlocked ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-48 text-center text-stone-400">Leads dekhne ka access nahi — assigned surveys upar Scheduled tab me dekho (admin se access lo).</TableCell>
                    </TableRow>
                  ) : qualifiedSearch.length > 0 ? (
                    qualifiedSearch.map((l: any) => (
                      <TableRow key={l.id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-semibold">{l.name}</span>
                            <span className="text-xs text-stone-500">{l.city || 'N/A'}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-stone-600">{l.phone || '—'}</TableCell>
                        <TableCell><Badge variant="outline" className="font-normal">{leadZone(l)}</Badge></TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" className="h-8 bg-orange-600 hover:bg-orange-700 text-white text-xs" onClick={() => { setSelectedEngineerId(''); openSchedule(l.id); }}>
                            <Plus size={13} className="mr-1.5" /> Schedule
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="h-48 text-center text-stone-400">No new leads pending survey (new / contacted / qualified)</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Submit & Generate Quotation — ENGINEER + ADMIN + MANAGER.
          status mat bhejo; backend COMPLETED set karta hai, quotation DRAFT deta hai. */}
      <Dialog open={!!submitSurvey} onOpenChange={(open) => { if (!open) setSubmitSurvey(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Submit & Generate Quotation</DialogTitle>
            <DialogDescription>Survey report bharo — success par quotation DRAFT khulega (lead NEGOTIATION).</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitQuotation} className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Roof Type</Label><Input value={submitForm.roofType} onChange={(e) => setSubmitForm({ ...submitForm, roofType: e.target.value })} placeholder="RCC / Metal / Shed" /></div>
              <div className="space-y-1.5"><Label>Roof Area (sqft)</Label><Input type="number" step="any" value={submitForm.roofArea} onChange={(e) => setSubmitForm({ ...submitForm, roofArea: e.target.value })} placeholder="1200" /></div>
              <div className="space-y-1.5"><Label>Structure Type</Label><Input value={submitForm.structureType} onChange={(e) => setSubmitForm({ ...submitForm, structureType: e.target.value })} placeholder="Elevated / Flush" /></div>
              <div className="space-y-1.5"><Label>Shading Issues</Label><Input value={submitForm.shadingIssues} onChange={(e) => setSubmitForm({ ...submitForm, shadingIssues: e.target.value })} placeholder="None / Partial / Heavy" /></div>
              <div className="space-y-1.5"><Label>Meter Type</Label><Input value={submitForm.meterType} onChange={(e) => setSubmitForm({ ...submitForm, meterType: e.target.value })} placeholder="Single / Three Phase" /></div>
              <div className="space-y-1.5"><Label>Sanctioned Load (kW)</Label><Input type="number" step="any" value={submitForm.sanctionedLoad} onChange={(e) => setSubmitForm({ ...submitForm, sanctionedLoad: e.target.value })} placeholder="5" /></div>
            </div>
            <div className="space-y-1.5"><Label>Notes</Label><Input value={submitForm.notes} onChange={(e) => setSubmitForm({ ...submitForm, notes: e.target.value })} placeholder="Site remarks..." /></div>
            {submitSurvey?.leadId && (
              <div className="border-t pt-3">
                <p className="text-xs font-semibold text-stone-500 mb-2">Documents (SITE / KYC) — optional, pehle upload kar sakte ho</p>
                <DocumentManager leadId={submitSurvey.leadId} defaultDocType="SITE" compact />
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSubmitSurvey(null)}>Cancel</Button>
              <Button type="submit" disabled={submitSaving} className="bg-orange-600 hover:bg-orange-700 text-white">
                {submitSaving ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Send size={14} className="mr-1.5" />}
                Submit & Generate Quotation
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Survey — logged-in employee (ENGINEER / ADMIN / MANAGER): fields + photos (R2). */}
      <Dialog open={!!editSurvey} onOpenChange={(open) => { if (!open) setEditSurvey(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Survey</DialogTitle>
            <DialogDescription>Site updates karo — photos R2 bucket me store hoti hain, preview neeche dikhega.</DialogDescription>
          </DialogHeader>
          {editSurvey && (
            <form onSubmit={handleEditSave} className="space-y-3 py-2">
              <div className="rounded-lg bg-orange-50 border border-orange-100 px-3 py-2 text-sm">
                <p className="font-bold text-stone-900">{editSurvey.lead?.name || 'N/A'}</p>
                <p className="text-xs text-stone-600">{editSurvey.lead?.city || ''}{editSurvey.engineer?.name ? ` · ${editSurvey.engineer.name}` : ''}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Roof Type</Label><Input value={editForm.roofType} onChange={(e) => setEditForm({ ...editForm, roofType: e.target.value })} placeholder="RCC / Metal / Shed" /></div>
                <div className="space-y-1.5"><Label>Roof Area (sqft)</Label><Input type="number" step="any" value={editForm.roofArea} onChange={(e) => setEditForm({ ...editForm, roofArea: e.target.value })} placeholder="1200" /></div>
                <div className="space-y-1.5"><Label>Structure Type</Label><Input value={editForm.structureType} onChange={(e) => setEditForm({ ...editForm, structureType: e.target.value })} placeholder="Elevated / Flush" /></div>
                <div className="space-y-1.5"><Label>Shading Issues</Label><Input value={editForm.shadingIssues} onChange={(e) => setEditForm({ ...editForm, shadingIssues: e.target.value })} placeholder="None / Partial / Heavy" /></div>
                <div className="space-y-1.5"><Label>Meter Type</Label><Input value={editForm.meterType} onChange={(e) => setEditForm({ ...editForm, meterType: e.target.value })} placeholder="Single / Three Phase" /></div>
                <div className="space-y-1.5"><Label>Sanctioned Load (kW)</Label><Input type="number" step="any" value={editForm.sanctionedLoad} onChange={(e) => setEditForm({ ...editForm, sanctionedLoad: e.target.value })} placeholder="5" /></div>
              </div>
              <div className="space-y-1.5"><Label>Scheduled Date</Label><Input type="datetime-local" value={editForm.scheduledDate} onChange={(e) => setEditForm({ ...editForm, scheduledDate: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Notes</Label><Input value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} placeholder="Site remarks..." /></div>
              <div className="space-y-1.5">
                <Label>Site Photos (preview + upload)</Label>
                {Array.isArray(editSurvey.photos) && editSurvey.photos.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {editSurvey.photos.map((p: any, i: number) => (
                      <AppImage key={i} src={typeof p === 'string' ? p : p.url} alt="site" className="h-20 w-20 rounded object-cover border border-stone-200 cursor-pointer" onClick={() => window.open(typeof p === 'string' ? p : p.url, '_blank')} />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-stone-400">No photos yet</p>
                )}
                <label className="h-9 px-3 inline-flex items-center gap-1.5 text-xs rounded-md border border-stone-200 text-stone-600 cursor-pointer hover:bg-stone-50" title="Upload site photos (max 10)">
                  {photoUploading === editSurvey.id ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                  Upload photos
                  <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleEditPhotoUpload(e.target.files)} />
                </label>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditSurvey(null)}>Cancel</Button>
                <Button type="submit" disabled={editSaving} className="bg-orange-600 hover:bg-orange-700 text-white">
                  {editSaving ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : null}
                  Save Updates
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Cancel Survey — ADMIN/MANAGER only. COMPLETED par backend 400 deta hai (button wahi disabled). */}
      <Dialog open={!!cancelSurvey} onOpenChange={(open) => { if (!open) { setCancelSurvey(null); setCancelReason(''); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel Survey</DialogTitle>
            <DialogDescription>Survey CANCELLED hoga, lead wapas QUALIFIED, timeline me entry.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Reason (optional)</Label>
            <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="e.g. Client postponed" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCancelSurvey(null); setCancelReason(''); }}>Back</Button>
            <Button variant="destructive" disabled={cancelSaving} onClick={handleCancelSurvey}>
              {cancelSaving ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Ban size={14} className="mr-1.5" />}
              Cancel Survey
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SiteSurvey;
