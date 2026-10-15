import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Loader2, ShieldCheck, Gift, AlertTriangle, Pencil, Trash2, CheckCircle2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { warrantiesApi, referralsApi, customersApi } from '../services/api';
import { toast } from 'sonner';
import { cn, toLocalDateKey } from '@/lib/utils';

const WarrantyReferrals: React.FC = () => {
  const [warranties, setWarranties] = useState<any[]>([]);
  const [expiring, setExpiring] = useState<any[]>([]);
  const [referrals, setReferrals] = useState<any[]>([]);
  const [referralStats, setReferralStats] = useState<any>({});
  const [customers, setCustomers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [warrantyOpen, setWarrantyOpen] = useState(false);
  const [referralOpen, setReferralOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [wForm, setWForm] = useState<any>({ customerId: '', customerName: '', itemType: 'Solar Panel', itemName: '', serial: '', startDate: '', years: 25 });
  const [rForm, setRForm] = useState<any>({ customerId: '', customerName: '', referredName: '', referredPhone: '', reward: '₹5,000 credit' });

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [wRes, expRes, refRes, custRes] = await Promise.all([
        warrantiesApi.getAll(),
        warrantiesApi.getExpiring().catch(() => ({ data: { data: { expiring: [] } } })),
        referralsApi.getAll(),
        customersApi.getAll().catch(() => ({ data: { data: { customers: [] } } })),
      ]);
      const w = wRes.data.data;
      setWarranties(Array.isArray(w?.warranties) ? w.warranties : []);
      setExpiring(Array.isArray(expRes.data.data?.warranties) ? expRes.data.data.warranties : (Array.isArray(expRes.data.data?.expiring) ? expRes.data.data.expiring : []));
      const r = refRes.data.data;
      setReferrals(Array.isArray(r?.referrals) ? r.referrals : []);
      setReferralStats(r?.stats || {});
      const c = custRes.data.data?.customers || custRes.data.data || [];
      setCustomers(Array.isArray(c) ? c : []);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to fetch data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const saveWarranty = async () => {
    if (!wForm.customerId || !wForm.itemName) { toast.error('Customer and item are required'); return; }
    setSaving(true);
    try {
      const customer = customers.find(c => c.id === wForm.customerId);
      const years = Number(wForm.years) || 1;
      const start = wForm.startDate || toLocalDateKey();
      const [sy, sm, sd] = start.split('-').map(Number);
      const end = toLocalDateKey(new Date(new Date(sy, sm - 1, sd).getTime() + years * 365 * 86400000));
      const payload = {
        customerId: wForm.customerId,
        productName: wForm.itemName,
        serialNumber: wForm.serial || '',
        startDate: start,
        durationMonths: years * 12,
        endDate: end,
        status: 'active',
      };
      if (wForm.id) {
        await warrantiesApi.update(wForm.id, payload);
        toast.success('Warranty updated');
      } else {
        await warrantiesApi.create(payload);
        toast.success('Warranty registered');
      }
      setWarrantyOpen(false);
      setWForm({ customerId: '', customerName: '', itemType: 'Solar Panel', itemName: '', serial: '', startDate: '', years: 25 });
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to save warranty');
    } finally {
      setSaving(false);
    }
  };

  const saveReferral = async () => {
    if (!rForm.customerId || !rForm.referredName) { toast.error('Customer and referred name are required'); return; }
    setSaving(true);
    try {
      const customer = customers.find(c => c.id === rForm.customerId);
      const rewardAmount = parseFloat(String(rForm.reward || '').replace(/[^0-9.]/g, '')) || 0;
      const payload: any = { name: rForm.referredName, phone: rForm.referredPhone || '' };
      if (rForm.customerId) payload.referrerCustomerId = rForm.customerId;
      if (rewardAmount > 0) payload.rewardAmount = rewardAmount;
      if (rForm.id) {
        await referralsApi.update(rForm.id, payload);
        toast.success('Referral updated');
      } else {
        await referralsApi.create(payload);
        toast.success('Referral recorded');
      }
      setReferralOpen(false);
      setRForm({ customerId: '', customerName: '', referredName: '', referredPhone: '', reward: '₹5,000 credit' });
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to save referral');
    } finally {
      setSaving(false);
    }
  };

  const updateReferralStatus = async (r: any, status: string) => {
    try {
      await referralsApi.update(r.id, { status });
      setReferrals(prev => prev.map(x => x.id === r.id ? { ...x, status } : x));
      toast.success(`Referral ${status}`);
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Update failed');
    }
  };

  const deleteWarranty = async (w: any) => {
    try {
      await warrantiesApi.delete(w.id);
      setWarranties(prev => prev.filter(x => x.id !== w.id));
      toast.success('Warranty deleted');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Delete failed');
    }
  };

  const deleteReferral = async (r: any) => {
    try {
      await referralsApi.delete(r.id);
      setReferrals(prev => prev.filter(x => x.id !== r.id));
      toast.success('Referral deleted');
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Delete failed');
    }
  };

  const calcDaysLeft = (w: any): number => {
    if (w.daysLeft != null) return w.daysLeft;
    if (!w.endDate) return 0;
    const diff = new Date(w.endDate).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / 86400000));
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ShieldCheck className="text-orange-600" /> Warranty &amp; Referrals</h1>
          <p className="text-sm text-stone-500">Track equipment warranties with expiry alerts &amp; run a referral program.</p>
        </div>
        <div className="md:ml-auto flex gap-2">
          <Button onClick={() => { setWForm({ customerId: '', customerName: '', itemType: 'Solar Panel', itemName: '', serial: '', startDate: '', years: 25 }); setWarrantyOpen(true); }}>
            <Plus size={16} className="mr-1" /> New Warranty
          </Button>
          <Button variant="outline" onClick={() => { setRForm({ customerId: '', customerName: '', referredName: '', referredPhone: '', reward: '₹5,000 credit' }); setReferralOpen(true); }}>
            <Gift size={16} className="mr-1" /> New Referral
          </Button>
        </div>
      </div>

      {expiring.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
          <p className="text-sm font-semibold text-amber-800 flex items-center gap-2"><AlertTriangle size={16} /> Warranty expiring soon ({expiring.length})</p>
          {expiring.map(w => (
            <div key={w.id} className="flex items-center justify-between text-sm">
              <span className={cn("font-medium", w.expired && "text-red-600")}>
                {w.customer?.name || w.customerName} — {w.productName || w.itemName} {w.expired && <Badge variant="destructive" className="ml-1 text-[10px]">Expired</Badge>}
              </span>
              <span className="text-xs text-stone-500">{w.expired ? 'Expired' : `${calcDaysLeft(w)} days left`} • {w.endDate}</span>
            </div>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="py-16 flex justify-center"><Loader2 size={32} className="animate-spin opacity-30" /></div>
      ) : (
        <Tabs defaultValue="warranties">
          <TabsList>
            <TabsTrigger value="warranties"><ShieldCheck size={13} /> Warranties</TabsTrigger>
            <TabsTrigger value="referrals"><Gift size={13} /> Referrals ({referralStats.pending ?? 0} pending)</TabsTrigger>
          </TabsList>

          <TabsContent value="warranties">
            <Card><CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Serial</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>End</TableHead>
                    <TableHead>Days Left</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {warranties.map(w => (
                    <TableRow key={w.id}>
                      <TableCell className="font-medium">{w.customer?.name || w.customerName}</TableCell>
                      <TableCell>{w.productName || w.itemName}</TableCell>
                      <TableCell className="text-sm">{w.serialNumber || w.serial || '—'}</TableCell>
                      <TableCell className="text-sm">{(w.startDate || '').slice(0, 10)}</TableCell>
                      <TableCell className="text-sm">{(w.endDate || '').slice(0, 10)}</TableCell>
                      <TableCell>
                        <Badge variant={calcDaysLeft(w) < 90 ? 'destructive' : 'default'}>{calcDaysLeft(w)} days</Badge>
                      </TableCell>
                      <TableCell><Badge variant="outline">{w.status}</Badge></TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => { setWForm({ ...w, customerId: w.customerId, itemName: w.productName || w.itemName, serial: w.serialNumber || w.serial || '', years: Math.round((w.durationMonths || 12) / 12), startDate: (w.startDate || '').slice(0, 10) }); setWarrantyOpen(true); }}><Pencil size={15} /></Button>
                        <Button variant="ghost" size="sm" onClick={() => deleteWarranty(w)}><Trash2 size={15} className="text-red-500" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {warranties.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-stone-400 py-8">No warranties registered</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="referrals">
            <Card><CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>From Customer</TableHead>
                    <TableHead>Referred Person</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Reward</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {referrals.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.referrerCustomer?.name || r.customerName || '—'}</TableCell>
                      <TableCell>{r.name || r.referredName}</TableCell>
                      <TableCell className="text-sm">{r.phone || r.referredPhone || '—'}</TableCell>
                      <TableCell className="text-sm">{r.rewardAmount ? `₹${Number(r.rewardAmount).toLocaleString('en-IN')}` : (r.reward || '—')}</TableCell>
                      <TableCell>
                        <Select value={r.status} onValueChange={v => updateReferralStatus(r, v)}>
                          <SelectTrigger className="w-32 h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="converted">Converted</SelectItem>
                            <SelectItem value="rewarded">Rewarded</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => deleteReferral(r)}><Trash2 size={15} className="text-red-500" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {referrals.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-stone-400 py-8">No referrals yet</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={warrantyOpen} onOpenChange={setWarrantyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{wForm.id ? 'Edit Warranty' : 'Register Warranty'}</DialogTitle>
            <DialogDescription>End date is auto-computed from start date + years.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Customer *</Label>
              <Select value={wForm.customerId} onValueChange={v => setWForm({ ...wForm, customerId: v })}>
                <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Item Type</Label>
                <Select value={wForm.itemType} onValueChange={v => setWForm({ ...wForm, itemType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['Solar Panel', 'Inverter', 'Battery', 'Structure', 'Other'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Item Name *</Label>
                <Input value={wForm.itemName || ''} onChange={e => setWForm({ ...wForm, itemName: e.target.value })} placeholder="Eurosol 550W Panel" />
              </div>
              <div className="space-y-1.5">
                <Label>Serial</Label>
                <Input value={wForm.serial || ''} onChange={e => setWForm({ ...wForm, serial: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Years</Label>
                <Input type="number" value={wForm.years || ''} onChange={e => setWForm({ ...wForm, years: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Start Date</Label>
              <Input type="date" value={wForm.startDate || ''} onChange={e => setWForm({ ...wForm, startDate: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWarrantyOpen(false)}>Cancel</Button>
            <Button onClick={saveWarranty} disabled={saving}>{saving ? <Loader2 size={15} className="animate-spin" /> : 'Save Warranty'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={referralOpen} onOpenChange={setReferralOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{rForm.id ? 'Edit Referral' : 'New Referral'}</DialogTitle>
            <DialogDescription>Reward loyal customers for bringing new business.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>From Customer *</Label>
              <Select value={rForm.customerId} onValueChange={v => setRForm({ ...rForm, customerId: v })}>
                <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Referred Name *</Label>
                <Input value={rForm.referredName || ''} onChange={e => setRForm({ ...rForm, referredName: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Referred Phone</Label>
                <Input value={rForm.referredPhone || ''} onChange={e => setRForm({ ...rForm, referredPhone: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Reward</Label>
              <Input value={rForm.reward || ''} onChange={e => setRForm({ ...rForm, reward: e.target.value })} placeholder="₹5,000 credit" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReferralOpen(false)}>Cancel</Button>
            <Button onClick={saveReferral} disabled={saving}>{saving ? <Loader2 size={15} className="animate-spin" /> : 'Save Referral'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WarrantyReferrals;