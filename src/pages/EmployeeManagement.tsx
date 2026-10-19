import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, Search, Loader2, ChevronLeft, ChevronRight, Trash2, Edit, Eye, EyeOff, Shield, ShieldCheck, Upload, RotateCcw, Download, X, UserIcon, MapPin, CheckCircle2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { employeesApi, settingsApi } from '../services/api';
import { Employee, Region, Permission, PermissionModule } from '../types';
import { cn, resolveImageUrl, toDateInputValue } from '@/lib/utils';
import { AppImage } from '../components/AppImage';
import { toast } from 'sonner';
import ProfileCard from '../components/ProfileCard';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { maskBankAccount } from '../lib/validators';

const MODULES: PermissionModule[] = [
  'leads', 'inventory', 'quotations', 'surveys', 'installations',
  'payments', 'service_requests', 'employees', 'analytics', 'blog',
  'feedback', 'website', 'chat', 'settings', 'notifications',
  'customers', 'documents', 'tasks',
];

// Modules removed from the product but still present in the backend role-default
// template — hide them everywhere in the permission UI.
const HIDDEN_MODULES = new Set<string>(['templates']);

const ACTIONS = ['create', 'read', 'update', 'delete'] as const;
const ACTION_LABELS = { create: 'Create', read: 'Read', update: 'Update', delete: 'Delete' };

const emptyPermissions = (): Permission[] =>
  MODULES.map(m => ({ module: m, canCreate: false, canRead: false, canUpdate: false, canDelete: false }));

const allPermissions = (): Permission[] =>
  MODULES.map(m => ({ module: m, canCreate: true, canRead: true, canUpdate: true, canDelete: true }));

const STATUS_TABS = [
  { value: 'ALL_ACTIVE', label: 'All Active', icon: '🟢' },
  { value: 'ACTIVE', label: 'Active Only', icon: '✅' },
  { value: 'RESTORED', label: 'Restored Only', icon: '🟠' },
  { value: 'TERMINATED', label: 'Terminated', icon: '🔴' },
];

const roleBadgeClass: Record<string, string> = {
  ADMIN: 'bg-red-100 text-red-700',
  MANAGER: 'bg-blue-100 text-blue-700',
  SALES_EXECUTIVE: 'bg-green-100 text-green-700',
  ENGINEER: 'bg-orange-100 text-orange-700',
  CUSTOMER: 'bg-stone-100 text-stone-700',
  SUPER_ADMIN: 'bg-purple-100 text-purple-700',
};

// Roles accepted by the backend (CreateEmployeeDto): ADMIN, MANAGER, SALES_EXECUTIVE, ENGINEER, CUSTOMER
const ROLE_OPTIONS = ['ADMIN', 'MANAGER', 'SALES_EXECUTIVE', 'ENGINEER', 'CUSTOMER'];

const addFormDefaults = {
  name: '', email: '', password: '', phone: '', role: '', regionIds: [] as string[],
  joiningDate: '', salary: '', bankName: '', bankBranch: '', bankAccountNumber: '', bankIfscCode: '', beneficiaryName: '',
};

