import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Loader2, ScrollText, Plus, Pencil, Trash2, Eye, MapPin } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { auditApi, employeesApi } from '../services/api';
import { useRegion } from '../contexts/RegionContext';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// Read-only audit trail (GET /audit-logs) — ADMIN only, no create/update/delete.
// Attractive timeline: kaun (actor) ne kab kya kiya — action icons + region.
// Region: logs me region nahi hota, actor (employee) ke regions se resolve.
const ACTION_STYLE: Record<string, { icon: any; ring: string; badge: string }> = {
  CREATE: { icon: Plus, ring: 'bg-green-100 text-green-700', badge: 'bg-green-50 text-green-700 border-green-200' },
  UPDATE: { icon: Pencil, ring: 'bg-blue-100 text-blue-700', badge: 'bg-blue-50 text-blue-700 border-blue-200' },
  DELETE: { icon: Trash2, ring: 'bg-red-100 text-red-700', badge: 'bg-red-50 text-red-700 border-red-200' },
  VIEW: { icon: Eye, ring: 'bg-stone-100 text-stone-600', badge: 'bg-stone-50 text-stone-600 border-stone-200' },
};

function timeAgo(iso?: string): string {
  if (!iso) return '—';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

const AuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [employees, setEmployees] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 1 });
  const { regions: allRegions, selectedRegion, setSelectedRegion } = useRegion();

  const fetchLogs = useCallback(async (page = 1) => {
    setIsLoading(true);
    try {
      const res = await auditApi.getAll({ page, limit: 20 });
      const raw = res.data?.data?.logs ?? res.data?.data ?? [];
      setLogs(Array.isArray(raw) ? raw : []);
      const pag = res.data?.data?.pagination || res.data?.pagination;
      if (pag) setPagination({ page: pag.page ?? page, limit: pag.limit ?? 20, total: pag.total ?? 0, pages: pag.totalPages ?? pag.pages ?? 1 });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to fetch audit logs');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchLogs(1); }, [fetchLogs]);
  useEffect(() => {
    employeesApi.getAll({ limit: 200 }).then((r) => {
      const raw = r.data?.data?.employees || r.data?.data || [];
      setEmployees(Array.isArray(raw) ? raw : []);
    }).catch(() => setEmployees([]));
  }, []);

  // Actor → regions (employee record se). Na mile to [] (Unknown).
  const actorRegionsOf = (l: any): any[] => {
    const uid = l.userId || l.actor?.id || l.actor?.email;
    const emp = employees.find((e: any) => e.id === uid || e.email === uid || e.email === l.actor?.email);
    const regs = (emp as any)?.regions;
    return Array.isArray(regs) ? regs : [];
  };
  const actorRegionIds = (l: any): string[] =>
    actorRegionsOf(l).map((r: any) => String(typeof r === 'string' ? r : (r.id || r.name || ''))).filter(Boolean);
  const actorRegionNames = (l: any): string[] =>
    actorRegionsOf(l).map((r: any) => {
      if (typeof r === 'string') {
        return allRegions.find((x: any) => String(x.id || x._id) === r)?.name || r;
      }
      return r.name || allRegions.find((x: any) => String(x.id || x._id) === String(r.id))?.name || r.id || '';
    }).filter(Boolean);

  const modules = useMemo(() => Array.from(new Set(logs.map((l) => String(l.module || l.entity || '')).filter(Boolean))).sort(), [logs]);
  const actions = useMemo(() => Array.from(new Set(logs.map((l) => String(l.action || '').toUpperCase()).filter(Boolean))).sort(), [logs]);

  const filtered = logs.filter((l) => {
    const q = searchTerm.toLowerCase();
    const matchesSearch = !q ||
      String(l.action || '').toLowerCase().includes(q) ||
      String(l.module || l.entity || '').toLowerCase().includes(q) ||
      String(l.actor?.name || l.user?.name || l.userName || l.performedBy || '').toLowerCase().includes(q) ||
      String(l.entityId || '').toLowerCase().includes(q);
    const matchesModule = moduleFilter === 'all' || String(l.module || l.entity || '') === moduleFilter;
    const matchesAction = actionFilter === 'all' || String(l.action || '').toUpperCase() === actionFilter;
    const rids = actorRegionIds(l);
    const matchesRegion = selectedRegion === 'all' || (rids.length > 0 && rids.some((id) =>
      id === String(selectedRegion) ||
      allRegions.find((x: any) => String(x.id || x._id) === String(selectedRegion))?.name === id
    ));
    return matchesSearch && matchesModule && matchesAction && matchesRegion;
  });

  const actorNameOf = (l: any) => l.actor?.name || l.user?.name || l.userName || l.performedBy || 'System';
  const actorInitialOf = (l: any) => String(actorNameOf(l)).trim().charAt(0).toUpperCase() || '?';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Audit Logs</h1>
          <p className="text-stone-500">Kaunne kab kya change kiya — read-only trail</p>
        </div>
        {selectedRegion !== 'all' && (
          <span className="text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded-full px-2.5 py-1 w-fit" title="Actor ke region ke hisab se">
            {allRegions.find((x: any) => String(x.id || x._id) === String(selectedRegion))?.name || 'Selected region'} only
          </span>
        )}
      </div>

      <Card className="border-stone-200 shadow-sm">
        <CardHeader className="p-4 border-b border-stone-100">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
              <Input placeholder="Search by action, module, user or ID..." className="pl-10 h-10" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={moduleFilter} onValueChange={setModuleFilter}>
                <SelectTrigger className="w-[150px] h-10"><SelectValue placeholder="Module" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Modules</SelectItem>
                  {modules.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="w-[150px] h-10"><SelectValue placeholder="Action" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  {actions.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={selectedRegion} onValueChange={setSelectedRegion}>
                <SelectTrigger className="w-[160px] h-10"><SelectValue placeholder="Region" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Regions</SelectItem>
                  {allRegions.map((r: any) => (
                    <SelectItem key={r.id || r._id} value={String(r.id || r._id)}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {isLoading ? (
            <div className="py-16 flex justify-center"><Loader2 size={36} className="animate-spin opacity-20" /></div>
          ) : filtered.length > 0 ? (
            <div className="relative">
              <div className="absolute left-[19px] top-2 bottom-2 w-px bg-stone-200" />
              <div className="space-y-3">
                {filtered.map((l: any, i: number) => {
                  const action = String(l.action || 'VIEW').toUpperCase();
                  const st = ACTION_STYLE[action] || ACTION_STYLE.VIEW;
                  const Icon = st.icon;
                  const names = actorRegionNames(l);
                  const details = typeof l.details === 'string' ? l.details : JSON.stringify(l.details || l.changes || '');
                  return (
                    <div key={l.id || i} className="relative flex gap-3 p-3 rounded-xl border border-stone-100 bg-card hover:bg-stone-50 hover:border-stone-200 transition-colors">
                      <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-bold", st.ring)}>
                        <Icon size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-stone-900 text-sm flex items-center gap-1.5">
                            <span className="w-5 h-5 rounded-full bg-stone-200 text-stone-600 text-[10px] font-bold flex items-center justify-center" title={actorNameOf(l)}>
                              {actorInitialOf(l)}
                            </span>
                            {actorNameOf(l)}
                          </span>
                          <Badge className={cn("text-[11px] font-semibold border", st.badge)}>{action}</Badge>
                          <Badge variant="outline" className="font-normal text-[11px]">{l.module || l.entity || '—'}</Badge>
                          {names.length > 0 ? (
                            <Badge variant="outline" className="font-normal text-[11px]" title="Actor ka region">
                              <MapPin size={10} className="mr-0.5" />{names.slice(0, 2).join(', ')}{names.length > 2 ? ` +${names.length - 2}` : ''}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="font-normal text-[11px] text-stone-400" title="Actor ka region pata nahi">General</Badge>
                          )}
                          <span className="ml-auto text-[11px] text-stone-400 shrink-0" title={l.createdAt ? new Date(l.createdAt).toLocaleString('en-IN') : ''}>
                            {timeAgo(l.createdAt)}
                          </span>
                        </div>
                        {(details && details !== '""' && details !== '"—"') ? (
                          <p className="text-xs text-stone-500 mt-1 truncate" title={details}>{details}</p>
                        ) : (
                          <p className="text-xs text-stone-400 mt-1 font-mono">id {(l.entityId || '').slice(0, 8) || (l.id || '').slice(0, 8)}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="py-16 text-center text-stone-400">
              <ScrollText size={36} className="mx-auto mb-2 opacity-20" />
              <p>No audit logs found{selectedRegion !== 'all' ? ' for this region' : ''}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {pagination.pages > 1 && (
        <div className="flex items-center justify-between text-sm text-stone-500">
          <span>Page {pagination.page} of {pagination.pages} ({pagination.total} total)</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={pagination.page <= 1} onClick={() => fetchLogs(pagination.page - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={pagination.page >= pagination.pages} onClick={() => fetchLogs(pagination.page + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditLogs;
