import React, { useState, useEffect } from 'react';
import {
  MessageSquare, Search, Star, Trash2, Loader2, Eye, Plus, Send,
  Mail, Phone, CheckCircle2, AlertCircle, Clock
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { feedbackApi } from '../services/api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { useSearchParams } from 'react-router-dom';

interface Feedback {
  id: string;
  fullName: string;
  phoneCode: string;
  phone: string;
  state: string;
  city: string;
  overallRating: number;
  serviceType: string[];
  professionalismRating: number;
  nps: number;
  comments?: string;
  status: string;
  createdAt: string;
}

const SERVICE_TYPES = ['Installation', 'Maintenance', 'AMC Service', 'Site Survey', 'Consultation', 'Other'];
const STATES = ['Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal'];

const FeedbackManagement: React.FC = () => {
  const { hasPermission } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusTab, setStatusTab] = useState('all');
  const [counts, setCounts] = useState({ new: 0, read: 0, pending: 0, all: 0 });
  const [selected, setSelected] = useState<Feedback | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setIsFormOpen(true);
      searchParams.delete('new');
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [submitting, setSubmitting] = useState(false);
  const [statusLoading, setStatusLoading] = useState<string | null>(null);

  const [form, setForm] = useState({
    fullName: '', phoneCode: '+91', phone: '', state: '', city: '',
    overallRating: 5, serviceType: [] as string[], professionalismRating: 5, nps: 9, comments: ''
  });

  const fetchFeedbacks = async (status?: string) => {
    setIsLoading(true);
    try {
      const params: any = {};
      if (status && status !== 'all') params.status = status;
      const res = await feedbackApi.getAll(params);
      const data = res.data.data?.feedbacks || res.data.data;
      setFeedbacks(Array.isArray(data) ? data : []);
    } catch { setFeedbacks([]); }
    finally { setIsLoading(false); }
  };

  const fetchCounts = async () => {
    try {
      const res = await feedbackApi.getCount();
      const c = res.data.data || res.data;
      setCounts({ new: c.new || 0, read: c.read || 0, pending: c.pending || 0, all: c.all || 0 });
    } catch {}
  };

  useEffect(() => {
    if (!hasPermission('feedback', 'read')) {
      toast.error('Access denied');
      return;
    }
    fetchCounts();
    fetchFeedbacks(statusTab);
  }, [statusTab]);

  const handleView = (f: Feedback) => { setSelected(f); setIsDetailOpen(true); };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await feedbackApi.delete(deleteId);
      // Functional updates: two rapid status changes resolved out of order
      // would otherwise revert one another.
      setFeedbacks(prev => prev.filter(f => f.id !== deleteId));
      fetchCounts();
      setIsDeleteOpen(false); setDeleteId(null);
      toast.success('Feedback deleted');
    } catch { toast.error('Failed to delete'); }
  };

  const handleStatusUpdate = async (id: string, status: string) => {
    setStatusLoading(id);
    try {
      await feedbackApi.updateStatus(id, { status });
      setFeedbacks(prev => prev.map(f => f.id === id ? { ...f, status } : f));
      fetchCounts();
      toast.success(`Marked as ${status}`);
    } catch { toast.error('Failed to update status'); }
    finally { setStatusLoading(null); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName || !form.phone || !form.state || !form.city || !form.serviceType.length) {
      toast.error('Please fill all required fields'); return;
    }
    setSubmitting(true);
    try {
      await feedbackApi.create(form);
      toast.success('Feedback submitted successfully!');
      setIsFormOpen(false);
      setForm({ fullName: '', phoneCode: '+91', phone: '', state: '', city: '', overallRating: 5, serviceType: [], professionalismRating: 5, nps: 9, comments: '' });
      fetchFeedbacks(statusTab);
      fetchCounts();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to submit feedback');
    } finally { setSubmitting(false); }
  };

  const toggleServiceType = (t: string) => {
    setForm(f => ({ ...f, serviceType: f.serviceType.includes(t) ? f.serviceType.filter(x => x !== t) : [...f.serviceType, t] }));
  };

  const renderStars = (n: number) => Array.from({ length: 5 }, (_, i) => (
    <span key={i} className={cn("text-lg", i < n ? "text-yellow-400" : "text-stone-200")}>★</span>
  ));

  const statusBadge = (s: string) => {
    const map: Record<string, string> = { new: 'bg-blue-50 text-blue-700 border-blue-200', read: 'bg-green-50 text-green-700 border-green-200', pending: 'bg-yellow-50 text-yellow-700 border-yellow-200' };
    return <Badge className={cn("border px-2.5 py-0.5 rounded-full text-xs font-medium", map[s] || 'bg-stone-50 text-stone-600')}>{s}</Badge>;
  };

  const filtered = feedbacks.filter(f =>
    f.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.phone?.includes(searchTerm) ||
    f.city?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Records missing a rating field must not render "NaN" in the stat cards.
  const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const avgOf = (key: string, dp: number) =>
    feedbacks.length ? (feedbacks.reduce((s, f) => s + num(f[key]), 0) / feedbacks.length).toFixed(dp) : '0';
  const avgRating = avgOf('overallRating', 1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card rounded-xl border border-stone-200 p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-xl bg-orange-50 flex items-center justify-center">
            <MessageSquare size={28} className="text-orange-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-stone-900">Customer Feedback</h1>
            <p className="text-stone-500 text-sm mt-0.5">View and manage customer feedback & ratings</p>
          </div>
        </div>
        {hasPermission('feedback', 'create') && (
        <Button onClick={() => setIsFormOpen(true)} className="bg-orange-600 hover:bg-orange-700 text-white shadow-lg shadow-orange-200 h-11 px-6">
          <Plus size={18} className="mr-2" /> New Feedback
        </Button>
        )}
      </div>

      {/* Stats */}
      {feedbacks.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-card rounded-xl border border-stone-200 p-5 shadow-sm">
            <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">Total</p>
            <p className="text-2xl font-bold text-stone-900 mt-1">{feedbacks.length}</p>
          </div>
          <div className="bg-card rounded-xl border border-stone-200 p-5 shadow-sm">
            <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">Avg Rating</p>
            <p className="text-2xl font-bold text-yellow-500 mt-1">{avgRating} / 5</p>
          </div>
          <div className="bg-card rounded-xl border border-stone-200 p-5 shadow-sm">
            <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">Avg NPS</p>
            <p className="text-2xl font-bold text-green-600 mt-1">{avgOf('nps', 0)}</p>
          </div>
          <div className="bg-card rounded-xl border border-stone-200 p-5 shadow-sm">
            <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">Professionalism</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">{avgOf('professionalismRating', 1)}</p>
          </div>
        </div>
      )}

      {/* Tabs + Table */}
      <Card className="border-stone-200 shadow-sm rounded-xl overflow-hidden">
        <CardHeader className="p-5 border-b border-stone-100 bg-card space-y-4">
          <Tabs value={statusTab} onValueChange={setStatusTab}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <TabsList className="bg-stone-100/80 p-1 rounded-lg">
                <TabsTrigger value="all" className="text-xs gap-1.5">All <Badge className="bg-stone-200 text-stone-700 ml-1 text-[10px] px-1.5 py-0">{counts.all}</Badge></TabsTrigger>
                <TabsTrigger value="new" className="text-xs gap-1.5"><AlertCircle size={12} /> New <Badge className="bg-blue-100 text-blue-700 ml-1 text-[10px] px-1.5 py-0">{counts.new}</Badge></TabsTrigger>
                <TabsTrigger value="read" className="text-xs gap-1.5"><CheckCircle2 size={12} /> Read <Badge className="bg-green-100 text-green-700 ml-1 text-[10px] px-1.5 py-0">{counts.read}</Badge></TabsTrigger>
                <TabsTrigger value="pending" className="text-xs gap-1.5"><Clock size={12} /> Pending <Badge className="bg-yellow-100 text-yellow-700 ml-1 text-[10px] px-1.5 py-0">{counts.pending}</Badge></TabsTrigger>
              </TabsList>
              <div className="relative max-w-md w-full sm:w-auto">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
                <Input placeholder="Search by name, phone or city..." className="pl-10 h-10 border-stone-200 bg-stone-50 w-full" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
              </div>
            </div>
          </Tabs>
        </CardHeader>
        <CardContent className="p-0">
          {feedbacks.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="bg-stone-50 border-b border-stone-100">
                  <TableHead className="text-xs font-semibold text-stone-500 uppercase tracking-wider py-4">Customer</TableHead>
                  <TableHead className="text-xs font-semibold text-stone-500 uppercase tracking-wider py-4">Location</TableHead>
                  <TableHead className="text-xs font-semibold text-stone-500 uppercase tracking-wider py-4">Rating</TableHead>
                  <TableHead className="text-xs font-semibold text-stone-500 uppercase tracking-wider py-4">Status</TableHead>
                  <TableHead className="text-xs font-semibold text-stone-500 uppercase tracking-wider py-4">NPS</TableHead>
                  <TableHead className="text-xs font-semibold text-stone-500 uppercase tracking-wider py-4">Date</TableHead>
                  <TableHead className="text-right text-xs font-semibold text-stone-500 uppercase tracking-wider py-4">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length > 0 ? (
                  filtered.map(f => (
                    <TableRow key={f.id} className="border-b border-stone-50 hover:bg-stone-50/50 transition-colors cursor-pointer" onClick={() => handleView(f)}>
                      <TableCell>
                        <div><p className="font-semibold text-stone-800">{f.fullName}</p><p className="text-xs text-stone-400 mt-0.5">{f.phoneCode} {f.phone}</p></div>
                      </TableCell>
                      <TableCell className="text-sm text-stone-600">{f.city}, {f.state}</TableCell>
                      <TableCell>{renderStars(f.overallRating)}</TableCell>
                      <TableCell>{statusBadge(f.status)}</TableCell>
                      <TableCell><span className={cn("font-semibold text-sm px-2 py-0.5 rounded-full", f.nps >= 9 ? "bg-green-50 text-green-700" : f.nps >= 7 ? "bg-yellow-50 text-yellow-700" : "bg-red-50 text-red-700")}>{f.nps}</span></TableCell>
                      <TableCell className="text-sm text-stone-500">{new Date(f.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</TableCell>
                      <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                          {hasPermission('feedback', 'update') && <>
                            {f.status !== 'read' && (
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-green-600 hover:bg-green-50" onClick={() => handleStatusUpdate(f.id, 'read')} disabled={statusLoading === f.id}>
                                {statusLoading === f.id ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}<span className="ml-1">Read</span>
                              </Button>
                            )}
                            {f.status !== 'pending' && (
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-yellow-600 hover:bg-yellow-50" onClick={() => handleStatusUpdate(f.id, 'pending')} disabled={statusLoading === f.id}>
                                <Clock size={11} /><span className="ml-1">Pending</span>
                              </Button>
                            )}
                          </>}
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => handleView(f)} title="View"><Eye size={15} /></Button>
                          {hasPermission('feedback', 'delete') && (
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => { setDeleteId(f.id); setIsDeleteOpen(true); }} title="Delete"><Trash2 size={15} /></Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow><TableCell colSpan={7} className="h-40 text-center text-stone-400"><Search size={32} className="mx-auto mb-2 opacity-30" /><p>No matching results</p></TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          ) : (
            <div className="h-64 flex flex-col items-center justify-center text-stone-400">
              {isLoading ? <Loader2 size={48} className="mb-4 animate-spin opacity-20" /> : <><MessageSquare size={48} className="mb-4 opacity-20" /><p className="text-lg font-medium">No feedback found</p><p className="text-sm text-stone-400 mt-1">Click "New Feedback" to submit customer feedback</p></>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Submit Form Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Submit Customer Feedback</DialogTitle><DialogDescription>Record feedback collected from customers</DialogDescription></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label>Full Name <span className="text-red-500">*</span></Label>
                <Input value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} placeholder="Rahul Sharma" required />
              </div>
              <div className="space-y-1.5">
                <Label>Phone Code</Label>
                <Input value={form.phoneCode} onChange={e => setForm(f => ({ ...f, phoneCode: e.target.value }))} placeholder="+91" />
              </div>
              <div className="space-y-1.5">
                <Label>Phone <span className="text-red-500">*</span></Label>
                <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="9876543210" required />
              </div>
              <div className="space-y-1.5">
                <Label>State <span className="text-red-500">*</span></Label>
                <Select value={form.state} onValueChange={v => setForm(f => ({ ...f, state: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                  <SelectContent>{STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>City <span className="text-red-500">*</span></Label>
                <Input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} placeholder="Ahmedabad" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Service Type <span className="text-red-500">*</span></Label>
              <div className="flex flex-wrap gap-2">{SERVICE_TYPES.map(t => (<label key={t} className="flex items-center gap-1.5 text-sm cursor-pointer"><Checkbox checked={form.serviceType.includes(t)} onCheckedChange={() => toggleServiceType(t)} />{t}</label>))}</div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Overall Rating</Label>
                <Select value={String(form.overallRating)} onValueChange={v => setForm(f => ({ ...f, overallRating: Number(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{[1,2,3,4,5].map(n => <SelectItem key={n} value={String(n)}>{'★'.repeat(n)}{'☆'.repeat(5-n)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Professionalism</Label>
                <Select value={String(form.professionalismRating)} onValueChange={v => setForm(f => ({ ...f, professionalismRating: Number(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{[1,2,3,4,5].map(n => <SelectItem key={n} value={String(n)}>{'★'.repeat(n)}{'☆'.repeat(5-n)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>NPS Score</Label>
                <Select value={String(form.nps)} onValueChange={v => setForm(f => ({ ...f, nps: Number(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{[0,1,2,3,4,5,6,7,8,9,10].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Comments</Label>
              <Textarea value={form.comments} onChange={e => setForm(f => ({ ...f, comments: e.target.value }))} placeholder="Great service! Highly recommended." rows={3} />
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>Cancel</Button><Button type="submit" className="bg-orange-600 hover:bg-orange-700 text-white" disabled={submitting}>{submitting ? 'Submitting...' : 'Submit Feedback'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2 text-xl"><MessageSquare size={20} className="text-orange-600" /> Feedback Details</DialogTitle></DialogHeader>
              <div className="space-y-5 py-2">
                <div className="flex items-center justify-between"><span className="text-xs text-stone-500 uppercase tracking-wider font-semibold">Status</span>{statusBadge(selected.status)}</div>
                <div className="grid grid-cols-2 gap-4 p-4 bg-stone-50 rounded-lg border">
                  <div><p className="text-xs text-stone-500 uppercase tracking-wider font-semibold">Customer</p><p className="font-semibold text-stone-800 mt-1">{selected.fullName}</p></div>
                  <div><p className="text-xs text-stone-500 uppercase tracking-wider font-semibold">Contact</p><p className="text-stone-700 mt-1">{selected.phoneCode} {selected.phone}</p></div>
                  <div><p className="text-xs text-stone-500 uppercase tracking-wider font-semibold">City</p><p className="text-stone-700 mt-1">{selected.city}</p></div>
                  <div><p className="text-xs text-stone-500 uppercase tracking-wider font-semibold">State</p><p className="text-stone-700 mt-1">{selected.state}</p></div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-100 text-center">
                    <p className="text-xs text-yellow-700 font-semibold uppercase tracking-wider mb-1">Overall</p>
                    <div className="flex justify-center">{renderStars(selected.overallRating)}</div>
                    <p className="text-lg font-bold text-yellow-700 mt-1">{selected.overallRating}/5</p>
                  </div>
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 text-center">
                    <p className="text-xs text-blue-700 font-semibold uppercase tracking-wider mb-1">Professionalism</p>
                    <div className="flex justify-center">{renderStars(selected.professionalismRating)}</div>
                    <p className="text-lg font-bold text-blue-700 mt-1">{selected.professionalismRating}/5</p>
                  </div>
                  <div className="p-4 bg-green-50 rounded-lg border border-green-100 text-center">
                    <p className="text-xs text-green-700 font-semibold uppercase tracking-wider mb-1">NPS Score</p>
                    <p className={cn("text-3xl font-bold mt-2", selected.nps >= 9 ? "text-green-600" : selected.nps >= 7 ? "text-yellow-600" : "text-red-600")}>{selected.nps}</p>
                    <p className="text-xs text-stone-500 mt-1">/ 10</p>
                  </div>
                </div>
                <div className="p-4 bg-stone-50 rounded-lg border">
                  <p className="text-xs text-stone-500 uppercase tracking-wider font-semibold mb-2">Services Used</p>
                  <div className="flex flex-wrap gap-2">{selected.serviceType?.map(s => <Badge key={s} className="bg-orange-50 text-orange-700 border border-orange-200 px-3 py-1">{s}</Badge>)}</div>
                </div>
                {selected.comments && <div className="p-4 bg-stone-50 rounded-lg border"><p className="text-xs text-stone-500 uppercase tracking-wider font-semibold mb-2">Comments</p><p className="text-stone-700 text-sm italic">"{selected.comments}"</p></div>}
                <div className="flex gap-2 justify-end">
                  {/* Same permission gate as the table row, and no optimistic
                      setSelected: it kept showing the new status after a failed PATCH. */}
                  {hasPermission('feedback', 'update') && selected.status !== 'read' && <Button size="sm" variant="outline" className="text-green-600 border-green-200" onClick={() => handleStatusUpdate(selected.id, 'read')}><CheckCircle2 size={14} className="mr-1" /> Mark Read</Button>}
                  {hasPermission('feedback', 'update') && selected.status !== 'pending' && <Button size="sm" variant="outline" className="text-yellow-600 border-yellow-200" onClick={() => handleStatusUpdate(selected.id, 'pending')}><Clock size={14} className="mr-1" /> Mark Pending</Button>}
                </div>
                <p className="text-xs text-stone-400 text-right">Submitted on {new Date(selected.createdAt).toLocaleString('en-IN')}</p>
              </div>
              <DialogFooter><Button variant="outline" onClick={() => setIsDetailOpen(false)}>Close</Button></DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Delete Feedback</DialogTitle><DialogDescription>Are you sure? This cannot be undone.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setIsDeleteOpen(false)}>Cancel</Button><Button variant="destructive" onClick={handleDelete}>Delete</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FeedbackManagement;