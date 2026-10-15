import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, TrendingUp, Filter, Download, Users, Trophy, Target, IndianRupee } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { growthAnalyticsApi, exportApi } from '../services/api';
import { useRegion } from '../contexts/RegionContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const GrowthAnalytics: React.FC = () => {
  const { selectedRegion, selectedRegionName } = useRegion();
  const [funnel, setFunnel] = useState<any[]>([]);
  const [conversionRate, setConversionRate] = useState(0);
  const [engineers, setEngineers] = useState<any[]>([]);
  const [forecast, setForecast] = useState<any>(null);
  const [leadScores, setLeadScores] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Funnel backend par regionId se filter hota hai; baaki widgets global.
      const regionParam = selectedRegion === 'all' ? undefined : { regionId: selectedRegion };
      const [funnelRes, engRes, foreRes, scoresRes] = await Promise.all([
        growthAnalyticsApi.getFunnel(regionParam),
        growthAnalyticsApi.getEngineerPerformance(regionParam),
        growthAnalyticsApi.getForecast(regionParam),
        // Best-effort: endpoint may be unavailable on some backends.
        growthAnalyticsApi.getLeadScores(regionParam).catch(() => ({ data: { data: [] } })),
      ]);
      const f = funnelRes.data.data;
      setFunnel(Array.isArray(f?.stages) ? f.stages.map((s: any) => ({ ...s, stage: String(s.stage).toLowerCase() })) : (Array.isArray(f?.funnel) ? f.funnel : []));
      setConversionRate(f?.conversionRate || 0);
      const e = engRes.data.data;
      setEngineers(Array.isArray(e?.engineers) ? e.engineers : []);
      setForecast(foreRes.data.data || null);
      const sc = (scoresRes as any)?.data?.data;
      const list = Array.isArray(sc?.scores) ? sc.scores : Array.isArray(sc?.leads) ? sc.leads : Array.isArray(sc) ? sc : [];
      setLeadScores(list);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to fetch analytics');
    } finally {
      setIsLoading(false);
    }
  }, [selectedRegion]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Time-to-time updates: tab par wapas aate hi refresh.
  useEffect(() => {
    const onFocus = () => fetchData();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchData]);

  const handleExport = async (module: string) => {
    try {
      const res = await exportApi.download(module);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = `${module}-export.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(`${module} exported`);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Export failed');
    }
  };

  const maxFunnelCount = Math.max(1, ...funnel.map(f => f.count));
  const stageColors: Record<string, string> = {
    new: 'bg-blue-400', contacted: 'bg-yellow-400', qualified: 'bg-purple-400', proposal: 'bg-indigo-400', negotiation: 'bg-orange-400', won: 'bg-green-500', lost: 'bg-red-400',
  };

  if (isLoading) {
    return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 size={40} className="animate-spin opacity-30" /></div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><TrendingUp className="text-orange-600" /> Growth Analytics</h1>
          <p className="text-sm text-stone-500">Conversion funnel, engineer performance &amp; revenue forecast.
            {selectedRegion !== 'all' && (
              <span className="ml-1 font-semibold text-orange-700">(Region: {selectedRegionName})</span>
            )}
          </p>
        </div>
        <div className="md:ml-auto">
          <Select onValueChange={v => { if (v) handleExport(String(v)); }}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Export data..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="leads">Export Leads</SelectItem>
              <SelectItem value="customers">Export Customers</SelectItem>
              <SelectItem value="invoices">Export Invoices</SelectItem>
              <SelectItem value="expenses">Export Expenses</SelectItem>
              <SelectItem value="payments">Export Payments</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card><CardContent className="flex items-center gap-3 p-4">
          <div className="h-10 w-10 rounded-lg bg-orange-50 flex items-center justify-center"><Target size={18} className="text-orange-600" /></div>
          <div><p className="text-2xl font-bold">{Number(conversionRate || 0).toFixed(1)}%</p><p className="text-xs text-stone-500">Lead → Won conversion</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4">
          <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center"><IndianRupee size={18} className="text-blue-600" /></div>
          <div><p className="text-2xl font-bold">₹{Number(forecast?.forecast || 0).toLocaleString('en-IN')}</p><p className="text-xs text-stone-500">12-month revenue forecast</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4">
          <div className="h-10 w-10 rounded-lg bg-green-50 flex items-center justify-center"><Trophy size={18} className="text-green-600" /></div>
          <div><p className="text-2xl font-bold">{engineers.length}</p><p className="text-xs text-stone-500">Engineers tracked</p></div>
        </CardContent></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Filter size={15} /> Conversion Funnel</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {funnel.map(f => (
              <div key={f.stage}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium capitalize">{f.stage}</span>
                  <span>{f.count} leads • ₹{Number(f.value).toLocaleString('en-IN')}</span>
                </div>
                <div className="h-6 rounded bg-stone-100 overflow-hidden">
                  <div className={cn("h-6 rounded flex items-center px-2 text-[10px] font-semibold text-white", stageColors[f.stage] || 'bg-stone-300')} style={{ width: `${Math.max(4, (f.count / maxFunnelCount) * 100)}%` }}>
                    {f.count > 0 && f.count}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Users size={15} /> Revenue Forecast</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-stone-400">Committed (approved)</p>
                <p className="text-lg font-bold">₹{Number(forecast?.committed || 0).toLocaleString('en-IN')}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-stone-400">Pipeline (40% weighted)</p>
                <p className="text-lg font-bold">₹{Number(forecast?.weightedPipeline || forecast?.probabilityWeighted || 0).toLocaleString('en-IN')}</p>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold mb-2">Top Opportunities</p>
              <div className="space-y-1.5">
                {(forecast?.topOpportunities || []).map((o: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-sm rounded-lg border px-3 py-2">
                    <span className="font-medium">{o.name}</span>
                    <span className="text-xs text-stone-400">{o.interest}</span>
                    <span className="font-semibold">₹{Number(o.value ?? o.amount).toLocaleString('en-IN')}</span>
                    <Badge variant="secondary" className="capitalize">{o.status}</Badge>
                  </div>
                ))}
                {(forecast?.topOpportunities || []).length === 0 && <p className="text-xs text-stone-400">No pipeline opportunities</p>}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Users size={15} /> Engineer Performance</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Engineer</TableHead>
                <TableHead>Installations</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead>Avg. Progress</TableHead>
                <TableHead>Surveys</TableHead>
                <TableHead>Service Tickets</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {engineers.map(e => (
                <TableRow key={e.id || e.engineer}>
                  <TableCell className="font-medium">{e.name || e.engineer}</TableCell>
                  <TableCell>{e.installations ?? 0}</TableCell>
                  <TableCell className="text-green-600">{e.completions ?? e.completed ?? 0}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 rounded-full bg-stone-100"><div className="h-2 rounded-full bg-orange-500" style={{ width: `${e.averageProgress ?? e.avgProgress ?? 0}%` }} /></div>
                      <span className="text-xs">{e.averageProgress ?? e.avgProgress ?? 0}%</span>
                    </div>
                  </TableCell>
                  <TableCell>{e.surveys ?? 0}</TableCell>
                  <TableCell>{e.tickets ?? e.serviceTickets ?? 0}</TableCell>
                </TableRow>
              ))}
              {engineers.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-stone-400 py-6">No data</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Target size={15} /> Top Lead Scores</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leadScores.slice(0, 10).map((l: any, i: number) => {
                const score = Number(l.score ?? l.leadScore ?? 0);
                return (
                  <TableRow key={l.id || l.leadId || i}>
                    <TableCell className="font-medium">{l.name || l.leadName || l.lead?.name || '—'}</TableCell>
                    <TableCell><Badge variant="secondary" className="capitalize">{String(l.status || '').toLowerCase() || '—'}</Badge></TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-20 h-2 rounded-full bg-stone-100"><div className="h-2 rounded-full bg-orange-500" style={{ width: `${Math.min(100, Math.max(0, score))}%` }} /></div>
                        <span className="text-xs font-semibold w-8">{score}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {leadScores.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-stone-400 py-6">No scores yet</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-sm">Quick Exports</CardTitle>
          <Download size={15} className="text-stone-400" />
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {['leads', 'customers', 'invoices', 'expenses', 'payments', 'tasks'].map(m => (
            <Button key={m} variant="outline" size="sm" onClick={() => handleExport(m)} className="capitalize">{m}</Button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

export default GrowthAnalytics;