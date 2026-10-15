import React, { useCallback, useEffect, useState } from 'react';
import { Search, Loader2, Users, ShieldCheck, BadgeIndianRupee, Wrench, FileCheck2 } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { customersApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useRegion } from '../contexts/RegionContext';
import { cn, resolveImageUrl } from '@/lib/utils';
import { toast } from 'sonner';
import DocumentManager, { docStatusBadge, getApiMessage } from '../components/documents/DocumentManager';
import type { Customer360, SubsidyStatus } from '../types';
import { SUBSIDY_STATUSES as CANONICAL_SUBSIDY_STATUSES, statusLabel } from '@/lib/statuses';

const SUBSIDY_STATUSES: SubsidyStatus[] = [...CANONICAL_SUBSIDY_STATUSES];

function docVerifyBadge(status?: string) {
  const s = String(status || 'PENDING').toUpperCase();
  if (s === 'VERIFIED') return 'bg-green-100 text-green-700 border border-green-200';
  if (s === 'PARTIAL') return 'bg-blue-100 text-blue-700 border border-blue-200';
  return 'bg-stone-100 text-stone-600 border border-stone-200';
}

function subsidyBadge(status?: string) {
  const s = String(status || 'NOT_APPLIED').toUpperCase();
  if (s === 'RECEIVED') return 'bg-green-100 text-green-700 border border-green-200';
  if (s === 'APPROVED') return 'bg-blue-100 text-blue-700 border border-blue-200';
  if (s === 'APPLIED') return 'bg-amber-100 text-amber-700 border border-amber-200';
  return 'bg-stone-100 text-stone-600 border border-stone-200';
}

