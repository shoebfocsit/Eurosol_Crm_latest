import React, { useState, useEffect } from 'react';
import { Map, Plus, Trash2, Loader2, Building2, Pencil } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { settingsApi, branchesApi } from '../services/api';
import { Region } from '../types';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { useSearchParams } from 'react-router-dom';

const RegionManagement: React.FC = () => {
  const { hasPermission } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [regions, setRegions] = useState<Region[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  // Reactive so the sidebar "+" also works when already on /regions.
  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    setAddOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('new');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  // Rename (PATCH /settings/regions/:id) — backend 400 on duplicate name.
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);

  // Branches tab (GET/POST/PATCH/DELETE /settings/branches) — wires
  // branchesApi which previously had no UI.
  const [branches, setBranches] = useState<any[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [branchDialogOpen, setBranchDialogOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<any>(null);
  const [branchForm, setBranchForm] = useState({ name: '', address: '', phone: '', regionId: '' });
  const [branchSaving, setBranchSaving] = useState(false);
  const [branchDeleteId, setBranchDeleteId] = useState<string | null>(null);
  const [branchDeleting, setBranchDeleting] = useState(false);

  const fetch = async () => {
    setLoading(true);
    try {
      const r = await settingsApi.getRegions();
      const raw = r.data.data?.regions || r.data.data || [];
      setRegions(Array.isArray(raw) ? raw : []);
    } catch { setRegions([]); } finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, []);

  const fetchBranches = async () => {
    setBranchesLoading(true);
    try {
      const r = await branchesApi.getAll();
      const raw = r.data?.data?.branches ?? r.data?.data ?? [];
      setBranches(Array.isArray(raw) ? raw : []);
    } catch (err: any) {
      if (err?.response?.status !== 403) toast.error(err?.response?.data?.message || 'Failed to fetch branches');
      setBranches([]);
    } finally { setBranchesLoading(false); }
  };

  useEffect(() => { fetchBranches(); }, []);

  const openBranchCreate = () => {
    setEditingBranch(null);
    setBranchForm({ name: '', address: '', phone: '', regionId: '' });
    setBranchDialogOpen(true);
  };

  const openBranchEdit = (b: any) => {
    setEditingBranch(b);
    setBranchForm({ name: b.name || '', address: b.address || b.location || '', phone: b.phone || '', regionId: b.regionId || b.region?.id || '' });
    setBranchDialogOpen(true);
  };

  const handleBranchSave = async () => {
    if (!branchForm.name.trim()) { toast.error('Branch name required hai'); return; }
    setBranchSaving(true);
    try {
      const payload: any = { name: branchForm.name.trim() };
      if (branchForm.address.trim()) payload.address = branchForm.address.trim();
      if (branchForm.phone.trim()) payload.phone = branchForm.phone.trim();
      if (branchForm.regionId) payload.regionId = branchForm.regionId;
      if (editingBranch) await branchesApi.update(editingBranch.id, payload);
      else await branchesApi.create(payload);
      toast.success(editingBranch ? 'Branch updated' : 'Branch created');
      setBranchDialogOpen(false);
      fetchBranches();
    } catch (err: any) {
      const raw = err?.response?.data?.message || 'Failed to save branch';
      toast.error(Array.isArray(raw) ? raw.join(', ') : raw);
    } finally { setBranchSaving(false); }
  };

  const handleBranchDelete = async () => {
    if (!branchDeleteId) return;
    setBranchDeleting(true);
    try {
      await branchesApi.delete(branchDeleteId);
      toast.success('Branch deleted');
      setBranchDeleteId(null);
      fetchBranches();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to delete branch');
    } finally { setBranchDeleting(false); }
  };

  const handleCreate = async () => {
    if (saving) return; // guard against double-submit (Enter + click) firing two POSTs
    const trimmed = name.trim();
    if (!trimmed) { toast.error('Region name is required'); return; }
    // Client-side duplicate check (case-insensitive) — server answers 409 for these.
    if (regions.some(r => String(r.name || '').trim().toLowerCase() === trimmed.toLowerCase())) {
      toast.error(`Region "${trimmed}" already exists`);
      return;
    }
    setSaving(true);
    try {
      await settingsApi.createRegion({ name: trimmed });
      toast.success('Region created');
      setAddOpen(false);
      setName('');
      fetch();
    } catch (err: any) {
      if (err?.response?.status === 409) {
        toast.error(`Region "${trimmed}" already exists`);
        fetch(); // refresh list so the existing entry is visible
      } else {
        toast.error(err?.response?.data?.message || 'Failed to create region');
      }
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleteLoading(true);
    try {
      await settingsApi.deleteRegion(deleteId);
      toast.success('Region deleted');
      setDeleteId(null);
      fetch();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to delete region. Make sure no users or leads are assigned.');
    } finally { setDeleteLoading(false); }
  };

  const openRename = (r: Region) => {
    setRenameId(r.id);
    setRenameName(r.name || '');
  };

  const handleRename = async () => {
    if (!renameId || renameSaving) return;
    const trimmed = renameName.trim();
    if (!trimmed) { toast.error('Region name is required'); return; }
    const current = regions.find(r => r.id === renameId);
    if (current && String(current.name || '').trim().toLowerCase() === trimmed.toLowerCase()) {
      setRenameId(null);
      return; // no change
    }
    if (regions.some(r => r.id !== renameId && String(r.name || '').trim().toLowerCase() === trimmed.toLowerCase())) {
      toast.error(`Region "${trimmed}" already exists`);
      return;
    }
    setRenameSaving(true);
    try {
      await settingsApi.updateRegion(renameId, { name: trimmed });
      toast.success('Region renamed');
      setRenameId(null);
      fetch();
    } catch (err: any) {
      if (err?.response?.status === 400 || err?.response?.status === 409) {
        toast.error(`Region "${trimmed}" already exists`);
      } else {
        toast.error(err?.response?.data?.message || 'Failed to rename region');
      }
    } finally { setRenameSaving(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Regions & Branches</h1>
          <p className="text-stone-500">Manage operational regions and office branches</p>
        </div>
        {hasPermission('settings', 'create') && (
        <Button className="bg-orange-600 hover:bg-orange-700 text-white" onClick={() => { setAddOpen(true); setName(''); }}>
          <Plus size={16} className="mr-1" /> Add Region
        </Button>
        )}
      </div>

      <Tabs defaultValue="regions" className="space-y-4">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="regions"><Map size={14} className="mr-1.5" /> Regions</TabsTrigger>
          <TabsTrigger value="branches"><Building2 size={14} className="mr-1.5" /> Branches</TabsTrigger>
        </TabsList>

        <TabsContent value="regions">
      <Card className="border-stone-200 shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="h-48 flex items-center justify-center"><Loader2 size={32} className="animate-spin text-stone-300" /></div>
          ) : regions.length > 0 ? (
            <div className="divide-y divide-stone-100">
              {regions.map(r => (
                <div key={r.id} className="flex items-center justify-between px-6 py-4 hover:bg-stone-50">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center"><Map size={18} /></div>
                    <div>
                      <p className="font-semibold text-stone-900">{r.name}</p>
                      {r.createdAt && <p className="text-xs text-stone-400">Added {new Date(r.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {hasPermission('settings', 'update') && (
                    <Button variant="ghost" size="sm" className="text-stone-500 hover:text-orange-600" onClick={() => openRename(r)}>
                      <Pencil size={14} className="mr-1" /> Rename
                    </Button>
                    )}
                    {hasPermission('settings', 'delete') && (
                    <Button variant="ghost" size="sm" className="text-stone-500 hover:text-red-600" onClick={() => setDeleteId(r.id)}>
                      <Trash2 size={14} className="mr-1" /> Delete
                    </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-48 flex flex-col items-center justify-center text-stone-400">
              <Map size={48} className="mb-2 opacity-30" />
              <p>No regions added yet</p>
            </div>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="branches" className="space-y-4">
          <div className="flex justify-end">
            {hasPermission('settings', 'create') && (
              <Button variant="outline" onClick={openBranchCreate}><Plus size={14} className="mr-1" /> Add Branch</Button>
            )}
          </div>
          <Card className="border-stone-200 shadow-sm">
            <CardContent className="p-0">
              {branchesLoading ? (
                <div className="h-48 flex items-center justify-center"><Loader2 size={32} className="animate-spin text-stone-300" /></div>
              ) : branches.length > 0 ? (
                <div className="divide-y divide-stone-100">
                  {branches.map((b: any) => (
                    <div key={b.id} className="flex items-center justify-between px-6 py-4 hover:bg-stone-50">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center"><Building2 size={18} /></div>
                        <div>
                          <p className="font-semibold text-stone-900">{b.name}</p>
                          {(b.address || b.location || b.phone) && (
                            <p className="text-xs text-stone-400">{[b.address || b.location, b.phone].filter(Boolean).join(' · ')}</p>
                          )}
                        </div>
                        {(b.region?.name || regions.find((r) => r.id === b.regionId)?.name) ? (
                          <Badge variant="outline" className="font-normal shrink-0">{b.region?.name || regions.find((r) => r.id === b.regionId)?.name}</Badge>
                        ) : (
                          <Badge variant="outline" className="font-normal text-stone-400 shrink-0">No region</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {hasPermission('settings', 'update') && (
                          <Button variant="ghost" size="sm" className="text-stone-500" onClick={() => openBranchEdit(b)}>
                            <Pencil size={14} className="mr-1" /> Edit
                          </Button>
                        )}
                        {hasPermission('settings', 'delete') && (
                          <Button variant="ghost" size="sm" className="text-stone-500 hover:text-red-600" onClick={() => setBranchDeleteId(b.id)}>
                            <Trash2 size={14} className="mr-1" /> Delete
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-48 flex flex-col items-center justify-center text-stone-400">
                  <Building2 size={48} className="mb-2 opacity-30" />
                  <p>No branches added yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Region</DialogTitle>
            <DialogDescription>Enter a name for the new region.</DialogDescription>
          </DialogHeader>
          <div className="py-4"><Label>Region Name</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. North Gujarat" className="mt-2" autoFocus onKeyDown={e => e.key === 'Enter' && handleCreate()} /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button className="bg-orange-600 hover:bg-orange-700 text-white" onClick={handleCreate} disabled={saving}>{saving && <Loader2 size={16} className="mr-2 animate-spin" />}Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteId} onOpenChange={o => { if (!o) setDeleteId(null); }}>        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Region</DialogTitle>
            {/* Name the region: with only an id in state the admin could not
                tell which row they were about to destroy. */}
            <DialogDescription>
              Delete &quot;{regions.find(r => r.id === deleteId)?.name || deleteId}&quot;? This cannot be undone.
              Leads and employees assigned to it will lose their region.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteLoading}>{deleteLoading && <Loader2 size={16} className="mr-2 animate-spin" />}Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!renameId} onOpenChange={o => { if (!o) setRenameId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename Region</DialogTitle>
            <DialogDescription>
              Rename &quot;{regions.find(r => r.id === renameId)?.name || ''}&quot;. Duplicate name par server 400 dega.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4"><Label>Region Name</Label><Input value={renameName} onChange={e => setRenameName(e.target.value)} placeholder="e.g. North Gujarat" className="mt-2" autoFocus onKeyDown={e => e.key === 'Enter' && handleRename()} /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameId(null)}>Cancel</Button>
            <Button className="bg-orange-600 hover:bg-orange-700 text-white" onClick={handleRename} disabled={renameSaving}>{renameSaving && <Loader2 size={16} className="mr-2 animate-spin" />}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={branchDialogOpen} onOpenChange={setBranchDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingBranch ? 'Edit Branch' : 'Add Branch'}</DialogTitle>
            <DialogDescription>Office branch details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label>Name *</Label><Input value={branchForm.name} onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })} placeholder="e.g. Ahmedabad HQ" /></div>
            <div className="space-y-1.5"><Label>Region</Label>
              <Select value={branchForm.regionId || 'none'} onValueChange={(v) => setBranchForm({ ...branchForm, regionId: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="Select region (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No region (central)</SelectItem>
                  {regions.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Address</Label><Input value={branchForm.address} onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })} placeholder="Office address" /></div>
            <div className="space-y-1.5"><Label>Phone</Label><Input value={branchForm.phone} onChange={(e) => setBranchForm({ ...branchForm, phone: e.target.value })} placeholder="9876543210" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBranchDialogOpen(false)}>Cancel</Button>
            <Button className="bg-orange-600 hover:bg-orange-700 text-white" onClick={handleBranchSave} disabled={branchSaving}>{branchSaving && <Loader2 size={16} className="mr-2 animate-spin" />}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!branchDeleteId} onOpenChange={o => { if (!o) setBranchDeleteId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Branch</DialogTitle>
            <DialogDescription>Delete &quot;{branches.find((b: any) => b.id === branchDeleteId)?.name || branchDeleteId}&quot;? This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBranchDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleBranchDelete} disabled={branchDeleting}>{branchDeleting && <Loader2 size={16} className="mr-2 animate-spin" />}Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RegionManagement;
