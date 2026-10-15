import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Loader2, CalendarDays, Bell, CheckCircle2, Clock, AlertTriangle, Pencil, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { tasksApi, calendarApi, employeesApi, leadsApi } from '../services/api';
import { useRegion } from '../contexts/RegionContext';
import { toast } from 'sonner';
import { cn, toLocalDateKey, toDateInputValue, toDateTimeInputValue, toApiIso } from '@/lib/utils';

const TYPES = ['FOLLOW_UP', 'SURVEY', 'INSTALLATION', 'AMC', 'GENERAL'] as const;
const PRIORITIES = ['high', 'medium', 'low'] as const;

const typeBadge: Record<string, string> = {
  FOLLOW_UP: 'bg-blue-100 text-blue-700', SURVEY: 'bg-purple-100 text-purple-700',
  INSTALLATION: 'bg-green-100 text-green-700', AMC: 'bg-orange-100 text-orange-700', GENERAL: 'bg-stone-100 text-stone-600',
};

const Tasks: React.FC = () => {
  // Ye page AdminRoute-guarded hai (sirf ADMIN) — manual task yahan allowed.
  const ALLOW_MANUAL_TASK = true;
  const [tasks, setTasks] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [reminders, setReminders] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [month, setMonth] = useState(new Date());
  const [employees, setEmployees] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const { selectedRegion, selectedRegionName, matchRegion } = useRegion();
  const [form, setForm] = useState<any>({ title: '', description: '', type: 'GENERAL', priority: 'medium', status: 'open', assigneeId: '', dueDate: '', remindAt: '' });

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const params: any = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (typeFilter !== 'all') params.type = typeFilter;
      const [res, remRes, calRes, empRes, leadsRes] = await Promise.all([
        tasksApi.getAll(params),
        tasksApi.getTodaysReminders().catch(() => ({ data: { data: { reminders: [] } } })),
        calendarApi.getEvents().catch(() => ({ data: { data: { events: [] } } })),
        employeesApi.getAll().catch(() => ({ data: { data: [] } })),
        leadsApi.getAll({ limit: 200 }).catch(() => ({ data: { data: { leads: [] } } })),
      ]);
      const data = res.data.data;
      // GET /tasks may answer with a bare array instead of {tasks, stats}.
      setTasks(Array.isArray(data) ? data : (Array.isArray(data?.tasks) ? data.tasks : []));
      setStats(Array.isArray(data) ? {} : (data?.stats || {}));
      setReminders(Array.isArray(remRes.data.data?.reminders) ? remRes.data.data.reminders : []);
      setEvents(Array.isArray(calRes.data.data?.events) ? calRes.data.data.events : []);
      setEmployees(Array.isArray(empRes.data.data?.employees) ? empRes.data.data.employees : (Array.isArray(empRes.data.data) ? empRes.data.data : []));
      const rawLeads = (leadsRes as any)?.data?.data?.leads || (leadsRes as any)?.data?.data || [];
      setLeads(Array.isArray(rawLeads) ? rawLeads : []);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to fetch tasks');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, typeFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const saveTask = async () => {
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    if (saving) return;
    setSaving(true);
    try {
      // Build a clean payload: drop empty strings (server 400s on '' for
      // UUID/date fields) and send dates in API (ISO) format.
      const payload: any = {
        title: form.title.trim(),
        type: form.type,
        priority: form.priority,
        status: form.status,
      };
      if (form.description?.trim()) payload.description = form.description.trim();
      if (form.assigneeId) payload.assigneeId = form.assigneeId;
      const dueIso = toApiIso(form.dueDate);
      if (dueIso) payload.dueDate = dueIso;
      const remindIso = toApiIso(form.remindAt);
      if (remindIso) payload.remindAt = remindIso;
      if (form.id) {
        // On edit, send explicit nulls for cleared fields. Omitting them left
        // the server value in place, so a due date could never be removed.
        payload.description = form.description?.trim() || null;
        payload.dueDate = dueIso || null;
        payload.remindAt = remindIso || null;
        await tasksApi.update(form.id, payload);
        toast.success('Task updated');
      } else {
        await tasksApi.create(payload);
        toast.success('Task created');
      }
      setIsOpen(false);
      setForm({ title: '', description: '', type: 'GENERAL', priority: 'medium', status: 'open', assigneeId: '', dueDate: '', remindAt: '' });
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to save task');
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (task: any, status: string) => {
    try {
      await tasksApi.update(task.id, { status });
      // Refetch: patching the row in place left the stat cards, reminder counts
      // and the active status filter stale (a finished task stayed listed under
      // "open", struck through).
      await fetchData();
      toast.success('Task status updated');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Update failed');
    }
  };

  const deleteTask = async (task: any) => {
    try {
      await tasksApi.delete(task.id);
      await fetchData();
      toast.success('Task deleted');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Delete failed');
    }
  };

  // Kisne kisko assign kiya + region — taaki doosra user khole to dikhe
  // "ye din ye task kisko assigned hai". Assignee object bhi ho sakta hai
  // (tab .name lo, warna [object Object] render hoga).
  const assigneeOf = (t: any): any => {
    // List wala full record PEHLE (usme regions hain); nested me nahi hote.
    const aid = t.assigneeId || ((t as any).assignee && typeof (t as any).assignee === 'object' ? (t as any).assignee.id : (typeof (t as any).assignee === 'string' ? (t as any).assignee : ''));
    return employees.find((e: any) => e.id === aid) || (t as any).assignee || null;
  };
  const creatorOf = (t: any): any => {
    const c = (t as any).createdBy;
    const cid = t.createdById || (c && typeof c === 'object' ? c.id : '');
    return employees.find((e: any) => e.id === cid) || c || null;
  };
  const assigneeNameOf = (t: any): string => {
    const a = assigneeOf(t);
    return typeof a === 'string' ? a : (a?.name || 'Unassigned');
  };
  const creatorNameOf = (t: any): string => {
    const c = creatorOf(t);
    return typeof c === 'string' ? c : (c?.name || '');
  };
  // Region: pehle linked lead se, phir assignee ke regions se, warna null.
  const taskRegionOf = (t: any): { id: string; name: string } | null => {
    const lead = leads.find((l: any) => l.id === (t.leadId || (t.lead as any)?.id));
    const lr = (lead as any)?.region || (lead as any)?.regionId || (t.lead as any)?.region || (t.lead as any)?.regionId;
    if (lr) {
      if (typeof lr === 'string') return { id: lr, name: lr };
      const rid = String(lr.id || lr.name || '');
      if (rid) return { id: rid, name: String(lr.name || lr.id || '') };
    }
    const a = assigneeOf(t);
    const ars = (a as any)?.regions;
    const ar = Array.isArray(ars) ? ars[0] : ars;
    if (ar) {
      if (typeof ar === 'string') return { id: ar, name: ar };
      const rid = String(ar.id || ar.name || '');
      if (rid) return { id: rid, name: String(ar.name || ar.id || '') };
    }
    return null;
  };
  const visibleTasks = selectedRegion === 'all'
    ? tasks
    : tasks.filter((t) => {
        const r = taskRegionOf(t);
        if (!r || !r.id) return true;
        return matchRegion({ id: r.id, name: r.name }, true);
      });

  // `dueDate` is the field this page writes for tasks, so the calendar must
  // read it too or every task date lands on an empty grid.
  const monthEvents = events.filter(e => String(e.date || e.start || e.dueDate || '').startsWith(`${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`));
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1).getDay();

  const eventColor: Record<string, string> = {
    TASK: 'bg-orange-100 text-orange-700', SURVEY: 'bg-purple-100 text-purple-700', INSTALLATION: 'bg-green-100 text-green-700',
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><CalendarDays className="text-orange-600" /> Tasks, Reminders &amp; Calendar</h1>
          <p className="text-sm text-stone-500">Follow-ups, surveys, installations &amp; AMC visits on one board.</p>
        </div>
        <div className="md:ml-auto flex items-center gap-2">
          {selectedRegion !== 'all' && (
            <span className="text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded-full px-2.5 py-1" title="Sirf us region ke tasks">
              {selectedRegionName} only
            </span>
          )}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="done">Done</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {TYPES.map(t => <SelectItem key={t} value={t}>{t.replace('_', ' ')}</SelectItem>)}
            </SelectContent>
          </Select>
          {ALLOW_MANUAL_TASK && (
          <Button onClick={() => { setForm({ title: '', description: '', type: 'GENERAL', priority: 'medium', status: 'open', assigneeId: '', dueDate: '', remindAt: '' }); setIsOpen(true); }}>
            <Plus size={16} className="mr-1" /> New Task
          </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card><CardContent className="flex items-center gap-3 p-4">
          <div className="h-10 w-10 rounded-lg bg-orange-50 flex items-center justify-center"><Bell size={18} className="text-orange-600" /></div>
          <div><p className="text-2xl font-bold">{reminders.length}</p><p className="text-xs text-stone-500">Due today / overdue</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4">
          <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center"><Clock size={18} className="text-blue-600" /></div>
          <div><p className="text-2xl font-bold">{stats.open ?? 0} / {stats.in_progress ?? 0}</p><p className="text-xs text-stone-500">Open / In progress</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4">
          <div className="h-10 w-10 rounded-lg bg-green-50 flex items-center justify-center"><CheckCircle2 size={18} className="text-green-600" /></div>
          <div><p className="text-2xl font-bold">{stats.done ?? 0}</p><p className="text-xs text-stone-500">Completed tasks</p></div>
        </CardContent></Card>
      </div>

      {reminders.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
          <p className="text-sm font-semibold text-amber-800 flex items-center gap-2"><AlertTriangle size={16} /> Reminders due now / today</p>
          {reminders.map(r => (
            <div key={r.id} className="flex items-center justify-between text-sm">
              <span className={cn("font-medium", r.overdue && "text-red-600")}>{r.title} {r.overdue && <Badge variant="destructive" className="ml-1 text-[10px]">Overdue</Badge>}</span>
              <span className="text-xs text-stone-500">{r.assignee?.name || r.assignee || 'Unassigned'} • {(r.dueDate || '').slice(0, 10)}</span>
            </div>
          ))}
        </div>
      )}

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">Task List</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="py-16 flex justify-center"><Loader2 size={32} className="animate-spin opacity-30" /></div>
              ) : (
                <div className="divide-y">
                  {visibleTasks.map(t => {
                    const assignee = assigneeNameOf(t);
                    const creator = creatorNameOf(t);
                    const region = taskRegionOf(t);
                    return (
                    <div key={t.id} className="flex items-center gap-3 p-4 hover:bg-stone-50">
                      <Badge variant="outline" className={cn("w-24 justify-center", typeBadge[t.type] || '')}>{t.type.replace('_', ' ')}</Badge>
                      <div className="flex-1 min-w-0">
                        <p className={cn("font-medium text-sm", t.status === 'done' && "line-through text-stone-400")}>{t.title}</p>
                        <p className="text-xs text-stone-400 truncate">
                          {t.description}
                          {assignee !== 'Unassigned' && ` • To: ${assignee}`}
                          {creator && ` • By: ${creator}`}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1">
                          {region ? (
                            <Badge variant="outline" className="font-normal text-[11px]">{region.name}</Badge>
                          ) : (
                            <Badge variant="outline" className="font-normal text-[11px] text-stone-400" title="Kisi region se link nahi">General</Badge>
                          )}
                        </div>
                      </div>
                      <Badge variant={t.priority === 'high' ? 'destructive' : t.priority === 'medium' ? 'default' : 'secondary'} className="hidden sm:inline-flex">{t.priority}</Badge>
                      <span className="text-xs text-stone-400 hidden md:block">{t.dueDate || '—'}</span>
                      {t.status !== 'done' ? (
                        <Button variant="ghost" size="sm" onClick={() => updateStatus(t, 'done')}><CheckCircle2 size={15} className="text-green-600" /></Button>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => updateStatus(t, 'open')}><Clock size={15} className="text-stone-400" /></Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => { setForm({ ...t, description: t.description || '', assigneeId: t.assigneeId || '', dueDate: toDateInputValue(t.dueDate), remindAt: toDateTimeInputValue(t.remindAt) }); setIsOpen(true); }}><Pencil size={15} /></Button>
                      <Button variant="ghost" size="sm" title="Delete task" onClick={() => { if (confirm(`Delete task "${t.title}"? This cannot be undone.`)) deleteTask(t); }}><Trash2 size={15} className="text-red-500" /></Button>
                    </div>
                    );
                  })}
                  {visibleTasks.length === 0 && <p className="text-center text-stone-400 py-10 text-sm">No tasks found{selectedRegion !== 'all' ? ` for ${selectedRegionName}` : ''}</p>}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calendar">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-sm">{month.toLocaleString('en-IN', { month: 'long', year: 'numeric' })}</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>Prev</Button>
                <Button variant="outline" size="sm" onClick={() => setMonth(new Date())}>Today</Button>
                <Button variant="outline" size="sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>Next</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-stone-400 pb-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d}>{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const dateStr = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const dayEvents = monthEvents.filter(e => (e.date || e.start || e.dueDate || '').slice(0, 10) === dateStr);
                  const isToday = dateStr === toLocalDateKey();
                  return (
                    <div key={day} className={cn("min-h-[72px] rounded-lg border p-1 text-xs", isToday ? "border-orange-300 bg-orange-50" : "border-stone-100")}>
                      <p className={cn("font-medium", isToday && "text-orange-600")}>{day}</p>
                      <div className="space-y-0.5 mt-0.5">
                        {dayEvents.map(e => (
                          <p key={e.id} className={cn("rounded px-1 py-0.5 text-[10px] truncate", eventColor[String(e.kind || e.source || '').toUpperCase()] || 'bg-stone-100 text-stone-600')}>{e.title || e.name}</p>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? 'Edit Task' : 'New Task'}</DialogTitle>
            <DialogDescription>Schedule follow-ups, surveys, installations &amp; AMC visits.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input value={form.title || ''} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Follow-up call with..." />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TYPES.map(t => <SelectItem key={t} value={t}>{t.replace('_', ' ')}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={v => setForm({ ...form, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Assignee</Label>
                <Select value={form.assigneeId} onValueChange={v => setForm({ ...form, assigneeId: v })}>
                  <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    {employees.map((emp: any) => <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="done">Done</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Due Date</Label>
                <Input type="date" value={toDateInputValue(form.dueDate) || ''} onChange={e => setForm({ ...form, dueDate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Remind At (datetime)</Label>
                <Input type="datetime-local" value={toDateTimeInputValue(form.remindAt) || ''} onChange={e => setForm({ ...form, remindAt: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
            <Button onClick={saveTask} disabled={saving}>{saving ? <Loader2 size={15} className="animate-spin" /> : 'Save Task'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Tasks;