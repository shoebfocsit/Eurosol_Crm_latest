import React, { useState, useEffect } from 'react';
import {
  Wrench,
  Plus,
  Search,
  Filter,
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
  MoreVertical,
  User as UserIcon,
  Loader2,
  Trash2
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
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { serviceRequestsApi, employeesApi, leadsApi, tasksApi, calendarApi } from '../services/api';
import { SERVICE_REQUEST_STATUSES, apiMessage, sameStatus, statusLabel } from '@/lib/statuses';
import { cn, toLocalDateKey, toApiIso } from '@/lib/utils';
import { useRegion } from '../contexts/RegionContext';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';

const ServiceManagement: React.FC = () => {
  const { hasPermission, user } = useAuth();
  const isServiceManager = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN' || !!user?.isSuperAdmin;
  // Ownership check mirroring SiteSurvey: an engineer may only move the status
  // of requests assigned to them.
  const canActOnRequest = (req: any) =>
    isServiceManager || String(req?.engineerId || req?.assignedTo || '') === String(user?.id || '');
  const [requests, setRequests] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newRequest, setNewRequest] = useState({
    leadId: '',
    type: 'AMC',
    engineerId: '',
    visitDate: '',
    description: ''
  });
  const [dropdownOpenId, setDropdownOpenId] = useState<string | null>(null);
  const [viewRequest, setViewRequest] = useState<any | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [calMonth, setCalMonth] = useState(() => new Date());
  const [amcEvents, setAmcEvents] = useState<any[]>([]);
  const { matchRegion } = useRegion();

  // Single-fetch read for one service request: detail dialog + post-mutation
  // refresh, instead of re-listing every request.
  const fetchRequestById = async (id: string): Promise<any | null> => {
    try {
      const res = await serviceRequestsApi.getById(id);
      const body = res?.data?.data;
      return body?.serviceRequest || body || null;
    } catch {
      return null;
    }
  };

  const fetchRequests = async () => {
    setIsLoading(true);
    try {
      const response = await serviceRequestsApi.getAll();
      const data = response.data.data?.serviceRequests || response.data.data;
      setRequests(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error('Failed to fetch service requests');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchInitialData = async () => {
    // Independent fetches: a 403 from /employees (common for roles without
    // employees:read) used to abort the whole Promise.all and throw away the
    // leads list too, leaving an empty "Select Client" dropdown.
    employeesApi.getAll().then(r => {
      const empData = r.data?.data?.employees || r.data?.data;
      setEmployees(Array.isArray(empData) ? empData : []);
    }).catch(() => { /* no employee read access */ });

    leadsApi.getAll({ limit: 200 }).then(r => {
      const leadsDataRaw = r.data?.data?.leads || r.data?.data;
      const leadsData = Array.isArray(leadsDataRaw) ? leadsDataRaw : [];
      // Region join ke liye poori list (default page me purane leads kat jate hain).
      setLeads(leadsData.filter((l: any) => String(l.status || '').toLowerCase() !== 'lost'));
    }).catch((error) => { console.error('Failed to fetch leads', error); });
  };

  useEffect(() => {
    if (!hasPermission('service_requests', 'read')) {
      toast.error('Access denied');
      return;
    }
    fetchRequests();
    fetchInitialData();
  }, []);

  const handleCreateRequest = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const matchedLead = leads.find(l => l.id === newRequest.leadId);
    const rawType = newRequest.type || 'AMC';
    const type = rawType === 'Complaint' ? 'Complaint'
      : rawType === 'Warranty' ? 'Warranty Claim'
      : rawType === 'General Checkup' ? 'General Checkup'
      : 'AMC';
    const requestData: any = {
      type,
      subject: newRequest.description || `${rawType} Request`,
      description: newRequest.description || `${rawType} Request`,
      customerName: matchedLead?.name || 'Walk-in Customer',
      customerPhone: matchedLead?.phone || matchedLead?.phoneNumber || '',
      // These were collected in the form but never sent: the list reads
      // `scheduledDate || visitDate`, so the visit silently fell back to the
      // creation date, and leadId stayed undefined which made the request
      // bypass every region filter (keepUnknown=true on an unresolvable lead).
      leadId: newRequest.leadId || undefined,
      visitDate: toApiIso(newRequest.visitDate) || undefined,
    };

    try {
      const res = await serviceRequestsApi.create(requestData);
      const created = res.data?.data?.id || res.data?.id;
      if (created && newRequest.engineerId) {
        try {
          await serviceRequestsApi.update(created, { engineerId: newRequest.engineerId });
        } catch { /* engineer assignment is optional */ }
      }

      // Persist the scheduled visit as an AMC task so it appears on the calendar.
      const visitDate = newRequest.visitDate;
      if (visitDate) {
        try {
          await tasksApi.create({
            title: `AMC Visit - ${matchedLead?.name || 'Walk-in Customer'}`,
            description: newRequest.description || 'Scheduled AMC visit',
            type: 'AMC',
            priority: 'medium',
            // Tasks API enum lowercase hai (open/in_progress/done) —
            // 'OPEN' bhejne par 400 aata tha aur calendar entry nahi banti thi.
            status: 'open',
            assigneeId: newRequest.engineerId || undefined,
            dueDate: toApiIso(visitDate) || undefined,
          });
        } catch (taskErr: any) {
          const msg = taskErr.response?.data?.message || 'Failed to add visit to calendar';
          toast.error(Array.isArray(msg) ? msg.join(', ') : msg);
        }
      }

      fetchRequests();
      setIsCreateDialogOpen(false);
      setNewRequest({
        leadId: '',
        type: 'AMC',
        engineerId: '',
        visitDate: '',
        description: ''
      });
      toast.success('Service request created successfully!');
    } catch (error: any) {
      const msg = error.response?.data?.message || error.message || 'Failed to create service request';
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg);
    }
  };

  const fetchCalendarEvents = async () => {
    try {
      const calRes = await calendarApi.getEvents();
      const events = calRes.data.data?.events || calRes.data.data;
      setAmcEvents(Array.isArray(events) ? events.filter((e: any) => String(e.kind || e.type || e.source || '').toUpperCase() === 'AMC') : []);
    } catch {
      setAmcEvents([]);
    }
  };

  const normalizeType = (t: string) => String(t || '').toLowerCase().replace(/[^a-z]/g, '');
  const filteredRequests = requests.filter(req => {
    const engineerName = req.engineer?.name || employees.find(e => e.id === (req.engineerId || req.assignedTo))?.name || '';
    const clientName = req.customerName || req.lead?.name || leads.find(l => l.id === req.leadId)?.name || '';
    const matchesSearch = clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         engineerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (req.id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (req.subject || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (req.description || '').toLowerCase().includes(searchTerm.toLowerCase());
    // Stored types can be variants like 'Warranty Claim' while the filter says 'Warranty' — match tolerantly.
    const matchesType = typeFilter === 'all' || (() => {
      const f = normalizeType(typeFilter);
      const v = normalizeType(req.type);
      return v === f || v.startsWith(f) || f.startsWith(v);
    })();
    // Global region: resolve via lead join (keep if unclassifiable).
    // List wala full lead PEHLE (usme region hai); nested lead shadow na kare.
    const rlead = leads.find(l => l.id === req.leadId) || req.lead;
    const matchesRegion = matchRegion(rlead?.region || rlead?.regionId, true);
    return matchesSearch && matchesType && matchesRegion;
  });

  const availableEngineers = employees.filter(e => 
    e.role === 'ENGINEER' || 
    e.role === 'ADMIN' || 
    e.role === 'SUPER_ADMIN'
  );
  const engineerList = availableEngineers.length > 0 ? availableEngineers : employees;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">AMC & Service Management</h1>
          <p className="text-stone-500">Manage maintenance contracts and service complaints</p>
        </div>
        
        <div className="flex items-center gap-2">
            <Dialog open={isCalendarOpen} onOpenChange={(open) => {
              setIsCalendarOpen(open);
              if (open) {
                setCalMonth(new Date());
                fetchRequests();
                fetchCalendarEvents();
              }
            }}>
            <DialogTrigger asChild>
              <Button variant="outline" className="border-stone-200">
                <Calendar size={18} className="mr-2" /> AMC Calendar
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-3xl">
              <DialogHeader>
                <DialogTitle>AMC &amp; Service Visit Calendar</DialogTitle>
                <DialogDescription>
                  Scheduled visits from service requests. Click a highlighted day to see the requests scheduled for it.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-stone-800">
                    {calMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))}>Prev</Button>
                    <Button variant="outline" size="sm" onClick={() => setCalMonth(new Date())}>Today</Button>
                    <Button variant="outline" size="sm" onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))}>Next</Button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-stone-400 pb-1">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d}>{d}</div>)}
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: new Date(calMonth.getFullYear(), calMonth.getMonth(), 1).getDay() }).map((_, i) => <div key={`e${i}`} />)}
                  {Array.from({ length: new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0).getDate() }).map((_, i) => {
                    const day = i + 1;
                    const dateStr = `${calMonth.getFullYear()}-${String(calMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const dayRequests = requests.filter(r => {
                      const d = r.scheduledDate || r.visitDate;
                      // UTC-ISO strings sliced to 10 chars shift a day in IST.
                      return d ? toLocalDateKey(new Date(d)) === dateStr : false;
                    });
                    const dayAmcEvents = amcEvents.filter((e: any) => {
                      const d = e.date || e.start || e.dueDate;
                      return d ? toLocalDateKey(new Date(d)) === dateStr : false;
                    });
                    const hasItems = dayRequests.length > 0 || dayAmcEvents.length > 0;
                    const isToday = dateStr === toLocalDateKey();
                    return (
                      <div key={day} className={cn(
                        "min-h-[76px] rounded-lg border p-1 text-xs",
                        isToday ? "border-orange-300 bg-orange-50" : "border-stone-100",
                        hasItems && "bg-orange-50/40"
                      )}>
                        <p className={cn("font-medium", isToday && "text-orange-600")}>{day}</p>
                        <div className="space-y-0.5 mt-0.5">
                          {dayAmcEvents.map((e: any) => (
                            <button
                              key={`ev-${e.id || e.title}`}
                              type="button"
                              title={`${e.title || e.name} — ${e.kind || e.type || 'AMC'}`}
                              onClick={() => toast.info(`${e.title || e.name} · ${e.kind || e.type || 'AMC'}`)}
                              className="block w-full truncate rounded bg-orange-200 px-1 py-0.5 text-left text-[10px] text-orange-800"
                            >
                              {e.title || e.name}
                            </button>
                          ))}
                          {dayRequests.map(r => (
                            <button
                              key={r.id}
                              type="button"
                              title={`${r.customerName || `#${String(r.id || '').substring(0, 8)}`} — ${r.type} (${r.status || '—'})`}
                              onClick={() => toast.info(`${r.customerName || r.lead?.name || 'Client'} · ${r.type} · ${r.status || '—'}`)}
                              className={cn(
                                "block w-full truncate rounded px-1 py-0.5 text-left text-[10px]",
                                String(r.type || '').toUpperCase() === 'AMC' ? "bg-orange-200 text-orange-800" : "bg-blue-100 text-blue-700"
                              )}
                            >
                              {r.customerName || r.lead?.name || `#${String(r.id || '').substring(0, 8)}`}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              {hasPermission('service_requests', 'create') && (
              <Button className="bg-orange-600 hover:bg-orange-700 text-white">
                <Plus size={18} className="mr-2" />
                New Service Request
              </Button>
              )}
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New Service Request</DialogTitle>
                <DialogDescription>Record a new service complaint or maintenance visit.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateRequest} className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="leadId">Select Client (Lead)</Label>
                  <Select 
                    name="leadId" 
                    value={newRequest.leadId} 
                        onValueChange={(val) => setNewRequest(prev => ({ ...prev, leadId: val || '' }))}
                    required
                  >
                    <SelectTrigger id="leadId">
                      <SelectValue placeholder="Select client" />
                    </SelectTrigger>
                    <SelectContent>
                      {leads.map(l => (
                        <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="type">Request Type</Label>
                    <Select 
                      name="type" 
                      value={newRequest.type} 
                        onValueChange={(val) => setNewRequest(prev => ({ ...prev, type: val || 'AMC' }))}
                        required
                      >
                        <SelectTrigger id="type">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="AMC">AMC Visit</SelectItem>
                        <SelectItem value="Complaint">Complaint</SelectItem>
                        <SelectItem value="Warranty">Warranty Service</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="engineerId">Assign Engineer</Label>
                    <Select 
                      name="engineerId" 
                      value={newRequest.engineerId} 
                        onValueChange={(val) => setNewRequest(prev => ({ ...prev, engineerId: val || '' }))}
                        required
                      >
                        <SelectTrigger id="engineerId">
                        <SelectValue placeholder="Select engineer" className="truncate" />
                      </SelectTrigger>
                      <SelectContent>
                        {engineerList.map(e => (
                          <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="visitDate">Visit Date</Label>
                  <Input 
                    id="visitDate" 
                    name="visitDate" 
                    type="date" 
                    value={newRequest.visitDate}
                    onChange={(e) => setNewRequest(prev => ({ ...prev, visitDate: e.target.value }))}
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Input 
                    id="description" 
                    name="description" 
                    placeholder="Problem details or visit notes" 
                    value={newRequest.description}
                    onChange={(e) => setNewRequest(prev => ({ ...prev, description: e.target.value }))}
                  />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>Cancel</Button>
                  <Button type="submit" className="bg-orange-600 hover:bg-orange-700 text-white">Create Request</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-stone-200 shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
              <Wrench size={20} />
            </div>
            <div>
              <p className="text-xs font-medium text-stone-500 uppercase">Total Requests</p>
              <p className="text-lg font-bold text-stone-900">{requests.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-stone-200 shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-2 rounded-lg bg-red-50 text-red-600">
              <AlertCircle size={20} />
            </div>
            <div>
              <p className="text-xs font-medium text-stone-500 uppercase">Open Complaints</p>
              <p className="text-lg font-bold text-stone-900">{requests.filter(r => sameStatus(r.status, 'OPEN')).length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-stone-200 shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-2 rounded-lg bg-yellow-50 text-yellow-600">
              <Clock size={20} />
            </div>
            <div>
              <p className="text-xs font-medium text-stone-500 uppercase">In Progress</p>
              <p className="text-lg font-bold text-stone-900">{requests.filter(r => sameStatus(r.status, 'IN_PROGRESS')).length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-stone-200 shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-2 rounded-lg bg-green-50 text-green-600">
              <CheckCircle2 size={20} />
            </div>
            <div>
              <p className="text-xs font-medium text-stone-500 uppercase">Resolved</p>
              <p className="text-lg font-bold text-stone-900">{requests.filter(r => sameStatus(r.status, 'RESOLVED')).length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-stone-200 shadow-sm">
        <CardHeader className="p-4 border-b border-stone-100">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
              <Input 
                placeholder="Search by client or service ID..." 
                className="pl-10 h-10 border-stone-200 focus-visible:ring-orange-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            <div className="flex items-center gap-2">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[150px] h-10 border-stone-200">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="AMC">AMC</SelectItem>
                  <SelectItem value="Complaint">Complaint</SelectItem>
                  <SelectItem value="Warranty">Warranty</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-stone-50">
                <TableHead>Service ID</TableHead>
                <TableHead>Client Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Assigned Engineer</TableHead>
                <TableHead>Visit Date</TableHead>
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
                      <p className="text-lg font-medium">Loading service requests...</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredRequests.length > 0 ? (
                filteredRequests.map((req) => {
                  const clientName = req.customerName && req.customerName !== 'Walk-in Customer'
                    ? req.customerName
                    : (req.lead?.name || leads.find(l => l.id === req.leadId)?.name || req.customerName || 'Walk-in Customer');
                  const clientCity = req.customerCity || req.lead?.city || leads.find(l => l.id === req.leadId)?.city || 'N/A';
                  const engineerName = req.engineer?.name || employees.find(e => e.id === (req.engineerId || req.assignedTo))?.name || (typeof req.engineer === 'string' ? req.engineer : 'Unassigned');
                  
                  return (
                    <TableRow key={req.id}>
                      <TableCell className="font-medium">{req.id ? req.id.substring(0, 8) : '—'}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-semibold">{clientName}</span>
                          <span className="text-xs text-stone-500">{clientCity}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-normal">{req.type}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center text-[10px] font-bold text-orange-700">
                            {engineerName.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm font-medium text-stone-700">
                            {engineerName}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-stone-600">
                        {req.scheduledDate || req.visitDate ? new Date(req.scheduledDate || req.visitDate).toLocaleDateString() : req.createdAt ? new Date(req.createdAt).toLocaleDateString() : 'Pending'}
                      </TableCell>
                      <TableCell>
                        <Badge className={cn(
                          "font-medium",
                          // sameStatus() also matches the stored 'IN_PROGRESS',
                          // which the old literal 'in progress' never did.
                          sameStatus(req.status, 'OPEN') && "bg-blue-100 text-blue-700 hover:bg-blue-100",
                          sameStatus(req.status, 'IN_PROGRESS') && "bg-yellow-100 text-yellow-700 hover:bg-yellow-100",
                          sameStatus(req.status, 'RESOLVED') && "bg-green-100 text-green-700 hover:bg-green-100",
                          (sameStatus(req.status, 'CLOSED') || sameStatus(req.status, 'CANCELLED')) && "bg-stone-100 text-stone-600 hover:bg-stone-100",
                        )}>
                          {statusLabel(req.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu open={dropdownOpenId === req.id} onOpenChange={(open) => setDropdownOpenId(open ? req.id : null)}>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical size={16} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem onClick={async () => {
                              setDropdownOpenId(null);
                              // Show the authoritative record: the row may be
                              // stale after another user's update.
                              const fresh = await fetchRequestById(req.id);
                              setViewRequest({ ...req, ...(fresh || {}) });
                            }}>
                              View Details
                            </DropdownMenuItem>
                            {hasPermission('service_requests', 'update') && canActOnRequest(req) && (
                              <DropdownMenuItem onClick={async () => {
                              setDropdownOpenId(null);
                              try {
                                // Walk SERVICE_REQUEST_STATUSES from the current
                                // value, comparing with sameStatus(). The old code
                                // compared a separator-stripped value ('inprogress')
                                // against a spaced literal ('in progress'), so the
                                // match never fired: every non-OPEN request fell
                                // through as "already closed" and the update
                                // silently did nothing. It also wrote lowercase
                                // values that the enum rejects with a 400.
                                const idx = SERVICE_REQUEST_STATUSES.findIndex((s) => sameStatus(req.status, s));
                                const nextStatus = SERVICE_REQUEST_STATUSES[idx + 1];
                                if (!nextStatus) { toast.info('Ye request terminal status par hai'); return; }
                                await serviceRequestsApi.update(req.id, { status: nextStatus });
                                toast.success(`Status updated to ${statusLabel(nextStatus)}`);
                                // Single-fetch reconcile for this one record.
                                const fresh = await fetchRequestById(req.id);
                                if (fresh) setRequests((prev) => prev.map((x) => (x.id === fresh.id ? { ...x, ...fresh } : x)));
                                else fetchRequests();
                              } catch (error: any) {
                                if (error?.response?.status === 400) {
                                  toast.error(apiMessage(error, 'Ye status allowed nahi hai'));
                                } else if (error?.response?.status === 403) {
                                  toast.error('Permission nahi — admin se service_requests permission dilwao.');
                                } else {
                                  toast.error('Failed to update status');
                                }
                              }
                            }}>
                              Update Status
                            </DropdownMenuItem>
                            )}
                            {hasPermission('service_requests', 'delete') && (
                              <DropdownMenuItem
                                className="text-red-600 cursor-pointer"
                                onClick={() => {
                                  setDropdownOpenId(null);
                                  setDeleteId(req.id);
                                }}
                              >
                                <Trash2 size={14} className="mr-2" /> Delete Request
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="h-64 text-center text-stone-400">
                    No service requests found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* View Details Dialog */}
      <Dialog open={viewRequest !== null} onOpenChange={(open) => { if (!open) setViewRequest(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Service Request Details</DialogTitle>
            <DialogDescription>
              {viewRequest?.id ? `Service ID: ${String(viewRequest.id).substring(0, 8)}` : 'Service request information'}
            </DialogDescription>
          </DialogHeader>
          {viewRequest && (() => {
            // Full lead pehle (region/phone/city ke liye), nested fallback.
            const fullLead = leads.find(l => l.id === viewRequest.leadId) || viewRequest.lead;
            const clientName = viewRequest.customerName && viewRequest.customerName !== 'Walk-in Customer'
              ? viewRequest.customerName
              : (fullLead?.name || viewRequest.lead?.name || viewRequest.customerName || 'Walk-in Customer');
            const clientPhone = viewRequest.customerPhone || fullLead?.phone || viewRequest.lead?.phone || '—';
            const clientCity = viewRequest.customerCity || fullLead?.city || viewRequest.lead?.city || '—';
            const engineerName = viewRequest.engineer?.name || employees.find(e => e.id === (viewRequest.engineerId || viewRequest.assignedTo))?.name || (typeof viewRequest.engineer === 'string' ? viewRequest.engineer : 'Unassigned');
            const visitDate = viewRequest.scheduledDate || viewRequest.visitDate;
            const rows: [string, string][] = [
              ['Client Name', clientName],
              ['Phone', clientPhone],
              ['City', clientCity],
              ['Type', viewRequest.type || '—'],
              ['Assigned Engineer', engineerName],
              ['Visit Date', visitDate ? new Date(visitDate).toLocaleDateString('en-IN') : 'Pending'],
              ['Status', viewRequest.status || '—'],
              ['Subject', viewRequest.subject || '—'],
              ['Created On', viewRequest.createdAt ? new Date(viewRequest.createdAt).toLocaleDateString('en-IN') : '—'],
            ];
            return (
              <div className="space-y-4 py-2">
                <div className="rounded-lg border border-stone-200 divide-y divide-stone-100">
                  {rows.map(([label, value]) => (
                    <div key={label} className="flex items-start justify-between gap-4 px-4 py-2.5 text-sm">
                      <span className="text-stone-500">{label}</span>
                      <span className="font-medium text-stone-800 text-right">{value}</span>
                    </div>
                  ))}
                </div>
                {viewRequest.description && (
                  <div className="space-y-1.5">
                    <Label>Description</Label>
                    <p className="text-sm text-stone-700 rounded-lg bg-stone-50 border border-stone-200 px-4 py-3 whitespace-pre-wrap">{viewRequest.description}</p>
                  </div>
                )}
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewRequest(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Service Request</DialogTitle>
            <DialogDescription>Are you sure? This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteLoading}
              onClick={async () => {
                if (!deleteId) return;
                setDeleteLoading(true);
                try {
                  await serviceRequestsApi.delete(deleteId);
                  toast.success('Service request deleted');
                  setDeleteId(null);
                  fetchRequests();
                } catch (error: any) {
                  const status = error?.response?.status;
                  if (status === 403) toast.error('Permission nahi — admin se service_requests permission dilwao.');
                  else toast.error(apiMessage(error, 'Failed to delete request'));
                } finally {
                  setDeleteLoading(false);
                }
              }}
            >
              {deleteLoading && <Loader2 size={16} className="mr-2 animate-spin" />}Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ServiceManagement;