const Customers: React.FC = () => {
  const { hasPermission } = useAuth();
  const [customers, setCustomers] = useState<Customer360[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [segmentFilter, setSegmentFilter] = useState('all');
  const { selectedRegion: regionFilter, setSelectedRegion: setRegionFilter, matchRegion, regions } = useRegion();
  const [selected, setSelected] = useState<Customer360 | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState<any>({});

  const fetchCustomers = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await customersApi.getAll();
      const raw = res.data?.data?.customers || res.data?.data || [];
      setCustomers(Array.isArray(raw) ? raw : []);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 403) toast.error('Permission nahi — admin se customers permission dilwao.');
      else toast.error(getApiMessage(err, 'Failed to fetch customers'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  // Quotation APPROVED ke baad entry bina manual refresh ke aani chahiye.
  useEffect(() => {
    const onFocus = () => fetchCustomers();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchCustomers]);

  const openDetail = async (c: Customer360) => {
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const res = await customersApi.getById(c.id);
      const full = res.data?.data?.customer || res.data?.data || res.data;
      setSelected(full);
      setEditForm({ name: full.name || '', phone: full.phone || '', email: full.email || '', subsidyStatus: full.subsidyStatus || 'NOT_APPLIED' });
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 403) toast.error('Permission nahi — admin se customers permission dilwao.');
      else toast.error(getApiMessage(err, 'Failed to fetch customer detail'));
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshDetail = async () => {
    if (!selected) return;
    try {
      const res = await customersApi.getById(selected.id);
      const full = res.data?.data?.customer || res.data?.data || res.data;
      setSelected(full);
      fetchCustomers();
    } catch { /* toast already handled on open; silent refresh */ }
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      // subsidyStatus editable; docVerifyStatus is read-only (backend syncs it).
      // Always send these three: skipping empty values means a field can be
      // filled in but never cleared (deleted email silently reappeared).
      const payload: any = {
        name: editForm.name,
        phone: editForm.phone,
        email: editForm.email,
      };
      if (editForm.subsidyStatus) payload.subsidyStatus = editForm.subsidyStatus;
      await customersApi.update(selected.id, payload);
      toast.success('Customer updated');
      refreshDetail();
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 403) toast.error('Permission nahi — admin se customers permission dilwao.');
      else toast.error(getApiMessage(err, 'Failed to update customer'));
    } finally {
      setSaving(false);
    }
  };

  const filtered = customers.filter((c) => {
    const q = searchTerm.toLowerCase();
    const matchesSearch = (c.name || '').toLowerCase().includes(q) || (c.id || '').toLowerCase().includes(q) || (c.phone || '').includes(q);
    const seg = String((c as any).segment || (c as any).lead?.segment || 'N/A');
    const matchesSegment = segmentFilter === 'all' || seg === segmentFilter;
    const matchesRegion = matchRegion(c.region || (c as any).regionId);
    return matchesSearch && matchesSegment && matchesRegion;
  });
  const segmentOptions = Array.from(new Set(customers.map((c) => String((c as any).segment || (c as any).lead?.segment || '').trim()).filter(Boolean)));
  // Must come from the shared region list BY ID. This page used to build the
  // options from region *names* and wrote the name into the context's
  // selectedRegion, which matchRegion resolves as an id — the table went empty
  // and the bad value persisted to localStorage for every other page.
  const regionOptions = regions;

  // Installation is NOT on Customer — single source is lead.installation (join).
  const installation = selected?.lead?.installation || selected?.installation || null;
  const leadDocs = selected?.lead?.documents || [];
  const canEdit = hasPermission('customers', 'update');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Customers</h1>
          <p className="text-stone-500">360° view — quotation APPROVED par auto-created (duplicate mat banao)</p>
        </div>
        <Button variant="outline" onClick={fetchCustomers} className="border-stone-200">Refresh</Button>
      </div>

      <Card className="border-stone-200 shadow-sm">
        <CardHeader className="p-4 border-b border-stone-100">
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
              <Input placeholder="Search by name, ID or phone..." className="pl-10 h-10" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Select value={segmentFilter} onValueChange={setSegmentFilter}>
                <SelectTrigger className="w-[150px] h-10"><SelectValue placeholder="Segment" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Segments</SelectItem>
                  {segmentOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={regionFilter} onValueChange={setRegionFilter}>
                <SelectTrigger className="w-[150px] h-10"><SelectValue placeholder="Region" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Regions</SelectItem>
                  {regionOptions.map((r: any) => <SelectItem key={r.id ?? r} value={r.id ?? r}>{r.name ?? r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-stone-50">
                <TableHead>Customer</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Subsidy</TableHead>
                <TableHead>Docs</TableHead>
                <TableHead>Installation</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="h-64 text-center"><Loader2 size={40} className="mx-auto mb-3 animate-spin opacity-20" /><p className="text-stone-400">Loading customers...</p></TableCell></TableRow>
              ) : filtered.length > 0 ? (
                filtered.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer hover:bg-stone-50/70" onClick={() => openDetail(c)}>
                    <TableCell><span className="font-semibold">{c.name}</span><span className="block text-xs text-stone-400 font-mono">{(c.id || '').slice(0, 8)}</span></TableCell>
                    <TableCell className="text-sm">{c.phone || '—'}</TableCell>
                    <TableCell><Badge className={cn('font-medium', subsidyBadge(c.subsidyStatus))}>{c.subsidyStatus || 'NOT_APPLIED'}</Badge></TableCell>
                    <TableCell><Badge className={cn('font-medium', docVerifyBadge(c.docVerifyStatus))}>{c.docVerifyStatus || 'PENDING'}</Badge></TableCell>
                    <TableCell className="text-sm text-stone-600">{c.lead?.installation?.status || c.installation?.status || '—'}</TableCell>
                    <TableCell className="text-right"><Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); openDetail(c); }}>360 View</Button></TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow><TableCell colSpan={6} className="h-48 text-center text-stone-400"><Users size={36} className="mx-auto mb-2 opacity-20" />No customers found</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">{selected?.name || 'Customer 360'}
              {selected?.docVerifyStatus && <Badge className={cn('font-medium', docVerifyBadge(selected.docVerifyStatus))}>{selected.docVerifyStatus}</Badge>}
            </DialogTitle>
            <DialogDescription>Verify/reject/delete par backend docVerifyStatus khud sync karta hai — refresh se update dikhega.</DialogDescription>
          </DialogHeader>
          {detailLoading || !selected ? (
            <div className="py-12 flex justify-center"><Loader2 size={32} className="animate-spin opacity-30" /></div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
              {/* Block 1 — details (editable) */}
              <div className="p-4 border rounded-lg space-y-3">
                <h3 className="text-sm font-bold flex items-center gap-1.5"><Users size={14} /> Details</h3>
                <div className="space-y-2">
                  <div className="space-y-1"><Label className="text-xs">Name</Label><Input value={editForm.name || ''} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} disabled={!canEdit} className="h-9" /></div>
                  <div className="space-y-1"><Label className="text-xs">Phone</Label><Input value={editForm.phone || ''} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} disabled={!canEdit} className="h-9" /></div>
                  <div className="space-y-1"><Label className="text-xs">Email</Label><Input value={editForm.email || ''} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} disabled={!canEdit} className="h-9" /></div>
                  <div className="flex justify-between text-xs"><span className="text-stone-500">Region</span><span className="font-medium">{selected.region?.name || '—'}</span></div>
                </div>
              </div>
              {/* Block 2 — subsidy + docVerify */}
              <div className="space-y-4">
                <div className="p-4 border rounded-lg space-y-2">
                  <h3 className="text-sm font-bold flex items-center gap-1.5"><BadgeIndianRupee size={14} /> Subsidy Status</h3>
                  <Select value={editForm.subsidyStatus || 'NOT_APPLIED'} onValueChange={(v) => setEditForm({ ...editForm, subsidyStatus: v })} disabled={!canEdit}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>{SUBSIDY_STATUSES.map((s) => <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>)}</SelectContent>
                  </Select>
                  <Badge className={cn('font-medium', subsidyBadge(editForm.subsidyStatus))}>{editForm.subsidyStatus}</Badge>
                </div>
                <div className="p-4 border rounded-lg space-y-2">
                  <h3 className="text-sm font-bold flex items-center gap-1.5"><ShieldCheck size={14} /> Doc Verify (read-only)</h3>
                  <Badge className={cn('font-medium', docVerifyBadge(selected.docVerifyStatus))}>{selected.docVerifyStatus || 'PENDING'}</Badge>
                  <p className="text-[11px] text-stone-400">Backend sync karta hai (PENDING → PARTIAL → VERIFIED). Frontend calculate na kare.</p>
                </div>
              </div>
              {/* Block 3 — installation (join, single source lead.installation) */}
              <div className="p-4 border rounded-lg space-y-2">
                <h3 className="text-sm font-bold flex items-center gap-1.5"><Wrench size={14} /> Installation (lead join)</h3>
                {installation ? (
                  <div className="text-xs space-y-1.5">
                    <div className="flex justify-between"><span className="text-stone-500">Status</span><span className="font-semibold">{installation.status || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-stone-500">Start</span><span>{(installation.startDate || '').slice(0, 10) || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-stone-500">Expected End</span><span>{(installation.expectedEndDate || '').slice(0, 10) || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-stone-500">Completion</span><span>{(installation.completionDate || '').slice(0, 10) || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-stone-500">Progress</span><span>{installation.progress ?? 0}%</span></div>
                  </div>
                ) : <p className="text-xs text-stone-400">No installation linked yet</p>}
              </div>
              {/* Block 4 — documents (embedded from 360; extra API hit nahi) */}
              <div className="p-4 border rounded-lg space-y-2">
                <h3 className="text-sm font-bold flex items-center gap-1.5"><FileCheck2 size={14} /> Documents ({leadDocs.length})</h3>
                {leadDocs.length === 0 ? (
                  <p className="text-xs text-stone-400">360 me lead.documents[] empty hai</p>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {leadDocs.map((d) => (
                      <div key={d.id} className="flex items-center gap-2 text-xs border rounded p-1.5">
                        <span className="font-medium truncate flex-1">{d.title}</span>
                        <Badge className={cn('text-[10px]', docStatusBadge(d.status))}>{d.status}</Badge>
                        {/* fileUrl can be a relative R2 key — resolve it like the Documents panel does, else it 404s. */}
                        {d.fileUrl && <button className="text-blue-600 underline" onClick={() => window.open(resolveImageUrl(d.fileUrl), '_blank')}>Open</button>}
                      </div>
                    ))}
                  </div>
                )}
                {selected.leadId && (
                  <div className="pt-2 border-t">
                    <p className="text-[11px] font-semibold text-stone-500 mb-2">Lead-stage docs manage karo:</p>
                    <DocumentManager leadId={selected.leadId} onChanged={refreshDetail} compact />
                  </div>
                )}
              </div>
              {/* Block 5 — Paisa & History (360 response se; jo array aaye wahi dikhega) */}
              <div className="p-4 border rounded-lg space-y-2 md:col-span-2">
                <h3 className="text-sm font-bold flex items-center gap-1.5"><BadgeIndianRupee size={14} /> Paisa & History</h3>
                {(() => {
                  const s: any = selected;
                  const groups: Array<[string, any[]]> = [
                    ['Invoices', s.invoices || s.lead?.quotations?.flatMap((q: any) => q.invoices || []) || []],
                    ['Payments', s.payments || s.lead?.quotations?.flatMap((q: any) => q.payments || []) || []],
                    ['Warranties', s.warranties || []],
                    ['Tasks', s.tasks || []],
                  ];
                  const total = groups.reduce((n, [, arr]) => n + (Array.isArray(arr) ? arr.length : 0), 0);
                  if (total === 0) return <p className="text-xs text-stone-400">No invoices, payments, warranties ya tasks linked</p>;
                  return (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {groups.map(([label, arr]) => (
                        <div key={label} className="rounded-lg bg-stone-50 border border-stone-100 px-3 py-2">
                          <p className="text-[11px] font-semibold text-stone-500">{label}</p>
                          <p className="text-lg font-bold text-stone-800">{Array.isArray(arr) ? arr.length : 0}</p>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailOpen(false)}>Close</Button>
            {canEdit && <Button onClick={handleSave} disabled={saving} className="bg-orange-600 hover:bg-orange-700 text-white">{saving ? 'Saving...' : 'Save'}</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Customers;
