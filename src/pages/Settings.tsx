import React, { useState, useEffect } from 'react';
import { 
  Settings as SettingsIcon, 
  Building, 
  Map, 
  Shield, 
  Mail, 
  Bell, 
  Globe,
  Save,
  Plus,
  Loader2,
  Trash2,
  X,
  Check
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { settingsApi } from '../services/api';
import { Region } from '../types';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const Settings: React.FC = () => {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [regions, setRegions] = useState<Region[]>([]);
  const [regionsLoading, setRegionsLoading] = useState(false);
  const [regionDialog, setRegionDialog] = useState(false);
  const [regionName, setRegionName] = useState('');
  const [regionSaving, setRegionSaving] = useState(false);
  const [deleteRegionId, setDeleteRegionId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchSettings = async () => {
    setIsLoading(true);
    try {
      const response = await settingsApi.getCompany();
      setSettings(response.data.data?.settings || response.data.data || null);
    } catch (error) {
      toast.error('Failed to fetch settings');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRegions = async () => {
    setRegionsLoading(true);
    try {
      const r = await settingsApi.getRegions();
      const raw = r.data.data?.regions || r.data.data || [];
      setRegions(Array.isArray(raw) ? raw : []);
    } catch { setRegions([]); } finally { setRegionsLoading(false); }
  };

  useEffect(() => {
    if (!hasPermission('settings', 'read')) {
      toast.error('Access denied');
      navigate('/');
      return;
    }
    fetchSettings();
    fetchRegions();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    const formData = new FormData(e.currentTarget);
    const updatedSettings = {
      companyName: formData.get('companyName') as string,
      companyEmail: formData.get('supportEmail') as string,
      companyPhone: formData.get('contactNumber') as string,
      address: formData.get('address') as string,
      gstNumber: formData.get('gstNumber') as string,
    };

    try {
      await settingsApi.updateCompany(updatedSettings);
      toast.success('Settings updated successfully!');
    } catch (error) {
      toast.error('Failed to update settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRegionSave = async () => {
    if (!regionName.trim()) { toast.error('Region name is required'); return; }
    setRegionSaving(true);
    try {
      await settingsApi.createRegion({ name: regionName.trim() });
      toast.success('Region created');
      setRegionDialog(false);
      setRegionName('');
      fetchRegions();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to save region');
    } finally { setRegionSaving(false); }
  };

  const handleDeleteRegion = async () => {
    if (!deleteRegionId) return;
    setDeleteLoading(true);
    try {
      await settingsApi.deleteRegion(deleteRegionId);
      toast.success('Region deleted');
      setDeleteRegionId(null);
      fetchRegions();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to delete region. Make sure no users or leads are assigned to this region.');
    } finally { setDeleteLoading(false); }
  };

  if (isLoading) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-stone-400">
        <Loader2 size={48} className="mb-4 animate-spin opacity-20" />
        <p className="text-lg font-medium">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-900">Settings</h1>
        <p className="text-stone-500">Configure your company profile and system preferences</p>
      </div>

      <Tabs defaultValue="company" className="space-y-6">
        <TabsList className="bg-card border border-stone-200 p-1 h-auto flex flex-wrap gap-1">
          <TabsTrigger value="company" className="data-[state=active]:bg-orange-50 data-[state=active]:text-orange-600">
            <Building size={16} className="mr-2" /> Company Profile
          </TabsTrigger>
          <TabsTrigger value="regions" className="data-[state=active]:bg-orange-50 data-[state=active]:text-orange-600">
            <Map size={16} className="mr-2" /> Regions
          </TabsTrigger>
          <TabsTrigger value="roles" className="data-[state=active]:bg-orange-50 data-[state=active]:text-orange-600">
            <Shield size={16} className="mr-2" /> Role Permissions
          </TabsTrigger>
          <TabsTrigger value="notifications" className="data-[state=active]:bg-orange-50 data-[state=active]:text-orange-600">
            <Bell size={16} className="mr-2" /> Notifications
          </TabsTrigger>
        </TabsList>

        <TabsContent value="company">
          <form onSubmit={handleSaveSettings}>
            <Card className="border-stone-200 shadow-sm">
              <CardHeader>
                <CardTitle>Company Information</CardTitle>
                <CardDescription>Update your company details and branding</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center gap-6">
                  <div className="w-24 h-24 bg-stone-100 rounded-xl border-2 border-dashed border-stone-300 flex flex-col items-center justify-center text-stone-400">
                    <Globe size={32} />
                    <span className="text-[10px] mt-1">Upload Logo</span>
                  </div>
                  <div className="flex-1 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="companyName">Company Name</Label>
                        <Input id="companyName" name="companyName" defaultValue={settings?.companyName || ""} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="gstNumber">GST Number</Label>
                        <Input id="gstNumber" name="gstNumber" defaultValue={settings?.gstNumber || ""} />
                      </div>
                    </div>
                  </div>
                </div>
                
                <Separator />
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="supportEmail">Support Email</Label>
                        <Input id="supportEmail" name="supportEmail" defaultValue={settings?.companyEmail || settings?.supportEmail || ""} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contactNumber">Contact Number</Label>
                        <Input id="contactNumber" name="contactNumber" defaultValue={settings?.companyPhone || settings?.contactNumber || ""} />
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <Label htmlFor="address">Registered Address</Label>
                        <Input id="address" name="address" defaultValue={settings?.address || ""} />
                  </div>
                </div>
              </CardContent>
              <CardFooter className="bg-stone-50 border-t border-stone-100 rounded-b-xl px-6 py-4">
                <Button type="submit" className="bg-orange-600 hover:bg-orange-700 text-white ml-auto" disabled={isSaving}>
                  {isSaving ? <Loader2 size={18} className="mr-2 animate-spin" /> : <Save size={18} className="mr-2" />}
                  Save Changes
                </Button>
              </CardFooter>
            </Card>
          </form>
        </TabsContent>

        <TabsContent value="regions">
          <Card className="border-stone-200 shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between">
              <div>
                <CardTitle>Manage Regions</CardTitle>
                <CardDescription>Add or delete operational regions for your business</CardDescription>
              </div>
              <Button className="bg-orange-600 hover:bg-orange-700 text-white" onClick={() => { setRegionDialog(true); setRegionName(''); }}>
                <Plus size={16} className="mr-1" /> Add Region
              </Button>
            </CardHeader>
            <CardContent>
              {regionsLoading ? (
                <div className="h-40 flex items-center justify-center"><Loader2 size={32} className="animate-spin text-stone-300" /></div>
              ) : regions.length > 0 ? (
                <div className="space-y-2">
                  {regions.map((r) => (
                    <div key={r.id} className="flex items-center justify-between p-4 bg-stone-50 rounded-lg border border-stone-100">
                      <div className="flex items-center gap-3">
                        <Map size={20} className="text-stone-400" />
                        <div>
                          <p className="font-semibold text-stone-900">{r.name}</p>
                          {r.createdAt && <p className="text-xs text-stone-400">Added {new Date(r.createdAt).toLocaleDateString('en-IN')}</p>}
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" className="text-stone-500 hover:text-red-600" onClick={() => setDeleteRegionId(r.id)}>
                        <Trash2 size={14} className="mr-1" /> Delete
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-40 flex flex-col items-center justify-center text-stone-400">
                  <Map size={48} className="mb-2 opacity-30" />
                  <p>No regions added yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roles">
          <Card className="border-stone-200 shadow-sm">
            <CardHeader>
              <CardTitle>Role Permissions</CardTitle>
              <CardDescription>Configure what each role can access in the system</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {['Sales Executive', 'Installation Engineer', 'Service Agent'].map((role) => (
                  <div key={role} className="space-y-4">
                    <h3 className="font-bold text-stone-900">{role}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <p className="text-xs text-stone-400 italic">Configure granular permissions from Employee Management → Permissions tab.</p>
                    </div>
                    <Separator />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Region Dialog */}
      <Dialog open={regionDialog} onOpenChange={setRegionDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Region</DialogTitle>
            <DialogDescription>Enter a name for the new region.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Region Name</Label>
            <Input value={regionName} onChange={e => setRegionName(e.target.value)} placeholder="e.g. North Gujarat" className="mt-2" autoFocus onKeyDown={e => e.key === 'Enter' && handleRegionSave()} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegionDialog(false)}>Cancel</Button>
            <Button className="bg-orange-600 hover:bg-orange-700 text-white" onClick={handleRegionSave} disabled={regionSaving}>
              {regionSaving && <Loader2 size={16} className="mr-2 animate-spin" />} Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Region Confirmation */}
      <Dialog open={!!deleteRegionId} onOpenChange={o => { if (!o) setDeleteRegionId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Region</DialogTitle>
            <DialogDescription>Are you sure? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteRegionId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteRegion} disabled={deleteLoading}>
              {deleteLoading && <Loader2 size={16} className="mr-2 animate-spin" />} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Settings;
