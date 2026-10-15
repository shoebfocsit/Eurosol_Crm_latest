import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Sun, Mail, Phone, MapPin, Shield, LogOut, Edit3, Lock, User, Loader2, Wrench, Receipt, LayoutDashboard } from 'lucide-react';
import { authApi, customerApi } from '../../services/api';
import { Employee } from '../../types';
import { cn } from '@/lib/utils';
import { safeStorage } from '@/lib/storage';
import { toast } from 'sonner';

const roleBadgeClass: Record<string, string> = {
  ADMIN: 'bg-red-100 text-red-700',
  MANAGER: 'bg-blue-100 text-blue-700',
  SALES_EXECUTIVE: 'bg-green-100 text-green-700',
  ENGINEER: 'bg-orange-100 text-orange-700',
  CUSTOMER: 'bg-stone-100 text-stone-700',
  SUPER_ADMIN: 'bg-purple-100 text-purple-700',
};

const PortalProfile: React.FC = () => {
  const [profile, setProfile] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({ name: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [customerRequests, setCustomerRequests] = useState<any[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  // Owner-filtered overview + invoices (GET /customer/dashboard, /customer/invoices).
  const [overview, setOverview] = useState<any>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [portalDataLoading, setPortalDataLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    if (!safeStorage.getItem('portal_token')) {
      setLoading(false);
      navigate('/portal/login');
      return () => { active = false; };
    }
    customerApi.me().then(r => {
      if (!active) return;
      const u = r.data.user || r.data.data || r.data;
      if (String(u?.role || '').toUpperCase() !== 'CUSTOMER') {
        safeStorage.removeItem('portal_token');
        safeStorage.removeItem('portal_refresh_token');
        safeStorage.removeItem('portal_user');
        navigate('/portal/login');
        return;
      }
      setProfile(u);
      safeStorage.setItem('portal_user', JSON.stringify(u));
    }).catch(() => { if (active) navigate('/portal/login'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [navigate]);

  useEffect(() => {
    if (!profile || String(profile.role || '').toUpperCase() !== 'CUSTOMER') return;
    let active = true;
    setRequestsLoading(true);
    customerApi.serviceRequests()
      .then(r => {
        const raw = r.data?.data?.serviceRequests ?? r.data?.data ?? r.data;
        if (active) setCustomerRequests(Array.isArray(raw) ? raw : []);
      })
      .catch(() => { if (active) setCustomerRequests([]); })
      .finally(() => { if (active) setRequestsLoading(false); });
    setPortalDataLoading(true);
    Promise.allSettled([customerApi.dashboard(), customerApi.invoices()])
      .then(([dRes, iRes]) => {
        if (!active) return;
        if (dRes.status === 'fulfilled') {
          const d = dRes.value.data?.data ?? dRes.value.data;
          setOverview(d && typeof d === 'object' ? d : null);
        }
        if (iRes.status === 'fulfilled') {
          const raw = iRes.value.data?.data?.invoices ?? iRes.value.data?.data ?? iRes.value.data;
          setInvoices(Array.isArray(raw) ? raw : []);
        }
      })
      .finally(() => { if (active) setPortalDataLoading(false); });
    return () => { active = false; };
  }, [profile]);

  const handleLogout = () => {
    try {
      void authApi.logout()?.catch(() => undefined);
    } catch {}
    safeStorage.removeItem('portal_token');
    safeStorage.removeItem('portal_refresh_token');
    safeStorage.removeItem('portal_user');
    safeStorage.removeItem('solar_crm_token');
    safeStorage.removeItem('solar_crm_user');
    safeStorage.removeItem('solar_crm_refresh_token');
    navigate('/portal/login');
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await customerApi.updateProfile(editData);
      setProfile(p => p ? { ...p, ...editData } : null);
      toast.success('Profile updated');
      setEditMode(false);
    } catch { toast.error('Failed to update profile'); } finally { setSaving(false); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 size={32} className="animate-spin text-stone-400" /></div>;

  if (!profile) return null;

  return (
    <div className="min-h-screen bg-stone-100">
      <header className="bg-card border-b border-stone-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-orange-600 rounded-lg flex items-center justify-center"><Sun size={18} className="text-white" /></div>
          <span className="font-bold text-stone-900">Customer Portal</span>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/portal/profile" className="text-sm text-orange-600 hover:underline">Profile</Link>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="text-red-500"><LogOut size={16} className="mr-1" /> Logout</Button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-6">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle className="text-2xl">My Profile</CardTitle>
              <CardDescription>Your account information</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => { setEditMode(true); setEditData({ name: profile.name, phone: profile.phone || '' }); }}>
              <Edit3 size={14} className="mr-1" /> Edit Profile
            </Button>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center text-2xl font-bold text-orange-600">{(profile.name || '?').charAt(0)}</div>
              <div>
                <h3 className="text-xl font-bold text-stone-900">{profile.name}</h3>
                <Badge className={cn("mt-1", roleBadgeClass[profile.role])}>{profile.role.replace('_', ' ')}</Badge>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div className="flex items-center gap-3 p-3 bg-stone-50 rounded-lg"><Mail size={18} className="text-stone-400" /><div><p className="text-xs text-stone-500">Email</p><p className="text-sm font-medium text-stone-900">{profile.email}</p></div></div>
              <div className="flex items-center gap-3 p-3 bg-stone-50 rounded-lg"><Phone size={18} className="text-stone-400" /><div><p className="text-xs text-stone-500">Phone</p><p className="text-sm font-medium text-stone-900">{profile.phone || 'Not provided'}</p></div></div>
              <div className="flex items-center gap-3 p-3 bg-stone-50 rounded-lg"><Shield size={18} className="text-stone-400" /><div><p className="text-xs text-stone-500">Role</p><p className="text-sm font-medium text-stone-900">{profile.role.replace('_', ' ')}</p></div></div>
              {profile.regions && profile.regions.length > 0 && (
                <div className="flex items-start gap-3 p-3 bg-stone-50 rounded-lg"><MapPin size={18} className="text-stone-400 mt-0.5" /><div><p className="text-xs text-stone-500">Regions</p><div className="flex flex-wrap gap-1 mt-1">{profile.regions.map(r => <Badge key={r.id} variant="outline" className="text-xs">{r.name}</Badge>)}</div></div></div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Change Password Card */}
        <Card className="mt-6">
          <CardHeader><CardTitle className="text-lg">Security</CardTitle><CardDescription>Update your password</CardDescription></CardHeader>
          <CardContent>
            <p className="text-sm text-stone-500 mb-4">To change your password, use the forgot password flow. A reset link will be sent to your email.</p>
            <Button variant="outline" size="sm" onClick={() => {
              authApi.forgotPassword({ email: profile.email }).then(() => toast.success('Reset link sent to your email')).catch(() => toast.error('Failed to send reset link'));
            }}><Lock size={14} className="mr-1" /> Send Password Reset</Button>
          </CardContent>
        </Card>

        {(overview || portalDataLoading) && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2"><LayoutDashboard size={18} className="text-orange-600" /> My Overview</CardTitle>
              <CardDescription>Your project at a glance</CardDescription>
            </CardHeader>
            <CardContent>
              {portalDataLoading && !overview ? (
                <div className="flex items-center justify-center py-6 text-stone-400"><Loader2 size={24} className="animate-spin" /></div>
              ) : (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {[
                    ['Quotations', overview?.quotations ?? overview?.totalQuotations],
                    ['Installations', overview?.installations ?? overview?.totalInstallations],
                    ['Invoices', overview?.invoices ?? overview?.totalInvoices ?? invoices.length],
                    ['Pending Amount', overview?.pendingAmount != null ? `₹${Number(overview.pendingAmount).toLocaleString('en-IN')}` : undefined],
                    ['Warranties', overview?.warranties ?? overview?.totalWarranties],
                    ['Service Requests', overview?.serviceRequests ?? overview?.totalServiceRequests ?? customerRequests.length],
                  ].filter(([, v]) => v !== undefined && v !== null).map(([label, v]) => (
                    <div key={label} className="rounded-lg border border-stone-200 p-3">
                      <p className="text-xs text-stone-500">{label}</p>
                      <p className="text-lg font-bold text-stone-900">{String(v)}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {String(profile.role || '').toUpperCase() === 'CUSTOMER' && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2"><Wrench size={18} className="text-orange-600" /> My Service Requests</CardTitle>
              <CardDescription>Requests you have submitted</CardDescription>
            </CardHeader>
            <CardContent>
              {requestsLoading ? (
                <div className="flex items-center justify-center py-8 text-stone-400"><Loader2 size={24} className="animate-spin" /></div>
              ) : customerRequests.length === 0 ? (
                <p className="text-sm text-stone-500 py-4">You haven't submitted any service requests yet.</p>
              ) : (
                <div className="space-y-3">
                  {customerRequests.map((req: any) => {
                    const status = String(req.status || 'Open').toLowerCase();
                    return (
                      <div key={req.id || req._id || req.title} className="rounded-lg border border-stone-200 p-4">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <p className="font-semibold text-stone-900">{req.subject || req.title || 'Service Request'}</p>
                          <Badge className={cn(
                            "font-medium",
                            status === 'open' && "bg-blue-100 text-blue-700",
                            status === 'in_progress' || status === 'in progress' ? "bg-yellow-100 text-yellow-700" : "",
                            status === 'resolved' && "bg-green-100 text-green-700",
                            status === 'closed' && "bg-stone-200 text-stone-700"
                          )}>{req.status || 'Open'}</Badge>
                        </div>
                        {req.description && <p className="text-sm text-stone-600 mt-1">{req.description}</p>}
                        <div className="flex items-center gap-4 mt-2 text-xs text-stone-500 flex-wrap">
                          {req.type && <span className="font-medium text-orange-600">{req.type}</span>}
                          <span className="inline-flex items-center gap-1"><Wrench size={12} /> {req.id ? String(req.id).substring(0, 8) : ''}</span>
                          {(req.scheduledDate || req.visitDate || req.createdAt) && (
                            <span>{new Date(req.scheduledDate || req.visitDate || req.createdAt).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {invoices.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2"><Receipt size={18} className="text-orange-600" /> My Invoices</CardTitle>
              <CardDescription>Your billing history</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {invoices.map((inv: any, i: number) => (
                  <div key={inv.id || i} className="rounded-lg border border-stone-200 p-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <p className="font-semibold text-stone-900">{inv.number || inv.invoiceNumber || `Invoice ${i + 1}`}</p>
                      <Badge className={cn(
                        "font-medium capitalize",
                        String(inv.status || '').toLowerCase() === 'paid' && "bg-green-100 text-green-700",
                        String(inv.status || '').toLowerCase() === 'overdue' && "bg-red-100 text-red-700",
                        !['paid', 'overdue'].includes(String(inv.status || '').toLowerCase()) && "bg-stone-100 text-stone-600",
                      )}>{inv.status || '—'}</Badge>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-stone-500">
                      <span className="font-semibold text-stone-800 text-sm">₹{Number(inv.total ?? inv.totalAmount ?? inv.amount ?? 0).toLocaleString('en-IN')}</span>
                      {(inv.dueDate || inv.createdAt) && <span>Due: {new Date(inv.dueDate || inv.createdAt).toLocaleDateString('en-IN')}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Edit Profile Modal */}
      <Dialog open={editMode} onOpenChange={setEditMode}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Profile</DialogTitle><DialogDescription>Update your name and phone number.</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>Name</Label><Input value={editData.name} onChange={e => setEditData(p => ({ ...p, name: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Phone</Label><Input value={editData.phone} onChange={e => setEditData(p => ({ ...p, phone: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditMode(false)}>Cancel</Button>
            <Button className="bg-orange-600 hover:bg-orange-700 text-white" onClick={handleSaveProfile} disabled={saving}>{saving && <Loader2 size={16} className="mr-2 animate-spin" />}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PortalProfile;
