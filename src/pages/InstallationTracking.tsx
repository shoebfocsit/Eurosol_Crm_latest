import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  MoreVertical, 
  Truck, 
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  LayoutGrid,
  List,
  Camera,
  FileText,
  Loader2,
  Trash2,
  Eye,
  Settings,
  User,
  Wrench,
  Check,
  Building,
  Activity,
  Award,
  Milestone
} from 'lucide-react';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { installationsApi, employeesApi, leadsApi, settingsApi } from '../services/api';
import { Installation, AssetDetails, User as EmployeeUser } from '../types';
import { cn, toLocalDateKey, toDateInputValue } from '@/lib/utils';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { useRegion } from '../contexts/RegionContext';

const InstallationTracking: React.FC = () => {
  // Flow lock-in: installations normally quotation-APPROVED par auto-banti
  // hain — manual init sirf ADMIN/MANAGER emergency override.
  const { user: instUser, hasPermission } = useAuth();
  const _r = String(instUser?.role || '');
  const ALLOW_MANUAL_PROJECT = _r === 'ADMIN' || _r === 'SUPER_ADMIN' || !!instUser?.isSuperAdmin || _r === 'MANAGER';
  const [installations, setInstallations] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [regions, setRegions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table');
  const [searchTerm, setSearchTerm] = useState('');
  const { selectedRegion: regionFilter, setSelectedRegion: setRegionFilter, matchRegion } = useRegion();
  const [selectedInst, setSelectedInst] = useState<any | null>(null);
  const [isAssetDialogOpen, setIsAssetDialogOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Single-fetch read for one installation. Used to refresh the open detail
  // dialog / row after a mutation instead of re-listing every installation.
  const fetchInstallationById = async (id: string): Promise<any | null> => {
    try {
      const res = await installationsApi.getById(id);
      const body = res?.data?.data;
      return body?.installation || body || null;
    } catch {
      return null;
    }
  };

  const fetchInstallations = async () => {
    setIsLoading(true);
    try {
      const response = await installationsApi.getAll();
      const data = response.data.data?.installations || response.data.data;
      setInstallations((Array.isArray(data) ? data : []).map(normInst));
    } catch (error) {
      toast.error('Failed to fetch installations');
    } finally {
      setIsLoading(false);
    }
  };

  // Reconcile one record in place after a mutation. Keeps the table and any
  // open detail dialog current from a single GET /installations/:id.
  const refreshInstallation = async (id: string) => {
    const fresh = await fetchInstallationById(id);
    if (!fresh) {
      fetchInstallations();
      return null;
    }
    const normalized = normInst(fresh);
    setInstallations((prev) => prev.map((x) => (x.id === id ? { ...x, ...normalized } : x)));
    setSelectedInst((prev) => (prev && prev.id === id ? { ...prev, ...normalized } : prev));
    return normalized;
  };

  const fetchInitialData = async () => {
    // Independent fetches: ek ka 403/500 doosre ka data nahi khayega.
    try {
      const empRes = await employeesApi.getAll();
      const empData = empRes.data.data?.employees || empRes.data.data;
      setEmployees(Array.isArray(empData) ? empData : []);
    } catch (error) {
      console.error('Failed to fetch employees', error);
    }
    try {
      // Create-dialog me saare leads dikhen (default page-size me purane kat jate hain).
      const leadsRes = await leadsApi.getAll({ limit: 200 });
      const leadsDataRaw = leadsRes.data.data?.leads || leadsRes.data.data;
      const leadsData = Array.isArray(leadsDataRaw) ? leadsDataRaw : [];
      setLeads(leadsData.filter((l: any) => String(l.status || '').toLowerCase() !== 'lost'));
    } catch (error) {
      console.error('Failed to fetch leads', error);
    }
    try {
      const regionRes = await settingsApi.getRegions();
      const regRaw = regionRes.data.data?.regions || regionRes.data.data;
      setRegions(Array.isArray(regRaw) ? regRaw : []);
    } catch (error: any) {
      // Regions endpoint admin-gated ho sakta hai — silent, nested data se kaam chalega.
      if (error?.response?.status !== 403) console.error('Failed to fetch regions', error);
      setRegions([]);
    }
  };

  useEffect(() => {
    if (!hasPermission('installations', 'read')) {
      toast.error('Access denied');
      return;
    }
    fetchInstallations();
    fetchInitialData();
  }, []);

  const handleUpdateProperty = async (id: string, updatedFields: any) => {
    try {
      await installationsApi.update(id, updatedFields);
      toast.success('Project details synchronized!');
      
      // Update local state smoothly
      setInstallations(prev => prev.map(inst => inst.id === id ? { ...inst, ...updatedFields } : inst));
      
      if (selectedInst && selectedInst.id === id) {
        setSelectedInst((prev: any) => prev ? { ...prev, ...updatedFields } : null);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to update project status');
      // Revert the open dialog too, not just the table row, or the operator
      // re-enters the same data thinking the first save landed. Single-fetch
      // the record to learn the true stored value.
      refreshInstallation(id).then((fresh) => {
        if (fresh) setSelectedInst(fresh);
      });
    }
  };

  // One place that knows the status -> progress pairing. Previously the row
  // menu sent {status, progress} but the dialog's Select sent {status} only,
  // so marking Completed from the dialog produced "Completed / 0%".
  // Keys are the canonical enum values (see INSTALLATION_STATUSES) — this
  // table is indexed by the status actually being sent to the API.
  const INST_PROGRESS: Record<string, number> = {
    PENDING: 10, IN_PROGRESS: 50, COMPLETED: 100, ON_HOLD: 0, CANCELLED: 0,
  };
  const setInstStatus = (id: string, status: string) =>
    handleUpdateProperty(id, { status, progress: INST_PROGRESS[status] ?? 0 });

  const handleAddAssets = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedInst) return;

    const formData = new FormData(e.currentTarget);
    const assets: any[] = [];

    const panelBrand = formData.get('panelBrand') as string;
    const panelModel = formData.get('panelModel') as string;
    const panelCount = Number(formData.get('panelCount')) || 0;
    const panelWatt = Number(formData.get('panelWatt')) || 540;
    const panelSerialNumbers = formData.get('panelSerialNumbers') as string;
    // The field is one text input holding comma-separated serials, but
    // `assetDetails.panelSerialNumbers` is a string[] (types.ts). Send an array.
    const panelSerials = String(panelSerialNumbers || '').split(',').map(s => s.trim()).filter(Boolean);
    const panelInstallationDate = formData.get('panelInstallationDate') as string;
    const panelWarrantyExpiry = formData.get('panelWarrantyExpiry') as string;

    if (panelBrand) {
      assets.push({
        itemName: 'Solar Panel',
        brand: panelBrand,
        model: panelModel,
        serialNumber: panelSerialNumbers,
        quantity: panelCount,
        wattage: panelWatt,
        installationDate: panelInstallationDate,
        warrantyExpiry: panelWarrantyExpiry,
      });
    }

    const inverterBrand = formData.get('inverterBrand') as string;
    const inverterModel = formData.get('inverterModel') as string;
    const inverterCapacity = formData.get('inverterCapacity') as string;
    const inverterSerialNumber = formData.get('inverterSerialNumber') as string;
    const inverterWarrantyExpiry = formData.get('inverterWarrantyExpiry') as string;

    if (inverterBrand) {
      assets.push({
        itemName: 'Inverter',
        brand: inverterBrand,
        model: inverterModel,
        serialNumber: inverterSerialNumber,
        quantity: 1,
        capacity: inverterCapacity,
        warrantyExpiry: inverterWarrantyExpiry,
      });
    }

    const assetDetails = {
      systemSizeKW: formData.get('systemSizeKW') as string,
      netMeterNumber: formData.get('netMeterNumber') as string,
      panelBrand,
      panelModel,
      panelCount,
      panelWatt,
      panelSerialNumbers: panelSerials,
      panelInstallationDate,
      panelWarrantyExpiry,
      inverterBrand,
      inverterModel,
      inverterCapacity,
      inverterSerialNumber,
      inverterWarrantyExpiry,
    };

    try {
      await installationsApi.submitAssets(selectedInst.id, { assets, assetDetails });
      await refreshInstallation(selectedInst.id);
      setIsAssetDialogOpen(false);
      toast.success('Asset specifications and serial numbers logged successfully!');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to add technical specification details');
    }
  };

  const handleCreateInstallation = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const leadVal = formData.get('leadId') as string;
    const engineerVal = formData.get('engineerId') as string;
    
    // LIVE DTO: only leadId* + engineerId?, startDate?, expectedEndDate?, notes? (class-validator whitelist — extra fields → 400)
    const instData: any = {
      leadId: leadVal,
      ...(engineerVal ? { engineerId: engineerVal } : {}),
      ...(formData.get('startDate') ? { startDate: formData.get('startDate') as string } : {}),
      ...(formData.get('expectedEndDate') ? { expectedEndDate: formData.get('expectedEndDate') as string } : {}),
      ...(formData.get('notes') ? { notes: formData.get('notes') as string } : {}),
    };

    try {
      await installationsApi.create(instData);
      fetchInstallations();
      setIsCreateDialogOpen(false);
      toast.success('New solar tracking project created successfully!');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to initialize installation tracking project');
    }
  };

  // NOTE: installation delete uses the live DELETE /installations/:id route.

  const handleDeleteInstallation = async () => {
    if (!deleteId || deleteLoading) return;
    setDeleteLoading(true);
    try {
      await installationsApi.delete(deleteId);
      toast.success('Track sheet deleted');
      setDeleteId(null);
      if (selectedInst?.id === deleteId) setSelectedInst(null);
      fetchInstallations();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to delete track sheet');
    } finally {
      setDeleteLoading(false);
    }
  };

  const getRegionName = (region: any): string => {
    if (!region) return 'N/A';
    if (typeof region === 'string') return region;
    return region.name || region.id || 'N/A';
  };

  const getRegionId = (region: any): string => {
    if (!region) return '';
    if (typeof region === 'string') return region;
    return region.id || region.name || '';
  };

  // Installation records often carry only leadId (no denormalized client
  // fields) — resolve the client profile via the fetched leads list.
  // Region seedha nested lead se (backend live) — list fallback sirf
  // purani rows/display ke liye.
  const getInstClient = (inst: any) => {
    const lead = inst?.lead || leads.find((l: any) => l.id === (inst?.leadId || inst?.lead?.id));
    return {
      name: inst?.clientName || inst?.client_name || lead?.name || 'N/A',
      phone: inst?.clientPhone || inst?.phone || lead?.phone || '',
      city: inst?.clientCity || inst?.city || lead?.city || '',
      region: inst?.region || lead?.region || lead?.regionId || '',
    };
  };

  // Hardware fields are written by two different shapes: `assetDetails`
  // (flat object) and `assets` (ARRAY of per-item rows). The old
  // `assets?.panelBrand` reads could never resolve against an array.
  const assetField = (inst: any, key: string) => inst?.assetDetails?.[key];
  const assetRow = (inst: any, itemName: string) =>
    (Array.isArray(inst?.assets) ? inst.assets : []).find((a: any) => a?.itemName === itemName);
  const serialsToText = (v: any) =>
    Array.isArray(v) ? v.join(', ') : (v == null ? '' : String(v));
  // assetDetails.panelSerialNumbers is string[] per types.ts, but rows created
  // before that typing send a comma-joined string. Normalise on READ so every
  // consumer - and every PATCH that spreads assetDetails back - is an array.
  const toSerials = (v: any): string[] =>
    Array.isArray(v) ? v.map((s: any) => String(s).trim()).filter(Boolean)
      : (v == null ? [] : String(v).split(',').map((s) => s.trim()).filter(Boolean));
  const normInst = (i: any) => {
    if (!i || typeof i !== 'object') return i;
    if (!i.assetDetails || typeof i.assetDetails !== 'object') return i;
    return { ...i, assetDetails: { ...i.assetDetails, panelSerialNumbers: toSerials(i.assetDetails.panelSerialNumbers) } };
  };

  const filteredInstallations = installations.filter(inst => {
    const client = getInstClient(inst);
    const matchesSearch = (inst.clientName || client.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (inst.id || '').toLowerCase().includes(searchTerm.toLowerCase());
    // Filter must use the SAME lead fallback the display uses (line 492), else
    // projects whose region comes from their lead vanish when you filter by it.
    // Backend nested lead.region bhejta hai — direct wahi, phir list fallback.
    const matchesRegion = regionFilter === 'all' || matchRegion(inst.region || inst.lead?.region || inst.lead?.regionId || client.region, true);
    return matchesSearch && matchesRegion;
  });

  // Columns and the dialog Select both used Title Case ids ("In Progress") and
  // sent them straight to PATCH /installations/:id. The backend enum is
  // SCREAMING_SNAKE, so every write was a 400. Columns now carry the canonical
  // value as `id` and only the visible title is prettified — one vocabulary for
  // filtering, rendering and writing.
  const kanbanColumns = [
    { id: 'PENDING', title: 'Pending', icon: Calendar, color: 'border-blue-500' },
    { id: 'IN_PROGRESS', title: 'In Progress', icon: Clock, color: 'border-yellow-500' },
    { id: 'COMPLETED', title: 'Completed', icon: CheckCircle2, color: 'border-green-500' },
    { id: 'ON_HOLD', title: 'On Hold', icon: AlertCircle, color: 'border-red-500' },
    { id: 'CANCELLED', title: 'Cancelled', icon: XCircle, color: 'border-stone-400' },
  ];

  // Read-side only: tolerates legacy Title Case / spaced rows from before the
  // enum fix. Never used to build a request body.
  const normInstStatus = (s: any) => {
    const v = String(s || '').toLowerCase().replace(/[\s_-]+/g, '');
    if (v === 'inprogress') return 'IN_PROGRESS';
    if (v === 'onhold') return 'ON_HOLD';
    if (v === 'completed') return 'COMPLETED';
    if (v === 'cancelled') return 'CANCELLED';
    // 'scheduled' is not in the enum; the API's initial value is PENDING.
    if (v === 'scheduled' || v === 'pending') return 'PENDING';
    return String(s || 'PENDING');
  };

  const getStatusBadge = (status: string) => {
    switch (normInstStatus(status)) {
      case 'PENDING': return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">Pending</Badge>;
      case 'IN_PROGRESS': return <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100 font-medium">In Progress</Badge>;
      case 'COMPLETED': return <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border border-green-200">Completed</Badge>;
      case 'ON_HOLD': return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">On Hold</Badge>;
      case 'CANCELLED': return <Badge className="bg-stone-100 text-stone-500 hover:bg-stone-100">Cancelled</Badge>;
      default: return <Badge className="bg-stone-100 text-stone-500">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Installation Tracking & Milestones</h1>
          <p className="text-stone-500">Monitor work orders, civil setup, inspections, net metering, & hardware specs</p>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="bg-card border border-stone-200 rounded-lg p-1 flex items-center shadow-sm">
            <Button 
              variant={viewMode === 'table' ? 'secondary' : 'ghost'} 
              size="sm" 
              onClick={() => setViewMode('table')}
              className="h-8 px-3 text-xs"
            >
              <List size={14} className="mr-1.5" /> Table
            </Button>
            <Button 
              variant={viewMode === 'kanban' ? 'secondary' : 'ghost'} 
              size="sm" 
              onClick={() => setViewMode('kanban')}
              className="h-8 px-3 text-xs"
            >
              <LayoutGrid size={14} className="mr-1.5" /> Kanban
            </Button>
          </div>
          
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            {ALLOW_MANUAL_PROJECT && (
            <DialogTrigger asChild>
              <Button className="bg-orange-600 hover:bg-orange-700 text-white font-medium text-sm">
                <Plus size={18} className="mr-2" />
                New Project
              </Button>
            </DialogTrigger>
            )}
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Launch Tracking Sheet</DialogTitle>
                <DialogDescription>Initialize a solar engineering project milestone tracker for a vetted client.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateInstallation} className="space-y-4 py-3">
                <div className="space-y-2">
                  <Label htmlFor="leadId">Target Client Site (Lead)</Label>
                  <Select name="leadId" required>
                    <SelectTrigger id="leadId" className="border-stone-200">
                      <SelectValue placeholder="Select high-interest site" />
                    </SelectTrigger>
                    <SelectContent>
                      {leads.map(l => (
                        <SelectItem key={l.id} value={l.id}>{l.name} ({typeof l.region === 'object' ? l.region?.name : l.region || l.regionId || 'N/A'})</SelectItem>
                      ))}
                      {leads.length === 0 && (
                        <div className="p-3 text-center text-xs text-stone-400">No active/converted leads on record</div>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="engineerId">Supervisor / Installation Engineer</Label>
                  <Select name="engineerId" required>
                    <SelectTrigger id="engineerId" className="border-stone-200">
                      <SelectValue placeholder="Select site engineer" className="truncate" />
                    </SelectTrigger>
                    <SelectContent>
                      {employees.filter(e => e.role === 'ENGINEER' || e.role === 'SUPER_ADMIN' || e.role === 'ADMIN').map(e => (
                        <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="startDate">Initiation Date</Label>
                  <Input id="startDate" name="startDate" type="date" defaultValue={toLocalDateKey()} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Supervisor Remarks</Label>
                  <Input id="notes" name="notes" placeholder="Ground v/s rooftop specifications or guidelines" />
                </div>
                <DialogFooter className="pt-2">
                  <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>Cancel</Button>
                  <Button type="submit" className="bg-orange-600 hover:bg-orange-700 text-white">Initialize Project</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card p-4 rounded-xl border border-stone-200 shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
          <Input 
            placeholder="Search by client name, project index or ID..." 
            className="pl-10 h-10 border-stone-200 focus-visible:ring-orange-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="flex items-center gap-2">
          <Select value={regionFilter} onValueChange={setRegionFilter}>
            <SelectTrigger className="w-[160px] h-10 border-stone-200">
              <SelectValue placeholder="All Regions" />
            </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Regions</SelectItem>
                {regions.map(r => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
          </Select>
          <Button variant="outline" className="h-10 border-stone-200 text-stone-600 bg-card" onClick={() => { setSearchTerm(''); setRegionFilter('all'); }}>
            Clear Filters
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="h-64 flex flex-col items-center justify-center text-stone-400">
          <Loader2 size={48} className="mb-4 animate-spin opacity-20" />
          <p className="text-lg font-medium">Synchronizing track records...</p>
        </div>
      ) : filteredInstallations.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-xl border border-dashed border-stone-200">
          <Truck className="mx-auto text-stone-300 mb-3" size={40} />
          <p className="text-sm font-semibold text-stone-600">No solar installation projects match your scope</p>
          <p className="text-xs text-stone-400 mt-1">Refine your search or initialize a new milestone tracking worksheet.</p>
        </div>
      ) : viewMode === 'table' ? (
        <Card className="border-stone-200 shadow-sm overflow-hidden">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-stone-50 border-b border-stone-100">
                  <TableHead className="font-semibold text-stone-700">Project ID</TableHead>
                  <TableHead className="font-semibold text-stone-700">Client Profile</TableHead>
                  <TableHead className="font-semibold text-stone-700">Lead Supervisor</TableHead>
                  <TableHead className="font-semibold text-stone-700">Completion Target</TableHead>
                  <TableHead className="font-semibold text-stone-700">Progress Tracker</TableHead>
                  <TableHead className="font-semibold text-stone-700">Grid Tie (Net Meter)</TableHead>
                  <TableHead className="font-semibold text-stone-700">Status</TableHead>
                  <TableHead className="text-right font-semibold text-stone-700 pr-5">Quick Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-stone-100">
                {filteredInstallations.map((inst) => {
                  const assignedEngineer = employees.find(u => u.id === inst.engineerId);
                  const completionPercentage = inst.progress || 0;
                  return (
                    <TableRow key={inst.id} className="hover:bg-stone-50/50">
                      <TableCell className="font-mono text-xs text-stone-500">
                        {(inst.id || '').substring(0, 8)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-bold text-stone-900">{getInstClient(inst).name}</span>
                          <span className="text-xs text-stone-500 font-medium">
                            {[getInstClient(inst).phone, getInstClient(inst).city].filter(Boolean).join(' · ') || `${getRegionName(inst.region || getInstClient(inst).region)} Region`}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-stone-100 flex items-center justify-center text-[9px] font-bold text-stone-600 border border-stone-200">
                            {String(assignedEngineer?.name || 'U').charAt(0) || 'U'}
                          </div>
                          <span className="text-xs font-semibold text-stone-700">
                            {assignedEngineer?.name || 'Unassigned'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-stone-600 font-medium">
                        {inst.expectedEndDate || inst.startDate ? new Date(inst.expectedEndDate || inst.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 w-28">
                          <div className="w-full h-1.5 bg-stone-100 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-orange-500 rounded-full transition-all duration-300" 
                              style={{ width: `${completionPercentage}%` }} 
                            />
                          </div>
                          <span className="text-[10px] font-bold text-stone-500 text-right">{completionPercentage}% Completed</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn(
                          "font-semibold text-[11px]",
                          inst.netMeterStatus === 'Installed' ? "text-green-600 border-green-200 bg-green-50" :
                          inst.netMeterStatus === 'Approved' ? "text-blue-600 border-blue-200 bg-blue-50" :
                          inst.netMeterStatus === 'Applied' ? "text-yellow-600 border-yellow-200 bg-yellow-50" : "text-stone-500 bg-stone-50"
                        )}>
                          {inst.netMeterStatus || 'Pending'}
                        </Badge>
                      </TableCell>
                      <TableCell>{getStatusBadge(inst.status)}</TableCell>
                      <TableCell className="text-right pr-4">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            className="h-8 text-orange-600 hover:text-orange-700 hover:bg-orange-50 font-semibold px-2"
                            onClick={() => {
                              setSelectedInst(inst);
                              setIsDetailsDialogOpen(true);
                            }}
                          >
                            <Eye size={14} className="mr-1" /> View details
                          </Button>
                          
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-stone-100 rounded-full">
                                <MoreVertical size={15} />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              <DropdownMenuLabel>Project Actions</DropdownMenuLabel>
                              <DropdownMenuItem 
                                className="cursor-pointer" 
                                onClick={() => {
                                  setSelectedInst(inst);
                                  setIsDetailsDialogOpen(true);
                                }}
                              >
                                <Eye size={14} className="mr-2 text-stone-500" /> Milestone Tracking
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                className="cursor-pointer" 
                                onClick={() => {
                                  setSelectedInst(inst);
                                  setIsAssetDialogOpen(true);
                                }}
                              >
                                <Wrench size={14} className="mr-2 text-stone-500" /> Edit System Specs
                              </DropdownMenuItem>

                              <DropdownMenuSeparator />
                              <DropdownMenuLabel className="text-[9px] text-stone-400 uppercase tracking-widest py-1 px-2 font-bold">Fast Status Change</DropdownMenuLabel>
                              {kanbanColumns.filter((c) => c.id !== 'CANCELLED').map((c) => {
                                const Icon = c.icon;
                                return (
                                  <DropdownMenuItem
                                    key={c.id}
                                    className="cursor-pointer"
                                    onClick={() => setInstStatus(inst.id, c.id)}
                                  >
                                    <Icon size={13} className="mr-2 text-stone-400" /> {c.title} ({INST_PROGRESS[c.id]}%)
                                  </DropdownMenuItem>
                                );
                              })}

                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-red-600 cursor-pointer"
                                onClick={() => setDeleteId(inst.id)}
                              >
                                <Trash2 size={14} className="mr-2" /> Delete Track Sheet
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
          {kanbanColumns.map((col) => {
            const columnItems = filteredInstallations.filter(i => normInstStatus(i.status) === col.id);
            return (
              <div key={col.id} className="flex flex-col gap-4">
                <div className={cn("flex items-center justify-between p-3 bg-card rounded-lg border-l-4 shadow-sm", col.color)}>
                  <div className="flex items-center gap-2">
                    <col.icon size={18} className="text-stone-500" />
                    <h3 className="font-bold text-stone-700 text-sm">{col.title}</h3>
                  </div>
                  <Badge variant="secondary" className="bg-stone-100 text-stone-600 text-xs font-bold px-2 py-0.5">
                    {columnItems.length}
                  </Badge>
                </div>
                
                <div className="flex flex-col gap-3 min-h-[300px]">
                  {columnItems.map((inst) => {
                    const assignedEngineer = employees.find(u => u.id === inst.engineerId);
                    return (
                      <Card 
                        key={inst.id} 
                        className="border-stone-200 hover:border-orange-200 transition-colors cursor-pointer group shadow-sm bg-card"
                        onClick={() => {
                          setSelectedInst(inst);
                          setIsDetailsDialogOpen(true);
                        }}
                      >
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono text-stone-400 font-bold uppercase tracking-wider">{(inst.id || '').substring(0, 8)}</span>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-auto min-h-4 bg-stone-50/55 shrink-0 max-w-[55%] text-right leading-tight whitespace-normal">{getRegionName(inst.region || getInstClient(inst).region)}</Badge>
                          </div>
                          <div>
                            <h4 className="font-bold text-stone-800 group-hover:text-orange-600 transition-colors text-sm">{getInstClient(inst).name}</h4>
                            {[getInstClient(inst).phone, getInstClient(inst).city].filter(Boolean).length > 0 && (
                              <p className="text-xs text-stone-500 mt-0.5 font-medium">
                                {[getInstClient(inst).phone, getInstClient(inst).city].filter(Boolean).join(' · ')}
                              </p>
                            )}
                            <p className="text-xs text-stone-500 mt-1 font-medium">
                              {inst.panelCount || 28} Panels • {inst.inverterModel || 'Growatt 10KW'}
                            </p>
                          </div>
                          <div className="flex flex-col gap-1.5 pt-2 border-t border-stone-100">
                            <div className="flex items-center justify-between text-[11px] text-stone-600">
                              <span className="font-semibold text-stone-500">Milestone Progress:</span>
                              <span className="font-bold text-stone-700">{inst.progress || 0}%</span>
                            </div>
                            <div className="w-full h-1 bg-stone-100 rounded-full overflow-hidden">
                              <div className="h-full bg-orange-500" style={{ width: `${inst.progress || 0}%` }} />
                            </div>
                          </div>
                          <div className="flex items-center justify-between pt-1">
                            <div className="flex items-center gap-1.5">
                              <div className="w-5 h-5 rounded-full bg-stone-100 flex items-center justify-center text-[7px] font-bold text-stone-500 border border-stone-200">
                                {String(assignedEngineer?.name || 'U').charAt(0) || 'U'}
                              </div>
                              <span className="text-[10px] text-stone-600 font-semibold">
                                {assignedEngineer?.name || 'Unassigned'}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 text-[10px] text-stone-450 font-medium">
                              <Calendar size={10} />
                              {new Date(inst.startDate || Date.now()).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Installation Details Dialog */}
      <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader className="pb-3 border-b border-stone-100">
            <div className="flex flex-col gap-2">
              <DialogTitle className="flex items-start justify-between gap-3 text-stone-900 text-lg font-bold">
                <span className="flex items-center gap-2.5 min-w-0">
                  <span className="w-8 h-8 rounded-lg bg-orange-100 flex-shrink-0 flex items-center justify-center">
                    <Milestone size={16} className="text-orange-600" />
                  </span>
                  <span className="leading-snug">Project Milestone Track</span>
                </span>
                <span className="text-xs text-orange-600 font-mono bg-orange-50 border border-orange-100 px-3 py-1 rounded-full shrink-0">
                  ID: {(selectedInst?.id || '').substring(0, 8)}
                </span>
              </DialogTitle>
              <DialogDescription className="text-sm">
                Complete technical specification audit and deployment milestone status for <span className="font-semibold text-stone-700">{selectedInst ? getInstClient(selectedInst).name : ''}</span>.
              </DialogDescription>
            </div>
          </DialogHeader>

          {selectedInst && (
            <div className="space-y-6 py-4">
              {/* Client Profile */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-card p-4 rounded-xl border border-stone-200">
                {[
                  ['Client Name', getInstClient(selectedInst).name],
                  ['Phone', getInstClient(selectedInst).phone || '—'],
                  ['City', getInstClient(selectedInst).city || '—'],
                  ['Region', getRegionName(selectedInst.region || getInstClient(selectedInst).region)],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block mb-1">{label}</label>
                    <p className="text-sm font-semibold text-stone-800 truncate" title={String(value)}>{value}</p>
                  </div>
                ))}
              </div>
              {/* Top Summary Status Board */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-stone-50 p-4 rounded-xl border border-stone-200">
                <div className="min-w-0">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block mb-1.5">Execution Status</label>
                  <Select
                    // Normalize on read so a legacy Title Case row still
                    // resolves to the matching option instead of an empty
                    // trigger; the written value is always canonical.
                    value={normInstStatus(selectedInst.status)}
                    onValueChange={(val: any) => setInstStatus(selectedInst.id, val)}
                  >
                    <SelectTrigger className="w-full bg-card font-semibold border-stone-200 h-9">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      {kanbanColumns.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="min-w-0">
                  <label htmlFor="editEngineerId" className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block mb-1.5">Assigned Installer / Engineer</label>
                  <Select 
                    value={selectedInst.engineerId} 
                    onValueChange={(val) => handleUpdateProperty(selectedInst.id, { engineerId: val })}
                  >
                    <SelectTrigger id="editEngineerId" className="w-full bg-card font-medium border-stone-200 h-9">
                      <SelectValue placeholder="Assign engineer" className="truncate" />
                    </SelectTrigger>
                    <SelectContent>
                      {employees.filter(e => e.role === 'ENGINEER' || e.role === 'SUPER_ADMIN' || e.role === 'ADMIN').map(e => (
                        <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="min-w-0">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block mb-1.5">Completion Progress</label>
                  <div className="flex items-center gap-2 h-9">
                    <input 
                      type="range" 
                      min="0" 
                      max="100" 
                      value={selectedInst.progress || 0}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setSelectedInst((prev: any) => prev ? { ...prev, progress: val } : null);
                      }}
                      onMouseUp={(e: any) => {
                        handleUpdateProperty(selectedInst.id, { progress: Number(e.target.value) });
                      }}
                      onTouchEnd={(e: any) => {
                        handleUpdateProperty(selectedInst.id, { progress: Number(e.target.value) });
                      }}
                      className="w-full h-2 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-orange-600"
                    />
                    <span className="text-xs font-bold text-stone-700 w-12 text-right shrink-0">
                      {selectedInst.progress || 0}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Tabs for sections */}
              <Tabs defaultValue="scheduling" className="w-full">
                <TabsList className="grid w-full grid-cols-3 bg-stone-100 rounded-lg p-1 h-auto gap-1">
                  <TabsTrigger value="scheduling" className="rounded-md text-xs font-semibold h-auto min-h-8 py-1.5 text-center whitespace-normal leading-tight">Project Milestones</TabsTrigger>
                  <TabsTrigger value="netmeter" className="rounded-md text-xs font-semibold h-auto min-h-8 py-1.5 text-center whitespace-normal leading-tight">Grid-Tie &amp; Inspection</TabsTrigger>
                  <TabsTrigger value="assets" className="rounded-md text-xs font-semibold h-auto min-h-8 py-1.5 text-center whitespace-normal leading-tight">System Hardware Specs</TabsTrigger>
                </TabsList>

                {/* Section 1: Scheduling & Project Remarks */}
                <TabsContent value="scheduling" className="space-y-4 pt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="sched_start" className="text-xs text-stone-600 font-semibold">Start Date</Label>
                      <Input 
                        id="sched_start"
                        type="date" 
                        value={selectedInst.startDate ? selectedInst.startDate.substring(0, 10) : ''}
                        onChange={(e) => handleUpdateProperty(selectedInst.id, { startDate: e.target.value })}
                        className="bg-card border-stone-200 h-9 text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="sched_end" className="text-xs text-stone-600 font-semibold">Expected / Actual Completion Date</Label>
                      <Input 
                        id="sched_end"
                        type="date" 
                        value={selectedInst.expectedEndDate ? selectedInst.expectedEndDate.substring(0, 10) : ''}
                        onChange={(e) => handleUpdateProperty(selectedInst.id, { expectedEndDate: e.target.value })}
                        className="bg-card border-stone-200 h-9 text-xs"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs text-stone-600 font-semibold">Handover Remarks & Field Notes</Label>
                    <textarea 
                      value={selectedInst.remarks || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedInst((prev: any) => prev ? { ...prev, remarks: val } : null);
                      }}
                      onBlur={(e) => handleUpdateProperty(selectedInst.id, { remarks: e.target.value })}
                      placeholder="Enter field and civil construction remarks, cabling path notations..." 
                      className="resize-none flex min-h-[90px] w-full rounded-md border border-stone-200 bg-card px-3 py-2 text-xs ring-offset-card placeholder:text-stone-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2" 
                    />
                  </div>
                </TabsContent>

                {/* Section 2: Net Metering */}
                <TabsContent value="netmeter" className="space-y-4 pt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl bg-orange-50/50 border border-orange-100">
                    <div className="space-y-2">
                      <Label className="text-xs text-stone-700 font-bold block mb-1">Net Metering Application</Label>
                      <div className="flex gap-2">
                        <Button 
                          type="button"
                          variant={selectedInst.netMeterApplied ? "default" : "outline"}
                          className={cn("text-xs h-8 flex-1 font-semibold", selectedInst.netMeterApplied ? "bg-orange-600 text-white" : "bg-card text-stone-700")}
                          onClick={() => handleUpdateProperty(selectedInst.id, { netMeterApplied: true })}
                        >
                          Applied
                        </Button>
                        <Button 
                          type="button"
                          variant={!selectedInst.netMeterApplied ? "default" : "outline"}
                          className={cn("text-xs h-8 flex-1 font-semibold", !selectedInst.netMeterApplied ? "bg-stone-600 text-white" : "bg-card text-stone-700")}
                          onClick={() => handleUpdateProperty(selectedInst.id, { netMeterApplied: false })}
                        >
                          Not Applied
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs text-stone-700 font-bold block mb-0.5">Application Status</Label>
                      <Select 
                        value={selectedInst.netMeterStatus || 'Pending'} 
                        onValueChange={(val: any) => handleUpdateProperty(selectedInst.id, { netMeterStatus: val })}
                      >
                        <SelectTrigger className="w-full bg-card border-stone-200 h-9 text-xs">
                          <SelectValue placeholder="Net Meter Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Pending">Pending</SelectItem>
                          <SelectItem value="Applied">Applied</SelectItem>
                          <SelectItem value="Approved">Approved</SelectItem>
                          <SelectItem value="Installed">Installed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-stone-600 font-semibold block">Site Vetting / Inspection Status</Label>
                      <Select 
                        value={selectedInst.inspectionStatus || 'Pending'} 
                        onValueChange={(val: any) => handleUpdateProperty(selectedInst.id, { inspectionStatus: val })}
                      >
                        <SelectTrigger className="w-full bg-card border-stone-200 h-9 text-xs">
                          <SelectValue placeholder="Inspection Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Pending">Pending Audit</SelectItem>
                          <SelectItem value="Done">Completed & Vetted</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs text-stone-600 font-semibold">Net Meter ID / Register Number</Label>
                      <Input 
                        defaultValue={assetField(selectedInst, 'netMeterNumber') ?? ''}
                        onBlur={(e) => {
                          const val = e.target.value;
                          if (val === (assetField(selectedInst, 'netMeterNumber') ?? '')) return;
                          // Write ONLY assetDetails. The old code also wrote
                          // `assets`, replacing the panel/inverter array with an
                          // object — one keystroke wiped the hardware BOM.
                          // Also commit on blur, not per keystroke (9 PATCHes + 9
                          // toasts per field, and out-of-order responses).
                          handleUpdateProperty(selectedInst.id, {
                            assetDetails: { ...(selectedInst.assetDetails || {}), netMeterNumber: val },
                          });
                        }}
                        placeholder="e.g. NM-552391"
                        className="bg-card border-stone-200 h-9 text-xs"
                      />
                    </div>
                  </div>
                </TabsContent>

                {/* Section 3: Technical Assets Specs Overview */}
                <TabsContent value="assets" className="space-y-4 pt-4">
                  {(selectedInst.assetDetails || selectedInst.assets) ? (
                    <div className="space-y-4">
                      <div className="border border-stone-200 rounded-xl p-4 bg-card shadow-sm space-y-3">
                        <div className="flex justify-between items-center pb-2 border-b border-stone-100">
                          <h4 className="font-bold text-stone-800 text-xs uppercase tracking-wider">Hardware Bill of Materials:</h4>
                          <Badge className="bg-green-50 text-green-700 border border-green-200 hover:bg-green-50 font-bold text-[10px]">Registered</Badge>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs font-semibold">
                          <div>
                            <span className="text-stone-400 block font-normal">System Size:</span>
                            <span className="text-stone-800 text-xs">
                              {selectedInst.assetDetails?.systemSizeKW || selectedInst.assets?.systemSizeKW || (selectedInst?.panelCount ? (selectedInst.panelCount * ((selectedInst.assetDetails?.panelWatt || selectedInst.assets?.panelWatt || 540) / 1000)).toFixed(2) : '')} KWp
                            </span>
                          </div>
                          <div>
                            <span className="text-stone-400 block font-normal">Net Meter Number:</span>
                            <span className="text-stone-800 text-xs">
                              {selectedInst.assetDetails?.netMeterNumber || selectedInst.assets?.netMeterNumber || 'Not Registered'}
                            </span>
                          </div>
                          
                          <div className="col-span-2 py-1 bg-stone-50 rounded px-2 font-bold text-stone-500 text-[10px] tracking-wider uppercase">SOLAR ARRAY CONFIGURATION</div>
                          <div>
                            <span className="text-stone-400 block font-normal">Solar Panels:</span>
                            <span className="text-stone-800">
                              {(selectedInst.assetDetails?.panelBrand || selectedInst.assets?.panelBrand || 'Tata Power')} 
                              {" "}({(selectedInst.assetDetails?.panelModel || selectedInst.assets?.panelModel || 'TP-540')})
                            </span>
                          </div>
                          <div>
                            <span className="text-stone-400 block font-normal">Panel Breakdown:</span>
                            <span className="text-stone-800">
                              {(selectedInst.assetDetails?.panelCount || selectedInst.assets?.panelCount || selectedInst?.panelCount || 30)} modules × {(selectedInst.assetDetails?.panelWatt || selectedInst.assets?.panelWatt || 540)}W
                            </span>
                          </div>

                          <div className="col-span-2 py-1 bg-stone-50 rounded px-2 font-bold text-stone-500 text-[10px] tracking-wider uppercase">INVERTER ELECTRONICS</div>
                          <div>
                            <span className="text-stone-400 block font-normal">Smart Inverter:</span>
                            <span className="text-stone-800">
                              {(selectedInst.assetDetails?.inverterBrand || selectedInst.assets?.inverterBrand || 'Luminous')}
                              {" "}({(selectedInst.assetDetails?.inverterModel || selectedInst.assets?.inverterModel || selectedInst?.inverterModel || 'Growatt MOD-10K')})
                            </span>
                          </div>
                          <div>
                            <span className="text-stone-400 block font-normal">Capacity & Serial:</span>
                            <span className="text-stone-800">
                              {(selectedInst.assetDetails?.inverterCapacity || selectedInst.assets?.inverterCapacity || '10KW')} (S/N: {(selectedInst.assetDetails?.inverterSerialNumber || selectedInst.assets?.inverterSerialNumber || 'N/A')})
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex justify-end">
                        <Button 
                          type="button" 
                          variant="outline" 
                          className="text-orange-600 border-orange-200 hover:bg-orange-50 font-semibold h-8 text-xs"
                          onClick={() => {
                            setIsDetailsDialogOpen(false);
                            setIsAssetDialogOpen(true);
                          }}
                        >
                          <Wrench size={13} className="mr-1.5" /> Edit Specifications
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-10 border border-dashed border-stone-200 rounded-xl space-y-3">
                      <p className="text-stone-400 text-xs font-semibold">No hardware specifications or panel serial registrations logged yet.</p>
                      <Button 
                        type="button" 
                        variant="default" 
                        className="bg-orange-600 hover:bg-orange-700 text-white text-xs h-8"
                        onClick={() => {
                          setIsDetailsDialogOpen(false);
                          setIsAssetDialogOpen(true);
                        }}
                      >
                        Enter Solar Specs
                      </Button>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          )}

          <DialogFooter className="border-t border-stone-100 pt-3">
            <Button className="bg-orange-600 hover:bg-orange-700 h-9 font-semibold text-sm" onClick={() => setIsDetailsDialogOpen(false)}>
              Close Audit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Asset Specifications Dialog */}
      <Dialog open={isAssetDialogOpen} onOpenChange={setIsAssetDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="pb-2 border-b border-stone-100 font-bold">
            <DialogTitle>Edit Hardware Specifications - {selectedInst ? getInstClient(selectedInst).name : ''}</DialogTitle>
            <DialogDescription>Log direct physical asset serial numbers, brands, and net-meter assignments.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddAssets} className="space-y-5 py-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-stone-650 font-bold">System Size (KWp)</Label>
                <Input 
                  name="systemSizeKW" 
                  type="number" 
                  step="any"
                  defaultValue={selectedInst?.assetDetails?.systemSizeKW || selectedInst?.assets?.systemSizeKW || (selectedInst?.panelCount ? (selectedInst.panelCount * 0.54).toFixed(2) : '')} 
                  className="h-9 text-xs"
                  required 
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-stone-650 font-bold">Net Meter ID Number</Label>
                <Input 
                  name="netMeterNumber" 
                  placeholder="NM-XXXXXX" 
                  defaultValue={selectedInst?.assetDetails?.netMeterNumber || selectedInst?.assets?.netMeterNumber || ''} 
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <Separator className="bg-stone-100" />
            <div className="flex items-center gap-2 mb-1">
              <Building size={16} className="text-orange-600 animate-pulse" />
              <h3 className="font-bold text-sm text-stone-900 tracking-wider uppercase">Solar Panel Configuration</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-stone-650 font-semibold">Panel Manufacturer Brand</Label>
                <Input name="panelBrand" placeholder="e.g. Tata Power" defaultValue={String(assetField(selectedInst, 'panelBrand') ?? assetRow(selectedInst, 'Solar Panel')?.brand ?? '')} className="h-9 text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-stone-650 font-semibold">Panel Model / Series Code</Label>
                <Input name="panelModel" placeholder="e.g. TP-540" defaultValue={String(assetField(selectedInst, 'panelModel') ?? assetRow(selectedInst, 'Solar Panel')?.model ?? '')} className="h-9 text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-stone-650 font-semibold">Module Count (Qty)</Label>
                <Input name="panelCount" type="number" placeholder="30" defaultValue={String(assetField(selectedInst, 'panelCount') ?? assetRow(selectedInst, 'Solar Panel')?.quantity ?? selectedInst?.panelCount ?? '')} className="h-9 text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-stone-650 font-semibold">Single Panel Wattage</Label>
                <Input name="panelWatt" type="number" placeholder="540" defaultValue={String(assetField(selectedInst, 'panelWatt') ?? assetRow(selectedInst, 'Solar Panel')?.wattage ?? '')} className="h-9 text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-stone-650 font-semibold">Installation Vetting Date</Label>
                <Input name="panelInstallationDate" type="date" placeholder={toLocalDateKey()} defaultValue={toDateInputValue(assetField(selectedInst, 'panelInstallationDate') ?? assetRow(selectedInst, 'Solar Panel')?.installationDate)} className="h-9 text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-stone-650 font-semibold">Warranty Expiration Date</Label>
                <Input 
                  name="panelWarrantyExpiry" 
                  type="date" 
                  defaultValue={toDateInputValue(assetField(selectedInst, 'panelWarrantyExpiry') ?? assetRow(selectedInst, 'Solar Panel')?.warrantyExpiry)}
                  className="h-9 text-xs" 
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-stone-650 font-semibold">Panel Serial Numbers (Separate via commas)</Label>
              <Input 
                name="panelSerialNumbers" 
                placeholder="e.g. SN-0012, SN-0013" defaultValue={serialsToText(assetField(selectedInst, 'panelSerialNumbers') ?? assetRow(selectedInst, 'Solar Panel')?.serialNumber)}
                className="h-9 text-xs"
              />
            </div>

            <Separator className="bg-stone-100" />
            <div className="flex items-center gap-2 mb-1">
              <Activity size={16} className="text-orange-600" />
              <h3 className="font-bold text-sm text-stone-900 tracking-wider uppercase">Inverter & Smart System Specs</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-stone-650 font-semibold">Inverter Brand</Label>
                <Input name="inverterBrand" placeholder="e.g. Luminous" defaultValue={String(assetField(selectedInst, 'inverterBrand') ?? assetRow(selectedInst, 'Inverter')?.brand ?? '')} className="h-9 text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-stone-650 font-semibold">Inverter Model</Label>
                <Input name="inverterModel" placeholder="e.g. Growatt MOD-10K" defaultValue={String(assetField(selectedInst, 'inverterModel') ?? assetRow(selectedInst, 'Inverter')?.model ?? selectedInst?.inverterModel ?? '')} className="h-9 text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-stone-650 font-semibold">Inverter Operating Capacity</Label>
                <Input name="inverterCapacity" placeholder="e.g. 10KW" defaultValue={String(assetField(selectedInst, 'inverterCapacity') ?? assetRow(selectedInst, 'Inverter')?.capacity ?? '')} className="h-9 text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-stone-650 font-semibold">Hardware Serial Code (S/N)</Label>
                <Input name="inverterSerialNumber" placeholder="e.g. INV-99120" defaultValue={String(assetField(selectedInst, 'inverterSerialNumber') ?? assetRow(selectedInst, 'Inverter')?.serialNumber ?? '')} className="h-9 text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-stone-650 font-semibold">Warranty Expiration Date</Label>
                <Input 
                  name="inverterWarrantyExpiry" 
                  type="date" 
                  defaultValue={toDateInputValue(assetField(selectedInst, 'inverterWarrantyExpiry') ?? assetRow(selectedInst, 'Inverter')?.warrantyExpiry)}
                  className="h-9 text-xs" 
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsAssetDialogOpen(false)}>Cancel</Button>
              <Button type="submit" className="bg-orange-600 hover:bg-orange-700 text-white">Save Equipment Logs</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Track Sheet — confirm (live DELETE /installations/:id) */}
      <Dialog open={!!deleteId} onOpenChange={o => { if (!o) setDeleteId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Delete Track Sheet</DialogTitle><DialogDescription>Are you sure? This cannot be undone.</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteInstallation} disabled={deleteLoading}>{deleteLoading && <Loader2 size={16} className="mr-2 animate-spin" />}Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default InstallationTracking;