const EmployeeManagement: React.FC = () => {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusTab, setStatusTab] = useState('ALL_ACTIVE');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 10;

  const [showPassword, setShowPassword] = useState(false);
  const [regions, setRegions] = useState<Region[]>([]);

  const [isAddOpen, setIsAddOpen] = useState(false);

  // Reactive so the sidebar "+" also works when already on /employees.
  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    setIsAddOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('new');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  const [addLoading, setAddLoading] = useState(false);
  const [addData, setAddData] = useState(addFormDefaults);
  const [addPermissions, setAddPermissions] = useState<Permission[]>(emptyPermissions());

  const [editEmployee, setEditEmployee] = useState<Employee | null>(null);
  const [editStep, setEditStep] = useState(0);
  const [editData, setEditData] = useState({ name: '', phone: '', role: '', isActive: true, regionIds: [] as string[],
    joiningDate: '', salary: '', bankName: '', bankBranch: '', bankAccountNumber: '', bankIfscCode: '', beneficiaryName: '' });
  const [editPassword, setEditPassword] = useState('');
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editIsSuperAdmin, setEditIsSuperAdmin] = useState(false);
  const [editPermissions, setEditPermissions] = useState<Permission[]>(emptyPermissions());
  const [editPermsLoading, setEditPermsLoading] = useState(false);
  // Guards the permissions PUT: never send a grid we failed to load.
  const [editPermsLoaded, setEditPermsLoaded] = useState(false);
  const [editPermsLoadedError, setEditPermsLoadedError] = useState(false);

  // Role-default templates (GET /employees/roles/defaults, ADMIN only).
  const [roleDefaults, setRoleDefaults] = useState<Record<string, Permission[]> | null>(null);
  const [addPermsCustomized, setAddPermsCustomized] = useState(false);
  const [resettingPerms, setResettingPerms] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        const res = await employeesApi.getRoleDefaults();
        const d = res.data?.data || res.data || {};
        const norm: Record<string, Permission[]> = {};
        Object.entries(d).forEach(([role, arr]) => { if (Array.isArray(arr)) norm[role] = arr as Permission[]; });
        setRoleDefaults(norm);
      } catch { setRoleDefaults(null); }
    })();
  }, []);

  // Module universe = checklist + any extra modules the backend template knows
  // (backend total 27; checklist alone would hide them).
  const permModules = useMemo<PermissionModule[]>(() => {
    const seen = new Set<string>(MODULES as string[]);
    if (roleDefaults) Object.values(roleDefaults).flat().forEach((p: any) => { const m = String(p?.module || ''); if (m) seen.add(m); });
    return ([...MODULES, ...[...seen].filter((m) => !(MODULES as string[]).includes(m))] as PermissionModule[])
      .filter((m) => !HIDDEN_MODULES.has(m));
  }, [roleDefaults]);

  const withAllModules = (perms: Permission[]): Permission[] => {
    const have = new Set(perms.map((p) => String(p.module)));
    return [...perms, ...permModules.filter((m) => !have.has(m)).map((m) => ({ module: m, canCreate: false, canRead: false, canUpdate: false, canDelete: false } as Permission))];
  };
  const hasAllAccess = (perms: Permission[]) =>
    permModules.every((m) => { const p = perms.find((x) => x.module === m); return !!p && p.canCreate && p.canRead && p.canUpdate && p.canDelete; });

  // Compact read-only preview of a role's default template.
  const renderRoleDefaults = (role: string) => {
    const tpl = roleDefaults?.[role];
    if (!tpl) return null;
    const on = (p: Permission | undefined, k: 'canCreate' | 'canRead' | 'canUpdate' | 'canDelete') => (p?.[k] ? '✓' : '—');
    return (
      <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3">
        <p className="text-xs font-bold text-stone-700 mb-1">Role default preview — {role.replace(/_/g, ' ')}</p>
        <p className="text-[11px] text-stone-500 mb-2">ADMIN full · MANAGER full + team/settings read-only · SALES leads/quotes + docs · ENGINEER survey/install + docs · CUSTOMER notifications</p>
        <div className="max-h-44 overflow-y-auto rounded border bg-card">
          <table className="w-full text-[11px]">
            <thead><tr className="bg-stone-50 border-b"><th className="text-left p-1.5 font-semibold">Module</th><th className="w-8">C</th><th className="w-8">R</th><th className="w-8">U</th><th className="w-8">D</th></tr></thead>
            <tbody>
              {tpl.filter((p) => !HIDDEN_MODULES.has(String(p.module))).map((p) => (
                <tr key={String(p.module)} className="border-b last:border-0">
                  <td className="p-1.5 font-medium capitalize">{String(p.module).replace(/_/g, ' ')}</td>
                  <td className="text-center">{on(p, 'canCreate')}</td>
                  <td className="text-center">{on(p, 'canRead')}</td>
                  <td className="text-center">{on(p, 'canUpdate')}</td>
                  <td className="text-center">{on(p, 'canDelete')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const handleResetToRoleDefaults = async () => {
    if (!editEmployee || resettingPerms) return;
    setResettingPerms(true);
    try {
      await employeesApi.applyRoleDefaults(editEmployee.id);
      const res = await employeesApi.getPermissions(editEmployee.id);
      const data = res.data.data || res.data;
      const perms: Permission[] = Array.isArray(data.permissions) ? data.permissions : [];
      setEditPermissions(withAllModules(perms.length > 0 ? perms : emptyPermissions()));
      toast.success('Permissions reset to role defaults');
    } catch (err: any) {
      if (err?.response?.status === 403) toast.error('Sirf ADMIN reset kar sakta hai.');
      else toast.error(err?.response?.data?.message || 'Failed to reset permissions');
    } finally { setResettingPerms(false); }
  };
  const [superAdminLoading, setSuperAdminLoading] = useState(false);
  const [uploadingDocType, setUploadingDocType] = useState<string | null>(null);

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const [restorePassword, setRestorePassword] = useState('');
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [viewEmployee, setViewEmployee] = useState<Employee | null>(null);
  const [viewPermissions, setViewPermissions] = useState<Permission[]>([]);
  const [showIdCardFor, setShowIdCardFor] = useState<Employee | null>(null);
  const [employeePermissions, setEmployeePermissions] = useState<Record<string, Permission[]>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadingDocTypeRef = useRef<string | null>(null);
  const [addStep, setAddStep] = useState(0);
  const [addFiles, setAddFiles] = useState<Record<string, File | null>>({});
  const [addDocStatus, setAddDocStatus] = useState<Record<string, 'idle' | 'uploading' | 'success' | 'error'>>({});
  const addFileInputRef = useRef<HTMLInputElement>(null);
  const [addPasteTarget, setAddPasteTarget] = useState<string | null>(null);
  const [addCreatedId, setAddCreatedId] = useState<string | null>(null);
  const addCreatePromise = useRef<Promise<string | null> | null>(null);

  const addPreviews = useMemo<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    Object.entries(addFiles).forEach(([k, f]) => { if (f instanceof File) m[k] = URL.createObjectURL(f); });
    return m;
  }, [addFiles]);
  useEffect(() => () => { Object.values(addPreviews).forEach((u) => URL.revokeObjectURL(u as string)); }, [addPreviews]);

  const extractImageFromClipboard = (e: React.ClipboardEvent): File | null => {
    const items = e.clipboardData?.items as DataTransferItem[] | undefined;
    if (!items) return null;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) return file;
      }
    }
    return null;
  };

  useEffect(() => {
    if (!hasPermission('employees', 'read')) {
      toast.error('Access denied');
      navigate('/');
      return;
    }
    let active = true;
    // Every other caller unwraps `.data.regions`; without Array.isArray a
    // `{regions:[...]}` response makes `regions.map` throw and hard-crashes
    // the wizard's region step.
    settingsApi.getRegions().then(r => {
      if (!active) return;
      const raw = r.data?.data?.regions || r.data?.data || r.data;
      setRegions(Array.isArray(raw) ? raw : []);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  const fetchEmployees = async (p = page) => {
    setIsLoading(true);
    try {
      const params: any = { page: p, limit };
      if (statusTab !== 'ALL_ACTIVE') params.status = statusTab;
      if (roleFilter !== 'all') params.role = roleFilter;
      if (searchTerm) params.search = searchTerm;
      const response = await employeesApi.getAll(params);
      const body = response.data;
      const data = body.data?.employees || body.data;
      setEmployees(Array.isArray(data) ? data : []);
      if (body.data?.pagination) {
        setTotalPages(body.data.pagination.totalPages || 1);
        setTotal(body.data.pagination.total || 0);
      }
    } catch { setEmployees([]); } finally { setIsLoading(false); }
  };

  useEffect(() => { fetchEmployees(page); }, [page]);
  // Filter/tab/search badalne par page-1 se turant refetch karo.
  // Sirf setPage(1) kaafi nahi tha — page pehle se 1 ho to ye no-op
  // hota aur fetch effect dobara chalta hi nahi (stale list bug:
  // Terminated/Restored tabs, search aur role filter dead the).
  useEffect(() => { setPage(1); fetchEmployees(1); }, [roleFilter, searchTerm, statusTab]);

  useEffect(() => {
    if (!employees.length) return;
    let cancelled = false;
    (async () => {
      const results = await Promise.allSettled(
        employees.map(async (emp) => {
          try {
            const res = await employeesApi.getPermissions(emp.id);
            const d = res.data.data || res.data;
            const perms: Permission[] = Array.isArray(d.permissions) ? d.permissions : Array.isArray(d) ? d : [];
            return { id: emp.id, perms };
          } catch { return { id: emp.id, perms: [] as Permission[] }; }
        })
      );
      if (cancelled) return;
      const map: Record<string, Permission[]> = {};
      results.forEach(r => { if (r.status === 'fulfilled') map[r.value.id] = r.value.perms; });
      setEmployeePermissions(prev => ({ ...prev, ...map }));
    })();
    return () => { cancelled = true; };
  }, [employees]);

  // Fetch permissions when viewEmployee changes (for View Profile dialog)
  useEffect(() => {
    if (viewEmployee) {
      (async () => {
        try {
          const res = await employeesApi.getPermissions(viewEmployee.id);
          const data = res.data.data || res.data;
          setViewPermissions(Array.isArray(data.permissions) ? data.permissions : []);
        } catch {
          setViewPermissions([]);
        }
      })();
    } else {
      setViewPermissions([]);
    }
  }, [viewEmployee]);

  const togglePerm = (perms: Permission[], module: PermissionModule, action: 'create' | 'read' | 'update' | 'delete'): Permission[] => {
    const key = action === 'create' ? 'canCreate' : action === 'read' ? 'canRead' : action === 'update' ? 'canUpdate' : 'canDelete';
    if (!perms.some(p => p.module === module)) {
      return [...perms, { module, canCreate: false, canRead: false, canUpdate: false, canDelete: false, [key]: true } as Permission];
    }
    return perms.map(p => p.module === module ? { ...p, [key]: !p[key] } : p);
  };

  const ensureEmployeeCreated = async (): Promise<string | null> => {
    if (addCreatedId) return addCreatedId;
    if (addCreatePromise.current) return addCreatePromise.current;
    if (!addData.name || !addData.email || !addData.password || !addData.role) {
      toast.error('Name, Email, Password and Role are required');
      setAddStep(0);
      return null;
    }
    setAddLoading(true);
    const promise = (async (): Promise<string | null> => {
      try {
        const { permissions, isSuperAdmin, regionIds, ...rest } = addData;
        const clean = Object.fromEntries(Object.entries(rest).filter(([_, v]) => v !== ''));
        const payload: any = { ...clean };
        if (addData.regionIds.length) payload.regionIds = addData.regionIds;
        const res = await employeesApi.create(payload);
        const newEmp = res.data.data || res.data;
        const newId = newEmp.id || newEmp._id;
        setAddCreatedId(newId);
        if (newId) {
          // Blank permissions = backend auto-applies the role default set.
          // Only push custom ticks when the admin actually touched them.
          if (addPermsCustomized) {
            try { await employeesApi.updatePermissions(newId, { permissions: addPermissions }); }
            catch { toast.warning('Employee created, but permissions could not be set.'); }
          }
        }
        return newId;
      } catch (err: any) {
        toast.error(err?.response?.data?.message || 'Failed to create employee');
        return null;
      } finally { setAddLoading(false); addCreatePromise.current = null; }
    })();
    addCreatePromise.current = promise;
    return promise;
  };

  const uploadAddDocument = async (type: string, fileOverride?: File): Promise<boolean> => {
    const file = fileOverride || addFiles[type];
    if (!(file instanceof File) || !addCreatedId) return false;
    setAddDocStatus(p => ({ ...p, [type]: 'uploading' }));
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', type);
      await employeesApi.uploadDocument(addCreatedId, type, fd);
      setAddDocStatus(p => ({ ...p, [type]: 'success' }));
      return true;
    } catch {
      setAddDocStatus(p => ({ ...p, [type]: 'error' }));
      return false;
    }
  };

  const handleAddFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const dt = addFileInputRef.current?.dataset.docType;
    const file = e.target.files?.[0];
    if (dt && file) {
      setAddFiles(p => ({ ...p, [dt]: file }));
      const id = await ensureEmployeeCreated();
      if (id) await uploadAddDocument(dt, file);
    }
    if (addFileInputRef.current) addFileInputRef.current.value = '';
  };

  const handleCreate = async () => {
    const id = await ensureEmployeeCreated();
    if (!id) return;
    setAddLoading(true);
    try {
      let uploadFailed = 0;
      for (const [type, file] of Object.entries(addFiles)) {
        if (file instanceof File && addDocStatus[type] !== 'success') {
          const ok = await uploadAddDocument(type, file);
          if (!ok) uploadFailed++;
        }
      }
      if (uploadFailed > 0) {
        toast.warning(`Employee created, but ${uploadFailed} document${uploadFailed > 1 ? 's' : ''} failed to upload.`);
        setAddStep(3);
      } else {
        toast.success('Employee created successfully');
        setIsAddOpen(false);
        setAddStep(0);
        setAddData(addFormDefaults);
        setAddPermissions(emptyPermissions());
        setAddPermsCustomized(false);
        setAddFiles({});
        setAddDocStatus({});
        setAddPasteTarget(null);
        setAddCreatedId(null);
        fetchEmployees(1);
        setPage(1);
      }
    } finally { setAddLoading(false); }
  };

  const handleUpdate = async () => {
    if (!editEmployee) return;
    setEditLoading(true);
    try {
      const { regionIds, ...rest } = editData;
      const clean = Object.fromEntries(Object.entries(rest).filter(([_, v]) => v !== ''));
      const payload: any = { ...clean };
      // Always send: omitting it when empty made "unassign from all regions"
      // a silent no-op, so regions could never be cleared.
      payload.regionIds = editData.regionIds;
      if (editPassword) payload.password = editPassword;
      await employeesApi.update(editEmployee.id, payload);
      if (editPermsLoaded) {
        await employeesApi.updatePermissions(editEmployee.id, { permissions: editPermissions });
      } else if (editPermsLoadedError) {
        toast.warning('Permissions could not be loaded, so they were left unchanged.');
      }
      toast.success('Employee updated successfully');
      setEditEmployee(null);
      setEditPassword('');
      fetchEmployees(page);
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Failed to update employee'); }
    finally { setEditLoading(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleteLoading(true);
    try {
      await employeesApi.delete(deleteId);
      toast.success('Employee terminated successfully');
      setDeleteId(null);
      fetchEmployees(page);
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Failed to terminate employee'); }
    finally { setDeleteLoading(false); }
  };

  const handleRestore = async () => {
    if (!restoreId) return;
    setRestoreLoading(true);
    try {
      const data = restorePassword ? { password: restorePassword } : {};
      await employeesApi.restore(restoreId, data);
      toast.success('Employee restored successfully');
      setRestoreId(null);
      setRestorePassword('');
      fetchEmployees(page);
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Failed to restore employee'); }
    finally { setRestoreLoading(false); }
  };

  const handleActivate = async (id: string) => {
    try {
      await employeesApi.activate(id);
      toast.success('Employee activated successfully');
      fetchEmployees(page);
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Failed to activate employee'); }
  };

  const [superAdminConfirm, setSuperAdminConfirm] = useState(false);

  const handleSetSuperAdmin = async () => {
    if (!editEmployee) return;
    setSuperAdminLoading(true);
    try {
      await employeesApi.setSuperAdmin(editEmployee.id);
      toast.success(`${editEmployee.name} is now a Super Admin`);
      setEditIsSuperAdmin(true);
      setEditPermissions(allPermissions());
      fetchEmployees(page);
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Failed to set Super Admin'); }
    finally { setSuperAdminLoading(false); }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: string) => {
    if (!editEmployee || !e.target.files?.length) return;
    setUploadingDocType(type);
    const file = e.target.files[0];
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);
    try {
      const res = await employeesApi.uploadDocument(editEmployee.id, type, formData);
      const url = res.data.data?.url || res.data.url || res.data.data;
      // Functional update: spreading the render-closure `editEmployee` dropped
      // a field written by a sibling upload that resolved first.
      setEditEmployee((prev: any) => ({ ...prev, [type === 'profile_pic' ? 'profilePic' : type === 'aadhar_front' ? 'aadharFront' : type === 'aadhar_back' ? 'aadharBack' : type === 'pan_card' ? 'panCard' : 'consentLetter']: url }));
      toast.success('Document uploaded successfully');
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Upload failed'); }
    finally { setUploadingDocType(null); uploadingDocTypeRef.current = null; if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const openEdit = async (emp: Employee) => {
    setEditEmployee(emp);
    setEditStep(0);
    setEditPassword('');
    setEditData({
      name: emp.name, phone: emp.phone || '', role: emp.role, isActive: emp.isActive,
      regionIds: emp.regions?.map(r => r.id) || [],
      joiningDate: toDateInputValue((emp as any).joiningDate) || '', salary: (emp as any).salary || '',
      bankName: (emp as any).bankName || '', bankBranch: (emp as any).bankBranch || '',
      bankAccountNumber: (emp as any).bankAccountNumber || '', bankIfscCode: (emp as any).bankIfscCode || '',
      beneficiaryName: (emp as any).beneficiaryName || '',
    });
    setEditPermsLoading(true);
    setEditPermsLoaded(false);
    setEditPermsLoadedError(false);
    try {
      const res = await employeesApi.getPermissions(emp.id);
      const data = res.data.data || res.data;
      const existingPerms: Permission[] = Array.isArray(data.permissions) ? data.permissions : [];
      // Start from the SERVER rows, not from `emptyPermissions()` (17 modules).
      // Building the merge from the checklist threw away every module the
      // backend knows but MODULES omits, and handleUpdate PUTs that set back —
      // so saving an unrelated field silently revoked those permissions.
      const merged = withAllModules(existingPerms);
      setEditPermissions(merged);
      setEditIsSuperAdmin(!!data.isSuperAdmin);
      setEditPermsLoaded(true);
    } catch {
      // Do NOT fall back to an all-false grid: handleUpdate would PUT that and
      // strip every permission on a transient 403/timeout.
      setEditPermsLoadedError(true);
      setEditIsSuperAdmin(false);
    }
    finally { setEditPermsLoading(false); }
  };

  const getPermSummary = (employee: any): string => {
    if (employee.isSuperAdmin) return '🛡️ Super Admin';
    const perms: Permission[] = employee.permissions || employeePermissions[employee.id] || [];
    if (!perms.length) return 'No permissions';
    // Show max 3 modules for symmetry, cap length with truncate class in UI
    return perms.slice(0, 3).map(p => {
      const actions: string[] = [];
      if (p.canCreate) actions.push('C');
      if (p.canRead) actions.push('R');
      if (p.canUpdate) actions.push('U');
      if (p.canDelete) actions.push('D');
      return `${p.module}: ${actions.join('')}`;
    }).join(', ') + (perms.length > 3 ? ' ...' : '');
  };

  const docTypeLabel: Record<string, string> = {
    profile_pic: 'Profile Pic', aadhar_front: 'Aadhar Front', aadhar_back: 'Aadhar Back',
    pan_card: 'Pan Card', consent_letter: 'Consent Letter',
  };
  const docFields: { type: string; key: string; accept: string }[] = [
    { type: 'profile_pic', key: 'profilePic', accept: 'image/*' },
    { type: 'aadhar_front', key: 'aadharFront', accept: 'image/*,application/pdf' },
    { type: 'aadhar_back', key: 'aadharBack', accept: 'image/*,application/pdf' },
    { type: 'pan_card', key: 'panCard', accept: 'image/*,application/pdf' },
    { type: 'consent_letter', key: 'consentLetter', accept: 'image/*,application/pdf' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Employee Management</h1>
          <p className="text-stone-500">{STATUS_TABS.find(t => t.value === statusTab)?.label || ''} employees: {total}</p>
        </div>
        {statusTab !== 'TERMINATED' && hasPermission('employees', 'create') && <Button className="bg-orange-600 hover:bg-orange-700 text-white" onClick={() => setIsAddOpen(true)}>
          <Plus size={18} className="mr-2" /> Add Employee
        </Button>}
      </div>

      <Tabs value={statusTab} onValueChange={v => { setStatusTab(v); setPage(1); }}>
        <TabsList className="flex-wrap">
          {STATUS_TABS.map(t => <TabsTrigger key={t.value} value={t.value}>{t.icon} {t.label}</TabsTrigger>)}
        </TabsList>
      </Tabs>

      <Card className="border-stone-200 shadow-sm">
        <CardHeader className="p-4 border-b border-stone-100">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
              <Input placeholder="Search by name, email or phone..." className="pl-10 h-10 border-stone-200" value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setPage(1); }} />
            </div>
            <Select value={roleFilter} onValueChange={v => { setRoleFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[180px] h-10 border-stone-200"><SelectValue placeholder="All Roles" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                {ROLE_OPTIONS.map(r => <SelectItem key={r} value={r}>{r.replace(/_/g, ' ')}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-stone-50">
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="min-w-[180px]">Permissions</TableHead>
                <TableHead>Joining</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="h-64 text-center"><Loader2 size={48} className="mx-auto mb-4 animate-spin text-stone-300" /><p className="text-stone-400">Loading...</p></TableCell></TableRow>
              ) : employees.length > 0 ? (
                employees.map((emp) => (
                  <TableRow key={emp.id} className="hover:bg-stone-50">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center font-bold text-stone-600 text-sm overflow-hidden">
                          {(emp as any).profilePic ? <AppImage src={(emp as any).profilePic} className="w-full h-full object-cover" alt="" /> : emp.name.charAt(0)}
                        </div>
                        <span className="font-medium text-stone-900 truncate max-w-[150px]">{emp.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-stone-600 text-sm">{emp.email}</TableCell>
                    <TableCell><Badge className={cn("font-medium text-xs", roleBadgeClass[emp.role] || 'bg-stone-100 text-stone-700')}>{emp.role.replace('_', ' ')}</Badge></TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1 max-w-[200px]">
                        {(emp as any).isSuperAdmin ? (
                          <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-[10px] flex items-center gap-1"><ShieldCheck size={10} /> Super Admin</Badge>
                        ) : (
                          <span className="truncate text-[10px] text-stone-500 leading-tight">{getPermSummary(emp)}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-stone-500">{(emp as any).joiningDate ? new Date((emp as any).joiningDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</TableCell>
                    <TableCell>
                      {(() => {
                        const st = (emp as any).status || (emp.isActive ? 'ACTIVE' : 'TERMINATED');
                        if (st === 'ACTIVE') return <Badge className="bg-green-100 text-green-700 text-xs">ACTIVE</Badge>;
                        if (st === 'RESTORED') return <Badge className="bg-orange-100 text-orange-700 text-xs">RESTORED</Badge>;
                        return <Badge className="bg-red-100 text-red-700 text-xs">TERMINATED</Badge>;
                      })()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {(() => {
                          const st = (emp as any).status || (emp.isActive ? 'ACTIVE' : 'TERMINATED');
                          if (st === 'ACTIVE') return (
                            <>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-stone-500 hover:text-green-600" onClick={() => setViewEmployee(emp)} title="View Profile"><Eye size={15} /></Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-stone-500 hover:text-primary" onClick={() => setShowIdCardFor(emp)} title="ID Card"><Download size={14} /></Button>
                              {hasPermission('employees', 'update') && <Button variant="ghost" size="icon" className="h-8 w-8 text-stone-500 hover:text-blue-600" onClick={() => openEdit(emp)} title="Edit"><Edit size={15} /></Button>}
                              {hasPermission('employees', 'delete') && <Button variant="ghost" size="icon" className="h-8 w-8 text-stone-500 hover:text-red-600" onClick={() => setDeleteId(emp.id)} title="Terminate"><Trash2 size={15} /></Button>}
                            </>
                          );
                          if (st === 'RESTORED') return (
                            <>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-stone-500 hover:text-green-600" onClick={() => setViewEmployee(emp)} title="View Profile"><Eye size={15} /></Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-stone-500 hover:text-primary" onClick={() => setShowIdCardFor(emp)} title="ID Card"><Download size={14} /></Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-stone-500 hover:text-blue-600" onClick={() => openEdit(emp)} title="Edit"><Edit size={15} /></Button>
                              <Button variant="outline" size="sm" className="h-8 text-green-600 border-green-200 hover:bg-green-50" onClick={() => handleActivate(emp.id)}>
                                Activate
                              </Button>
                            </>
                          );
                          return hasPermission('employees', 'update') ? (
                            <div className="flex items-center justify-end gap-1">
                              {/* Deactivated (pause) rows: backend Restore sirf terminated
                                  ko accept karta hai ("not terminated" 400) — unpause
                                  Edit switch se hota hai, isliye Edit bhi dikhao. */}
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-stone-500 hover:text-blue-600" onClick={() => openEdit(emp)} title="Edit"><Edit size={15} /></Button>
                              <Button variant="outline" size="sm" className="h-8 text-orange-600 border-orange-200 hover:bg-orange-50" onClick={() => { setRestoreId(emp.id); setRestorePassword(''); }}>
                                <RotateCcw size={14} className="mr-1" /> Restore
                              </Button>
                            </div>
                          ) : null;
                        })()}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow><TableCell colSpan={7} className="h-64 text-center text-stone-400">No employees found</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-stone-100">
            <span className="text-sm text-stone-500">Page {page} of {totalPages} ({total} total)</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}><ChevronLeft size={16} className="mr-1" /> Prev</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next <ChevronRight size={16} className="ml-1" /></Button>
            </div>
          </div>
        )}
      </Card>

      {/* Create Modal - Full Screen Multi-Step */}
        <Dialog open={isAddOpen} onOpenChange={o => { if (!o) { setIsAddOpen(false); setAddStep(0); setAddData(addFormDefaults); setAddPermissions(emptyPermissions()); setAddFiles({}); setAddDocStatus({}); setAddPasteTarget(null); setAddCreatedId(null); addCreatePromise.current = null; } }}>
        <DialogContent className="fixed inset-0 z-50 flex flex-col bg-popover rounded-none p-0 translate-x-0 translate-y-0 top-0 left-0" showCloseButton={false} preventOutsideClick>
          <div className="flex items-center justify-between p-4 border-b shrink-0">
            <div className="flex items-center gap-3">
              <DialogTitle className="text-xl font-bold">Add Employee</DialogTitle>
              <button type="button" onClick={() => { setIsAddOpen(false); setAddStep(0); setAddData(addFormDefaults); setAddPermissions(emptyPermissions()); setAddFiles({}); setAddDocStatus({}); setAddPasteTarget(null); setAddCreatedId(null); addCreatePromise.current = null; }} className="p-1.5 rounded-md hover:bg-stone-100 text-stone-400 hover:text-stone-700"><X size={18} /></button>
            </div>
            <div className="flex items-center gap-2">
              {[0,1,2,3,4,5].map(i => (
                <div key={i} className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  addStep === i ? 'bg-orange-600 text-white' : addStep > i ? 'bg-green-500 text-white' : 'bg-stone-200 text-stone-500'
                }`}>{addStep > i ? '✓' : i + 1}</div>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            <form id="addEmployeeForm" onSubmit={e => { e.preventDefault(); handleCreate(); }} className="max-w-3xl mx-auto space-y-5">
              <input ref={addFileInputRef} type="file" className="hidden" accept="image/*,application/pdf" onChange={handleAddFileInputChange} />
              {addStep === 0 && (
                <div className="p-6 bg-stone-50 rounded-lg border space-y-4">
                  <h3 className="text-base font-semibold text-stone-800 flex items-center gap-2"><UserIcon size={16} /> Basic Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5"><Label className="text-sm font-medium">Full Name <span className="text-red-500">*</span></Label><Input value={addData.name} onChange={e => setAddData(p => ({ ...p, name: e.target.value }))} placeholder="Rahul Patel" className="h-11" /></div>
                    <div className="space-y-1.5"><Label className="text-sm font-medium">Email <span className="text-red-500">*</span></Label><Input value={addData.email} onChange={e => setAddData(p => ({ ...p, email: e.target.value }))} type="email" placeholder="rahul@eurosolprime.com" className="h-11" /></div>
                    <div className="space-y-1.5"><Label className="text-sm font-medium">Password <span className="text-red-500">*</span></Label>
                      <div className="relative">
                        <Input value={addData.password} onChange={e => setAddData(p => ({ ...p, password: e.target.value }))} type={showPassword ? 'text' : 'password'} placeholder="Min 6 chars" className="h-11 pr-10" />
                        <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600" onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                      </div>
                    </div>
                    <div className="space-y-1.5"><Label className="text-sm font-medium">Phone</Label><Input value={addData.phone} onChange={e => setAddData(p => ({ ...p, phone: e.target.value }))} placeholder="+91-9876543210" className="h-11" /></div>
                    <div className="space-y-1.5"><Label className="text-sm font-medium">Role <span className="text-red-500">*</span></Label>
                      <Select value={addData.role} onValueChange={v => setAddData(p => ({ ...p, role: v }))}>
                        <SelectTrigger className="h-11"><SelectValue placeholder="Select role" /></SelectTrigger>
                            <SelectContent>{ROLE_OPTIONS.map(r => <SelectItem key={r} value={r}>{r.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}
              {addStep === 1 && (
                <div className="p-6 bg-stone-50 rounded-lg border space-y-4">
                  <h3 className="text-base font-semibold text-stone-800 flex items-center gap-2">₹ Job & Bank Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5"><Label className="text-sm font-medium">Joining Date</Label><Input type="date" value={addData.joiningDate} onChange={e => setAddData(p => ({ ...p, joiningDate: e.target.value }))} className="h-11" /></div>
                    <div className="space-y-1.5"><Label className="text-sm font-medium">Salary (₹)</Label><Input type="number" value={addData.salary} onChange={e => setAddData(p => ({ ...p, salary: e.target.value }))} placeholder="25000" className="h-11" /></div>
                    <div className="space-y-1.5"><Label className="text-sm font-medium">Bank Name</Label><Input value={addData.bankName} onChange={e => setAddData(p => ({ ...p, bankName: e.target.value }))} placeholder="SBI" className="h-11" /></div>
                    <div className="space-y-1.5"><Label className="text-sm font-medium">Bank Branch</Label><Input value={addData.bankBranch} onChange={e => setAddData(p => ({ ...p, bankBranch: e.target.value }))} placeholder="Main Branch" className="h-11" /></div>
                    <div className="space-y-1.5"><Label className="text-sm font-medium">Account No.</Label><Input value={addData.bankAccountNumber} onChange={e => setAddData(p => ({ ...p, bankAccountNumber: e.target.value }))} placeholder="123456789" className="h-11" /></div>
                    <div className="space-y-1.5"><Label className="text-sm font-medium">IFSC Code</Label><Input value={addData.bankIfscCode} onChange={e => setAddData(p => ({ ...p, bankIfscCode: e.target.value }))} placeholder="SBIN000123" className="h-11" /></div>
                    <div className="space-y-1.5"><Label className="text-sm font-medium">Beneficiary Name</Label><Input value={addData.beneficiaryName} onChange={e => setAddData(p => ({ ...p, beneficiaryName: e.target.value }))} placeholder="Rahul Patel" className="h-11" /></div>
                  </div>
                </div>
              )}
              {addStep === 2 && (
                <div className="p-6 bg-stone-50 rounded-lg border space-y-4">
                  <h3 className="text-base font-semibold text-stone-800 flex items-center gap-2"><MapPin size={16} /> Regions</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-[240px] overflow-y-auto border rounded-md p-3">
                    {regions.map(r => (
                      <label key={r.id} className="flex items-center gap-2 text-sm cursor-pointer p-1 hover:bg-stone-100 rounded">
                        <Checkbox checked={addData.regionIds.includes(r.id)} onCheckedChange={ch => setAddData(p => ({ ...p, regionIds: ch ? [...p.regionIds, r.id] : p.regionIds.filter(x => x !== r.id) }))} />
                        {r.name}
                      </label>
                    ))}
                    {!regions.length && <span className="text-xs text-stone-400 col-span-3">No regions available</span>}
                  </div>
                </div>
              )}
              {addStep === 3 && (
                <div
                  className="p-6 bg-stone-50 rounded-lg border space-y-4"
                  onPaste={e => {
                    if (!addPasteTarget) return;
                    const f = extractImageFromClipboard(e);
                    if (f) {
                      e.preventDefault();
                      setAddFiles(p => ({ ...p, [addPasteTarget]: f }));
                      const target = addPasteTarget;
                      ensureEmployeeCreated().then(id => { if (id) uploadAddDocument(target, f); });
                    }
                  }}
                >
                  <h3 className="text-base font-semibold text-stone-800 flex items-center gap-2"><Upload size={16} /> Documents</h3>
                  <p className="text-xs text-stone-500">Upload or paste images. Click a card to select it as the paste target, then press <kbd className="px-1 bg-stone-200 rounded">Ctrl/⌘ + V</kbd> to paste a screenshot.</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {docFields.map(df => {
                      const file = addFiles[df.type];
                      const preview = addPreviews[df.type];
                      const status = addDocStatus[df.type] || 'idle';
                      return (
                        <div
                          key={df.key}
                          tabIndex={0}
                          onClick={() => setAddPasteTarget(df.type)}
                          className={`border rounded-lg p-3 space-y-2 bg-card outline-none transition cursor-pointer focus:ring-2 ${addPasteTarget === df.type ? 'border-orange-500 ring-2 ring-orange-300' : 'border-stone-200'}`}
                        >
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-medium text-stone-600">{docTypeLabel[df.type]}</Label>
                            {status === 'uploading' && <span className="inline-flex items-center gap-1 text-[10px] text-blue-600"><Loader2 size={10} className="animate-spin" /> Uploading…</span>}
                            {status === 'success' && <span className="inline-flex items-center gap-1 text-[10px] text-green-600"><CheckCircle2 size={10} /> Uploaded</span>}
                            {status === 'error' && <span className="inline-flex items-center gap-1 text-[10px] text-red-600"><AlertCircle size={10} /> Failed</span>}
                          </div>
                          {file ? (
                            <div className="space-y-2">
                              {preview ? (
                                <img src={preview} alt={df.type} className="w-full h-32 object-cover rounded-md border bg-white" />
                              ) : (
                                <div className="text-xs text-stone-700 truncate bg-stone-100 rounded p-2">{file.name}</div>
                              )}
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-stone-500 truncate flex-1">{file.name}</span>
                                <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600" onClick={() => { setAddFiles(p => ({ ...p, [df.type]: null })); setAddDocStatus(p => ({ ...p, [df.type]: 'idle' })); }}>Remove</Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <Button size="sm" variant="outline" className="w-full h-8 text-xs" onClick={() => { addFileInputRef.current!.dataset.docType = df.type; addFileInputRef.current!.click(); }}>
                                <Upload size={12} className="mr-1" /> Select File
                              </Button>
                              {addPasteTarget === df.type
                                ? <p className="text-[10px] text-orange-600">Paste target selected — press Ctrl/⌘ + V</p>
                                : <p className="text-[10px] text-stone-400">Click to set as paste target</p>}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {addStep === 4 && (
                <div className="space-y-3 border p-6 bg-stone-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-stone-800 flex items-center gap-2"><Shield size={16} /> Permissions</h3>
                    <div className="flex items-center gap-2"><Label className="text-xs text-stone-500">All Access</Label><Switch checked={hasAllAccess(addPermissions)} onCheckedChange={v => { setAddPermsCustomized(true); setAddPermissions(v ? allPermissions() : emptyPermissions()); }} /></div>
                  </div>
                  <p className="text-xs text-stone-500">Blank chhodo = role default auto-lagega{addData.role ? ` (${addData.role.replace(/_/g, ' ')})` : ''}. Custom tick karte hi wahi lagega.</p>
                  {addData.role && renderRoleDefaults(addData.role)}
                  {hasAllAccess(addPermissions) ? (
                    <div className="p-4 bg-purple-50 rounded-lg border border-purple-200 text-sm text-purple-700 flex items-center gap-2"><ShieldCheck size={18} /> All permissions enabled for all modules.</div>
                  ) : (
                    <div className="overflow-x-auto border rounded-lg bg-card">
                      <table className="w-full text-xs">
                        <thead><tr className="bg-stone-50 border-b"><th className="text-left p-2 font-semibold text-stone-700 min-w-[120px] truncate">Module</th>{ACTIONS.map(a => <th key={a} className="text-center p-2 font-semibold text-stone-700 w-[60px]">{ACTION_LABELS[a]}</th>)}</tr></thead>
                        <tbody>{permModules.map(mod => (
                          <tr key={mod} className="border-b last:border-0 hover:bg-stone-50/50">
                            <td className="p-2 font-medium text-stone-700 capitalize truncate whitespace-nowrap">{mod.replace(/_/g, ' ')}</td>
                            {ACTIONS.map(action => {
                              const checked = addPermissions.find(p => p.module === mod)?.[action === 'create' ? 'canCreate' : action === 'read' ? 'canRead' : action === 'update' ? 'canUpdate' : 'canDelete'];
                              return <td key={action} className="text-center p-2"><input type="checkbox" checked={!!checked} onChange={() => { setAddPermsCustomized(true); setAddPermissions(togglePerm(addPermissions, mod as PermissionModule, action)); }} className="accent-orange-600 w-3.5 h-3.5" /></td>;
                            })}
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
              {addStep === 5 && (
                <div className="space-y-5">
                  <h3 className="text-lg font-bold text-stone-900 flex items-center gap-2"><Eye size={18} /> Preview Employee</h3>
                  <div className="border rounded-lg overflow-hidden">
                    {[
                      { label: 'Basic Info', fields: [
                        ['Name', addData.name], ['Email', addData.email], ['Phone', addData.phone], ['Role', addData.role],
                      ]},
                      { label: 'Job & Bank', fields: [
                        ['Joining Date', addData.joiningDate], ['Salary', addData.salary ? `₹${Number(addData.salary).toLocaleString()}` : ''],
                        ['Bank', addData.bankName], ['Branch', addData.bankBranch],
                        ['Account No.', addData.bankAccountNumber], ['IFSC', addData.bankIfscCode],
                        ['Beneficiary', addData.beneficiaryName],
                      ]},
                      { label: 'Regions', fields: [
                        ['Regions', addData.regionIds.map(id => regions.find(r => r.id === id)?.name).filter(Boolean).join(', ') || 'None'],
                      ]},
                      { label: 'Documents', fields: [
                        ...docFields.map(df => {
                          const st = addDocStatus[df.type];
                          const marker = st === 'success' ? ' ✓ Uploaded' : st === 'error' ? ' ✗ Failed' : st === 'uploading' ? ' … Uploading' : '';
                          return [docTypeLabel[df.type] + marker, addFiles[df.type]?.name || 'Not selected'] as [string, string];
                        }),
                      ]},
                      { label: 'Permissions', fields: [
                        ['Access', !addPermsCustomized ? `Role default (auto${addData.role ? ` — ${addData.role.replace(/_/g, ' ')}` : ''})` : (hasAllAccess(addPermissions) ? 'All Access (All modules)' : `${addPermissions.filter(p => p.canRead).length}/${permModules.length} modules with read access`)],
                      ]},
                    ].map(section => {
                      const hasFields = section.fields.some(([, v]) => v && v !== 'Not selected');
                      if (!hasFields) return null;
                      return (
                        <div key={section.label} className="border-b last:border-0">
                          <div className="px-5 py-2.5 bg-stone-50 text-sm font-semibold text-stone-700">{section.label}</div>
                          <div className="px-5 py-2 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                            {section.fields.map(([label, val]) => val ? (
                              <div key={label} className="flex justify-between border-b border-stone-100 py-1">
                                <span className="text-stone-500">{label}</span>
                                <span className="font-medium text-stone-900 truncate max-w-[200px]">{val}</span>
                              </div>
                            ) : null)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </form>
          </div>
          <div className="flex items-center justify-between p-4 border-t shrink-0 bg-card">
            <Button type="button" variant="outline" onClick={() => { if (addStep === 0) setIsAddOpen(false); else setAddStep(s => s - 1); }}>
              {addStep === 0 ? 'Cancel' : 'Previous'}
            </Button>
            <div className="flex gap-2">
              {addStep < 5 ? (
                <Button type="button" className="bg-orange-600 hover:bg-orange-700 text-white" onClick={() => {
                  if (addStep === 0 && !addData.name) { toast.error('Name is required'); return; }
                  if (addStep === 0 && !addData.email) { toast.error('Email is required'); return; }
                  if (addStep === 0 && !addData.password) { toast.error('Password is required'); return; }
                  if (addStep === 0 && !addData.role) { toast.error('Role is required'); return; }
                  setAddStep(s => s + 1);
                }}>
                  Next
                </Button>
              ) : (
                <Button type="submit" form="addEmployeeForm" className="bg-orange-600 hover:bg-orange-700 text-white" disabled={addLoading}>
                  {addLoading ? <Loader2 size={16} className="mr-2 animate-spin" /> : null}
                  Create Employee
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Modal - Full Screen Multi-Step */}
      <Dialog open={!!editEmployee} onOpenChange={o => { if (!o) { setEditEmployee(null); setEditPassword(''); setEditStep(0); } }}>
        <DialogContent className="fixed inset-0 z-50 flex flex-col bg-popover rounded-none p-0 translate-x-0 translate-y-0 top-0 left-0" showCloseButton={false} preventOutsideClick>
          {editPermsLoading ? (
            <div className="flex items-center justify-center py-12 flex-1"><Loader2 size={32} className="animate-spin text-stone-300" /></div>
          ) : (
            <>
              <div className="flex items-center justify-between p-4 border-b shrink-0">
                <div className="flex items-center gap-3">
                  <DialogTitle className="text-xl font-bold">Edit Employee</DialogTitle>
                  <button type="button" onClick={() => { setEditEmployee(null); setEditPassword(''); setEditStep(0); }} className="p-1.5 rounded-md hover:bg-stone-100 text-stone-400 hover:text-stone-700"><X size={18} /></button>
                </div>
                <div className="flex items-center gap-2">
                  {[0,1,2,3,4,5].map(i => (
                    <div key={i} className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                      editStep === i ? 'bg-orange-600 text-white' : editStep > i ? 'bg-green-500 text-white' : 'bg-stone-200 text-stone-500'
                    }`}>{editStep > i ? '✓' : i + 1}</div>
                  ))}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                <form id="editEmployeeForm" onSubmit={e => { e.preventDefault(); handleUpdate(); }} className="max-w-3xl mx-auto space-y-5">
                  <input ref={fileInputRef} type="file" className="hidden" accept="image/*,application/pdf" onChange={e => { const dt = uploadingDocTypeRef.current; if (dt) handleUpload(e, dt); }} />
                  {editStep === 0 && (
                    <div className="p-6 bg-stone-50 rounded-lg border space-y-4">
                      <h3 className="text-base font-semibold text-stone-800 flex items-center gap-2"><UserIcon size={16} /> Basic Information</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5"><Label className="text-sm font-medium">Full Name</Label><Input value={editData.name} onChange={e => setEditData(p => ({ ...p, name: e.target.value }))} className="h-11" /></div>
                        <div className="space-y-1.5"><Label className="text-sm font-medium">Phone</Label><Input value={editData.phone} onChange={e => setEditData(p => ({ ...p, phone: e.target.value }))} className="h-11" /></div>
                        <div className="space-y-1.5"><Label className="text-sm font-medium">New Password <span className="text-[10px] text-stone-400 font-normal">(blank = no change)</span></Label>
                          <div className="relative">
                            <Input value={editPassword} onChange={e => setEditPassword(e.target.value)} type={showEditPassword ? 'text' : 'password'} placeholder="Leave blank" className="h-11 pr-10" />
                            <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600" onClick={() => setShowEditPassword(!showEditPassword)}>{showEditPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                          </div>
                        </div>
                        <div className="space-y-1.5"><Label className="text-sm font-medium">Role</Label>
                          <Select value={editData.role} onValueChange={v => setEditData(p => ({ ...p, role: v }))}>
                            <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                        <SelectContent>{ROLE_OPTIONS.map(r => <SelectItem key={r} value={r}>{r.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5 flex items-end pb-2">
                          <div className="flex items-center gap-3"><Label className="mb-0">Active</Label><Switch checked={editData.isActive} onCheckedChange={v => setEditData(p => ({ ...p, isActive: v }))} /></div>
                        </div>
                      </div>
                    </div>
                  )}
                  {editStep === 1 && (
                    <div className="p-6 bg-stone-50 rounded-lg border space-y-4">
                      <h3 className="text-base font-semibold text-stone-800 flex items-center gap-2">₹ Job & Bank Details</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5"><Label className="text-sm font-medium">Joining Date</Label><Input type="date" value={editData.joiningDate} onChange={e => setEditData(p => ({ ...p, joiningDate: e.target.value }))} className="h-11" /></div>
                        <div className="space-y-1.5"><Label className="text-sm font-medium">Salary (₹)</Label><Input type="number" value={editData.salary} onChange={e => setEditData(p => ({ ...p, salary: e.target.value }))} className="h-11" /></div>
                        <div className="space-y-1.5"><Label className="text-sm font-medium">Bank Name</Label><Input value={editData.bankName} onChange={e => setEditData(p => ({ ...p, bankName: e.target.value }))} className="h-11" /></div>
                        <div className="space-y-1.5"><Label className="text-sm font-medium">Bank Branch</Label><Input value={editData.bankBranch} onChange={e => setEditData(p => ({ ...p, bankBranch: e.target.value }))} className="h-11" /></div>
                        <div className="space-y-1.5"><Label className="text-sm font-medium">Account No.</Label><Input value={editData.bankAccountNumber} onChange={e => setEditData(p => ({ ...p, bankAccountNumber: e.target.value }))} className="h-11" /></div>
                        <div className="space-y-1.5"><Label className="text-sm font-medium">IFSC Code</Label><Input value={editData.bankIfscCode} onChange={e => setEditData(p => ({ ...p, bankIfscCode: e.target.value }))} className="h-11" /></div>
                        <div className="space-y-1.5"><Label className="text-sm font-medium">Beneficiary Name</Label><Input value={editData.beneficiaryName} onChange={e => setEditData(p => ({ ...p, beneficiaryName: e.target.value }))} className="h-11" /></div>
                      </div>
                    </div>
                  )}
                  {editStep === 2 && (
                    <div className="p-6 bg-stone-50 rounded-lg border space-y-4">
                      <h3 className="text-base font-semibold text-stone-800 flex items-center gap-2"><MapPin size={16} /> Regions</h3>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-[240px] overflow-y-auto border rounded-md p-3">
                        {regions.map(r => (
                          <label key={r.id} className="flex items-center gap-2 text-sm cursor-pointer p-1 hover:bg-stone-100 rounded">
                            <Checkbox checked={editData.regionIds.includes(r.id)} onCheckedChange={ch => setEditData(p => ({ ...p, regionIds: ch ? [...p.regionIds, r.id] : p.regionIds.filter(x => x !== r.id) }))} />
                            {r.name}
                          </label>
                        ))}
                        {!regions.length && <span className="text-xs text-stone-400 col-span-3">No regions</span>}
                      </div>
                    </div>
                  )}
                  {editStep === 3 && (
                    <div className="p-6 bg-stone-50 rounded-lg border space-y-4">
                      <h3 className="text-base font-semibold text-stone-800 flex items-center gap-2"><Upload size={16} /> Documents</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {docFields.map(df => {
                          const url = (editEmployee as any)?.[df.key];
                          return (
                            <div key={df.key} className="border rounded-lg p-3 space-y-2 bg-card">
                              <Label className="text-xs font-medium text-stone-600">{docTypeLabel[df.type]}</Label>
                              {url ? (
                                <div>
                                  <div className="flex items-center gap-2 mb-2">
                                    <a href={resolveImageUrl(url)} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 underline flex items-center gap-1"><Download size={12} /> View</a>
                                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { uploadingDocTypeRef.current = df.type; setUploadingDocType(df.type); fileInputRef.current?.click(); }} disabled={uploadingDocType === df.type}>
                                      {uploadingDocType === df.type ? <Loader2 size={12} className="animate-spin" /> : 'Replace'}
                                    </Button>
                                  </div>
                                  {df.type === 'profile_pic' || url.match(/\.(jpe?g|png|gif|webp)/i) ? (
                                    <AppImage src={url} alt="" className="w-full h-32 object-contain rounded border bg-stone-100" />
                                  ) : (
                                    <div className="w-full h-20 flex items-center justify-center bg-stone-50 rounded border text-xs text-stone-400">PDF document</div>
                                  )}
                                </div>
                              ) : (
                                <Button size="sm" variant="outline" className="w-full h-8 text-xs" onClick={() => { uploadingDocTypeRef.current = df.type; setUploadingDocType(df.type); fileInputRef.current?.click(); }} disabled={uploadingDocType === df.type}>
                                  {uploadingDocType === df.type ? <Loader2 size={12} className="mr-1 animate-spin" /> : <Upload size={12} className="mr-1" />}
                                  Upload
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {editStep === 4 && (
                    <div className="space-y-3 border p-6 bg-stone-50 rounded-lg">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-stone-800 flex items-center gap-2"><Shield size={16} /> Permissions</h3>
                        <div className="flex items-center gap-2">
                          {editEmployee && (
                            <Button size="sm" variant="outline" className="h-8 text-xs border-blue-200 text-blue-700 hover:bg-blue-50" onClick={handleResetToRoleDefaults} disabled={resettingPerms}>
                              {resettingPerms ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <RotateCcw size={13} className="mr-1.5" />}
                              Reset to role defaults
                            </Button>
                          )}
                          <Label className="text-xs text-stone-500">All Access</Label><Switch checked={hasAllAccess(editPermissions)} onCheckedChange={v => setEditPermissions(v ? allPermissions() : emptyPermissions())} />
                        </div>
                      </div>
                      {editEmployee && editData.role && editData.role !== editEmployee.role && (
                        <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-800 flex items-center gap-2"><AlertCircle size={15} className="shrink-0" /> Role badalne par backend permissions reset karke role default laga dega.</div>
                      )}
                      {editData.role && renderRoleDefaults(editData.role)}
                      {hasAllAccess(editPermissions) ? (
                        <div className="p-4 bg-purple-50 rounded-lg border border-purple-200 text-sm text-purple-700 flex items-center gap-2"><ShieldCheck size={18} /> All permissions enabled for all modules.</div>
                      ) : (
                        <div className="overflow-x-auto border rounded-lg bg-card">
                          <table className="w-full text-xs">
<thead><tr className="bg-stone-50 border-b"><th className="text-left p-2 font-semibold text-stone-700 min-w-[120px] truncate">Module</th>{ACTIONS.map(a => <th key={a} className="text-center p-2 font-semibold text-stone-700 w-[60px]">{ACTION_LABELS[a]}</th>)}</tr></thead>
                            <tbody>{permModules.map(mod => (
                              <tr key={mod} className="border-b last:border-0 hover:bg-stone-50/50">
<td className="p-2 font-medium text-stone-700 capitalize truncate whitespace-nowrap">{mod.replace(/_/g, ' ')}</td>
                                {ACTIONS.map(action => {
                                  const checked = editPermissions.find(p => p.module === mod)?.[action === 'create' ? 'canCreate' : action === 'read' ? 'canRead' : action === 'update' ? 'canUpdate' : 'canDelete'];
                                  return <td key={action} className="text-center p-2"><input type="checkbox" checked={!!checked} onChange={() => setEditPermissions(togglePerm(editPermissions, mod as PermissionModule, action))} className="accent-orange-600 w-3.5 h-3.5" /></td>;
                                })}
                              </tr>
                            ))}</tbody>
                          </table>
                        </div>
                      )}
                      <div className="flex gap-2 pt-2">
                        {!hasAllAccess(editPermissions) && editEmployee && hasPermission('employees', 'update') && (
                          <Button variant="outline" className="border-purple-200 text-purple-700 hover:bg-purple-50" onClick={() => setSuperAdminConfirm(true)} disabled={superAdminLoading}>
                            {superAdminLoading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <ShieldCheck size={16} className="mr-2" />}
                            Make Super Admin
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                  {editStep === 5 && (
                    <div className="space-y-5">
                      <h3 className="text-lg font-bold text-stone-900 flex items-center gap-2"><Eye size={18} /> Preview</h3>
                      <div className="border rounded-lg overflow-hidden">
                        {[
                          { label: 'Basic Info', fields: [
                            ['Name', editData.name], ['Phone', editData.phone], ['Role', editData.role], ['Active', editData.isActive ? 'Yes' : 'No'],
                          ]},
                          { label: 'Job & Bank', fields: [
                            ['Joining Date', editData.joiningDate], ['Salary', editData.salary ? `₹${Number(editData.salary).toLocaleString()}` : ''],
                            ['Bank', editData.bankName], ['Branch', editData.bankBranch],
                            ['Account No.', editData.bankAccountNumber], ['IFSC', editData.bankIfscCode],
                            ['Beneficiary', editData.beneficiaryName],
                          ]},
                          { label: 'Regions', fields: [
                            ['Regions', editData.regionIds.map(id => regions.find(r => r.id === id)?.name).filter(Boolean).join(', ') || 'None'],
                          ]},
                          { label: 'Permissions', fields: [
                            ['Access', editPermissions.every(p => p.canCreate && p.canRead && p.canUpdate && p.canDelete) ? 'All Access (All modules)' : `${editPermissions.filter(p => p.canRead).length}/${MODULES.length} modules with read access`],
                          ]},
                        ].map(section => {
                          const hasFields = section.fields.some(([, v]) => v);
                          if (!hasFields) return null;
                          return (
                            <div key={section.label} className="border-b last:border-0">
                              <div className="px-5 py-2.5 bg-stone-50 text-sm font-semibold text-stone-700">{section.label}</div>
                              <div className="px-5 py-2 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                                {section.fields.map(([label, val]) => val ? (
                                  <div key={label} className="flex justify-between border-b border-stone-100 py-1">
                                    <span className="text-stone-500">{label}</span>
                                    <span className="font-medium text-stone-900 truncate max-w-[200px]">{val}</span>
                                  </div>
                                ) : null)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </form>
              </div>
              <div className="flex items-center justify-between p-4 border-t shrink-0 bg-card">
                <Button type="button" variant="outline" onClick={() => { if (editStep === 0) { setEditEmployee(null); setEditPassword(''); setEditStep(0); } else setEditStep(s => s - 1); }}>
                  {editStep === 0 ? 'Cancel' : 'Previous'}
                </Button>
                <div className="flex gap-2">
                  {editStep < 5 ? (
                    <Button type="button" className="bg-orange-600 hover:bg-orange-700 text-white" onClick={() => setEditStep(s => s + 1)}>
                      Next
                    </Button>
                  ) : (
                    <Button type="submit" form="editEmployeeForm" className="bg-orange-600 hover:bg-orange-700 text-white" disabled={editLoading || editPermsLoading}>
                      {editLoading ? <Loader2 size={16} className="mr-2 animate-spin" /> : null}
                      Save Employee
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* View Profile Dialog */}
      <Dialog open={!!viewEmployee} onOpenChange={o => { if (!o) setViewEmployee(null); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-xl font-bold flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center font-bold text-stone-600 overflow-hidden">
              {(viewEmployee as any)?.profilePic ? <AppImage src={(viewEmployee as any).profilePic} className="w-full h-full object-cover" alt="" /> : viewEmployee?.name?.charAt(0)}
            </div>
            {viewEmployee?.name}
          </DialogTitle></DialogHeader>
          {viewEmployee && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-stone-500">Email</span><p className="font-medium">{viewEmployee.email}</p></div>
                <div><span className="text-stone-500">Phone</span><p className="font-medium">{viewEmployee.phone || '—'}</p></div>
                <div><span className="text-stone-500">Role</span><p className="font-medium">{viewEmployee.role.replace(/_/g, ' ')}</p></div>
                <div><span className="text-stone-500">Status</span><p className="font-medium">{viewEmployee.isActive ? 'Active' : 'Inactive'}</p></div>
                <div><span className="text-stone-500">Joining Date</span><p className="font-medium">{(viewEmployee as any).joiningDate ? new Date((viewEmployee as any).joiningDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</p></div>
                <div><span className="text-stone-500">Salary</span><p className="font-medium">{(viewEmployee as any).salary ? `₹${Number((viewEmployee as any).salary).toLocaleString()}` : '—'}</p></div>
                {(viewEmployee as any).bankName && <div className="col-span-2"><span className="text-stone-500">Bank</span><p className="font-medium">{(viewEmployee as any).bankName}{(viewEmployee as any).bankBranch ? `, ${(viewEmployee as any).bankBranch}` : ''} {(viewEmployee as any).bankAccountNumber ? `- ${maskBankAccount((viewEmployee as any).bankAccountNumber)}` : ''}</p></div>}
                {(viewEmployee as any).isSuperAdmin && <div className="col-span-2"><Badge className="bg-purple-100 text-purple-700"><ShieldCheck size={12} className="mr-1" /> Super Admin</Badge></div>}
                <div className="col-span-2">
                  <span className="text-stone-500">Assigned Regions</span>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {(() => {
                      const assigned: any[] = (viewEmployee as any).regions || [];
                      if (assigned.length === 0) return <span className="text-xs text-stone-400">No regions assigned</span>;
                      return assigned.map((r: any, i: number) => {
                        const name = typeof r === 'string' ? (regions.find(x => x.id === r)?.name || r) : (r.name || regions.find(x => x.id === r.id)?.name || r.id || '—');
                        return <Badge key={typeof r === 'string' ? r : (r.id || i)} variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 font-medium"><MapPin size={11} className="mr-1" />{name}</Badge>;
                      });
                    })()}
                  </div>
                </div>
              </div>
              <Button variant="outline" className="border-primary text-primary hover:bg-primary hover:text-white gap-2" onClick={() => { setShowIdCardFor(viewEmployee); }}>
                <Download size={14} /> ID Card
              </Button>

              <div className="border-t pt-4">
                <h4 className="text-sm font-semibold text-stone-800 mb-3 flex items-center gap-2"><Upload size={14} /> Documents</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {docFields.map(df => {
                    const url = (viewEmployee as any)?.[df.key];
                    return (
                      <div key={df.key} className="border rounded-lg p-2 bg-stone-50">
                        <Label className="text-[10px] font-medium text-stone-500">{docTypeLabel[df.type]}</Label>
                        {url ? (
                          df.type === 'profile_pic' || url.match(/\.(jpe?g|png|gif|webp)/i) ? (
                            <AppImage src={url} alt="" className="w-full h-24 object-contain mt-1 rounded border bg-card cursor-pointer" onClick={() => window.open(resolveImageUrl(url), '_blank')} />
                          ) : (
                            <a href={resolveImageUrl(url)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-blue-600 underline mt-1"><Download size={12} /> View PDF</a>
                          )
                        ) : (
                          <p className="text-xs text-stone-400 mt-1">Not uploaded</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="text-sm font-semibold text-stone-800 mb-2">Permissions</h4>
                {(viewEmployee as any).isSuperAdmin ? (
                  <Badge className="bg-purple-100 text-purple-700"><ShieldCheck size={12} className="mr-1" /> Super Admin - Full Access</Badge>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {(() => {
                      const perms: Permission[] = (viewPermissions.length > 0 ? viewPermissions : []).filter(p => !HIDDEN_MODULES.has(String(p.module)));
                      return perms.filter(p => p.canRead).length > 0 ? perms.filter(p => p.canRead).map(p => (
                        <Badge key={p.module} variant="outline" className="text-[10px] bg-stone-50">
                          {p.module} {p.canCreate ? '(W)' : '(R)'}{p.canUpdate ? '' : ''}
                        </Badge>
                      )) : <span className="text-xs text-stone-400">No permissions</span>;
                    })()}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete (Terminate) Dialog */}
      <Dialog open={!!deleteId} onOpenChange={o => { if (!o) setDeleteId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Terminate Employee</DialogTitle><DialogDescription>This will mark the employee as TERMINATED. They can be restored later.</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteLoading}>{deleteLoading && <Loader2 size={16} className="mr-2 animate-spin" />}Terminate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore Dialog */}
      <Dialog open={!!restoreId} onOpenChange={o => { if (!o) { setRestoreId(null); setRestorePassword(''); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Restore Employee</DialogTitle><DialogDescription>Reactivate this employee. Optionally set a new password.</DialogDescription></DialogHeader>
          <div className="py-4 space-y-3">
            <Label>New Password <span className="text-[10px] text-stone-400 font-normal">(optional)</span></Label>
            <Input value={restorePassword} onChange={e => setRestorePassword(e.target.value)} type="text" placeholder="Leave blank to keep current" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRestoreId(null); setRestorePassword(''); }}>Cancel</Button>
            <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={handleRestore} disabled={restoreLoading}>
              {restoreLoading && <Loader2 size={16} className="mr-2 animate-spin" />}<RotateCcw size={16} className="mr-1" /> Restore
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {showIdCardFor && (
        <ProfileCard
          employee={{
            name: showIdCardFor.name,
            email: showIdCardFor.email,
            phone: showIdCardFor.phone,
            role: showIdCardFor.role,
            profilePic: (showIdCardFor as any).profilePic,
            joiningDate: (showIdCardFor as any).joiningDate,
            employeeId: showIdCardFor.id,
            isSuperAdmin: (showIdCardFor as any).isSuperAdmin,
          }}
          onClose={() => setShowIdCardFor(null)}
        />
      )}
      <ConfirmDialog
        open={superAdminConfirm}
        onOpenChange={setSuperAdminConfirm}
        title="Promote to Super Admin"
        description={`Are you sure you want to grant ${editEmployee?.name} full Super Admin access? This gives unrestricted access to all modules and data.`}
        onConfirm={() => { setSuperAdminConfirm(false); handleSetSuperAdmin(); }}
        confirmLabel="Promote"
        loading={superAdminLoading}
      />
    </div>
  );
};

export default EmployeeManagement;
