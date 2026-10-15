import React, { useState, useEffect } from 'react';
import { 
  Users, 
  CheckCircle2, 
  XCircle, 
  Truck, 
  AlertTriangle, 
  CreditCard, 
  Wrench,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  MapPin,
  MessageSquare,
  Star
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { analyticsApi, leadsApi, feedbackApi, inventoryApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useRegion } from '../contexts/RegionContext';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

const Dashboard: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const [summary, setSummary] = useState<any>(null);
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [regionData, setRegionData] = useState<any[]>([]);
  const [recentLeads, setRecentLeads] = useState<any[]>([]);
  const [wonLeads, setWonLeads] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [feedbackStats, setFeedbackStats] = useState<any>(null);
  const [recentFeedback, setRecentFeedback] = useState<any[]>([]);
  const { regions, selectedRegion, setSelectedRegion, matchRegion } = useRegion();
  const [stockOutValue, setStockOutValue] = useState(0);

  const COLORS = ['#ea580c', '#f97316', '#fdba74', '#fed7aa'];

  const isMountedRef = React.useRef(true);
  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchDashboardData = async (regionId?: string) => {    setIsLoading(true);
    try {
      // isStaff: ADMIN, MANAGER, SALES_EXECUTIVE, or SUPER_ADMIN can access staff APIs
      const isStaff = user?.role === 'ADMIN' || user?.role === 'MANAGER' || user?.role === 'SALES_EXECUTIVE' || user?.isSuperAdmin;

      const safeFetch = async <T,>(promise: Promise<T>, fallback: T): Promise<T> => {
        try { return await promise; } catch { return fallback; }
      };

      const emptyRes = { data: { data: {} }, status: 200, statusText: 'OK', headers: {}, config: {} } as any;
      const emptyLeadsRes = { data: { data: { leads: [] } }, status: 200, statusText: 'OK', headers: {}, config: {} } as any;
      const emptyListRes = { data: { data: [] }, status: 200, statusText: 'OK', headers: {}, config: {} } as any;

      const runIf = <T,>(condition: boolean, promise: Promise<T>, fallback: T): Promise<T> =>
        condition ? safeFetch(promise, fallback) : Promise.resolve(fallback);

      const regionParam = regionId ? { regionId } : undefined;
      const [summaryRes, revenueRes, regionRes, leadsRes, feedbackRes, feedbackListRes, wonLeadsRes, movementsRes, lowStockRes] = await Promise.all([
        safeFetch(analyticsApi.getSummary(regionParam), emptyRes),
        safeFetch(analyticsApi.getRevenueChart(regionParam), emptyRes),
        // Region distribution hamesha all-regions (admin ko poora map dikhe).
        safeFetch(analyticsApi.getRegionChart(), emptyRes),
        isStaff ? safeFetch(leadsApi.getAll({ regionId, limit: 5 }), emptyLeadsRes) : Promise.resolve(emptyLeadsRes),
        isStaff && hasPermission('feedback', 'read') ? safeFetch(feedbackApi.getCount(), emptyRes) : Promise.resolve(emptyRes),
        isStaff && hasPermission('feedback', 'read') ? safeFetch(feedbackApi.getAll({ limit: 5 }), emptyListRes) : Promise.resolve(emptyListRes),
        isStaff ? safeFetch(leadsApi.getWonLeads({ limit: 5 }), emptyLeadsRes) : Promise.resolve(emptyLeadsRes),
        isStaff ? safeFetch(inventoryApi.getMovements(), emptyListRes) : Promise.resolve(emptyListRes),
        isStaff ? safeFetch(inventoryApi.getAll({ lowStock: true }), emptyListRes) : Promise.resolve(emptyListRes),
      ]);
      if (!isMountedRef.current) return;

      const rawSummary = summaryRes.data.data || summaryRes.data;
      const feedbackListRaw = feedbackListRes.data?.data?.feedback || feedbackListRes.data?.data || feedbackListRes.data;
      const wonRaw = wonLeadsRes.data.data?.leads || wonLeadsRes.data.data || [];
      const movements = Array.isArray(movementsRes.data.data) ? movementsRes.data.data : [];
      const lowStockRaw = lowStockRes.data.data?.items || lowStockRes.data.data || [];

      const stockOutTotal = movements
        .filter((m: any) => m.type === 'STOCK_OUT')
        .reduce((s: number, m: any) => s + Math.abs(m.quantity || 0) * (m.unitPrice || 0), 0);
      const lowStockCount = Array.isArray(lowStockRaw) ? lowStockRaw.length : 0;

      // Backend naya `trends[6]` array bhejta hai ({month,leads,won,lost,installations}).
      // Mile to last-vs-prev month se % label banao, warna purane string fields/fallback.
      const trendLabel = (key: 'leads' | 'won' | 'lost' | 'installations'): string | undefined => {
        const t = (rawSummary as any)?.trends;
        if (!Array.isArray(t) || t.length < 2) return undefined;
        const prev = Number(t[t.length - 2]?.[key] ?? 0);
        const last = Number(t[t.length - 1]?.[key] ?? 0);
        if (prev === 0) return last > 0 ? '+100%' : '+0%';
        const pct = Math.round(((last - prev) / prev) * 100);
        return `${pct >= 0 ? '+' : ''}${pct}%`;
      };

      setSummary({
        totalLeads: rawSummary.totalLeads ?? 0,
        convertedLeads: rawSummary.wonLeads ?? rawSummary.convertedLeads ?? 0,
        lostLeads: rawSummary.lostLeads ?? 0,
        activeInstallations: rawSummary.activeInstallations ?? 0,
        totalProjects: rawSummary.totalProjects ?? rawSummary.activeInstallations ?? 0,
        pendingPayments: rawSummary.pendingPayments ?? 0,
        // lowStockCount backend par GLOBAL hai (region filter nahi hota) — UI pe tag lagta hai.
        lowStockCount: rawSummary.lowStockCount ?? lowStockCount,
        openServiceTickets: rawSummary.openServiceRequests ?? rawSummary.openServiceTickets ?? 0,
        leadsTrend: trendLabel('leads') ?? rawSummary.leadsTrend ?? '+0%',
        convertedTrend: trendLabel('won') ?? rawSummary.convertedTrend ?? '+0%',
        lostTrend: trendLabel('lost') ?? rawSummary.lostTrend ?? '0%',
        installTrend: trendLabel('installations') ?? rawSummary.installTrend ?? '+0%',
      });
      setStockOutValue(stockOutTotal);
      const revRaw = revenueRes.data.data;
      setRevenueData(Array.isArray(revRaw?.chartData) ? revRaw.chartData : Array.isArray(revRaw?.revenue) ? revRaw.revenue : Array.isArray(revRaw) ? revRaw : []);
      const regRaw = regionRes.data.data;
      if (Array.isArray(regRaw?.chartData)) {
        setRegionData(regRaw.chartData.map((item: any) => ({ name: item.region || item.name, value: item.totalLeads || item.value || 0 })));
      } else if (Array.isArray(regRaw?.regions)) {
        setRegionData(regRaw.regions);
      } else if (Array.isArray(regRaw)) {
        setRegionData(regRaw);
      } else {
        setRegionData([]);
      }
      const rawLeads = leadsRes.data.data?.leads || leadsRes.data.data || [];
      console.info('[dashboard] summary keys:', rawSummary && typeof rawSummary === 'object' ? Object.keys(rawSummary) : typeof rawSummary,
        '| leads:', Array.isArray(rawLeads) ? rawLeads.length : 0, '| won:', Array.isArray(wonRaw) ? wonRaw.length : 0);
      setRecentLeads(Array.isArray(rawLeads) ? rawLeads.slice(0, 5) : []);
      const fbCount = feedbackRes.data?.data || feedbackRes.data;
      setFeedbackStats(fbCount?.all != null ? fbCount : null);
      const recent = Array.isArray(feedbackListRaw) ? feedbackListRaw.slice(0, 5) : [];
      setRecentFeedback(recent);
      const wonList = Array.isArray(wonRaw) ? wonRaw : [];
      // /leads/won takes no region param — scope client-side to the global region.
      setWonLeads(wonList.filter((l: any) => matchRegion(l.region || l.regionId)).slice(0, 5));
    } catch (error) {
      console.error('Failed to fetch dashboard data', error);
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchDashboardData(selectedRegion === 'all' ? undefined : selectedRegion);
    return () => controller.abort();
  }, [selectedRegion]);

  const stats = [
    { title: 'Total Leads', value: summary?.totalLeads || '0', icon: Users, color: 'text-blue-600', bg: 'bg-blue-50', trend: summary?.leadsTrend || '0%', up: true },
    { title: 'Won Leads', value: summary?.convertedLeads || '0', icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50', trend: summary?.convertedTrend || '0%', up: true },
    { title: 'Lost Leads', value: summary?.lostLeads || '0', icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', trend: summary?.lostTrend || '0%', up: false },
    { title: 'Installations', value: summary?.activeInstallations || '0', icon: Truck, color: 'text-orange-600', bg: 'bg-orange-50', trend: summary?.installTrend || '0', up: true },
  ];

  const alerts = [
    { title: 'Low Stock Alerts', value: summary?.lowStockCount || '0', icon: AlertTriangle, color: 'text-amber-600', global: true },
    { title: 'Pending Payments', value: `₹${summary?.pendingPayments || '0'}`, icon: CreditCard, color: 'text-purple-600', global: false },
    { title: 'Open Service', value: summary?.openServiceTickets || '0', icon: Wrench, color: 'text-indigo-600', global: false },
    { title: 'Stock Out (Value)', value: `₹${stockOutValue.toLocaleString()}`, icon: TrendingDown, color: 'text-green-600', global: false },
  ];

  if (isLoading && !summary) {
    return (
      <div className="h-[80vh] flex flex-col items-center justify-center text-stone-400">
        <Loader2 size={48} className="mb-4 animate-spin opacity-20" />
        <p className="text-lg font-medium">Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Welcome back, {user?.name}</h1>
          <p className="text-stone-500">Here's what's happening with your solar projects today.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <MapPin size={16} className="text-stone-400" />
            <Select value={selectedRegion} onValueChange={setSelectedRegion}>
              <SelectTrigger className="w-[180px] h-9 border-stone-200">
                <SelectValue placeholder="All Regions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Regions</SelectItem>
                {regions.map(r => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Badge className="bg-orange-600 text-white px-3 py-1">
            {(user?.role || '').replace(/_/g, ' ') || 'User'}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.title} className="border-stone-200 shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className={`p-2 rounded-lg ${stat.bg} ${stat.color}`}>
                  <stat.icon size={24} />
                </div>
                <div className={`flex items-center gap-1 text-xs font-medium ${stat.up ? 'text-green-600' : 'text-red-600'}`}>
                  {stat.up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                  {stat.trend}
                </div>
              </div>
              <div className="mt-4">
                <p className="text-sm font-medium text-stone-500">{stat.title}</p>
                <p className="text-2xl font-bold text-stone-900">{stat.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {alerts.map((alert) => (
          <Card key={alert.title} className="border-stone-200 shadow-sm bg-card">
            <CardContent className="p-4 flex items-center gap-4">
              <div className={`p-2 rounded-full bg-stone-50 ${alert.color}`}>
                <alert.icon size={20} />
              </div>
              <div>
                <p className="text-xs font-medium text-stone-500 uppercase tracking-wider flex items-center gap-1.5">
                  {alert.title}
                  {alert.global && (
                    <span className="normal-case tracking-normal text-[10px] font-semibold px-1.5 py-px rounded-full bg-stone-100 text-stone-500 border border-stone-200" title="Ye number global hai — region filter se nahi badalta">
                      All regions
                    </span>
                  )}
                </p>
                <p className="text-lg font-bold text-stone-900">{alert.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {feedbackStats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-stone-200 shadow-sm bg-card">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-2 rounded-full bg-blue-50">
                <MessageSquare size={20} className="text-blue-600" />
              </div>
              <div>
                <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">Total Feedback</p>
                <p className="text-lg font-bold text-stone-900">{feedbackStats?.all ?? 0}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-stone-200 shadow-sm bg-card">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-2 rounded-full bg-sky-50">
                <MessageSquare size={20} className="text-sky-600" />
              </div>
              <div>
                <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">New</p>
                <p className="text-lg font-bold text-stone-900">{feedbackStats?.new ?? 0}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-stone-200 shadow-sm bg-card">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-2 rounded-full bg-amber-50">
                <MessageSquare size={20} className="text-amber-600" />
              </div>
              <div>
                <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">Pending</p>
                <p className="text-lg font-bold text-stone-900">{feedbackStats?.pending ?? 0}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-stone-200 shadow-sm bg-card">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-2 rounded-full bg-purple-50">
                <Star size={20} className="text-purple-600" />
              </div>
              <div>
                <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">Avg Rating</p>
                <p className="text-lg font-bold text-stone-900">
                  {recentFeedback.length > 0
                    ? (recentFeedback.reduce((s, f) => s + (f.rating || 0), 0) / recentFeedback.length).toFixed(1)
                    : '-'}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-stone-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Monthly Revenue</CardTitle>
            <CardDescription>Collected (orange) vs approved (green) revenue over the last 6 months</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 pb-2 text-xs font-medium text-stone-500">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-orange-500" /> Collected</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-green-600" /> Approved</span>
            </div>
            <div className="h-[300px] w-full min-w-0">
              <ResponsiveContainer width="100%" height={300} minWidth={0} minHeight={0}>
                <BarChart data={revenueData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ece5d9" />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#8a7f6e' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#8a7f6e' }} tickFormatter={(value) => `₹${value/1000}k`} />
                  <Tooltip cursor={{ fill: '#f7f3ea' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                  <Bar dataKey="revenue" name="Collected" fill="#f97316" radius={[6, 6, 0, 0]} barSize={28} />
                  <Bar dataKey="approved" name="Approved" fill="#16a34a" radius={[6, 6, 0, 0]} barSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-stone-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Region Performance</CardTitle>
            <CardDescription>Distribution of projects across regions</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            <div className="h-[300px] w-full min-w-0">
              <ResponsiveContainer width="100%" height={300} minWidth={0} minHeight={0}>
                <PieChart>
                  <Pie data={regionData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value">
                    {Array.isArray(regionData) && regionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <circle cx="50%" cy="50%" r="50" fill="white" />
                  <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="text-xl font-bold fill-stone-900">
                    {summary?.totalProjects || '0'}
                  </text>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              {Array.isArray(regionData) && regionData.map((item, index) => (
                <div key={item.name} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                  <span className="text-sm text-stone-600">{item.name}: {item.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-stone-200 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Recent Leads</CardTitle>
            <CardDescription>{selectedRegion === 'all' ? 'Latest inquiries across all regions' : `Latest inquiries for ${regions.find(r => r.id === selectedRegion)?.name || 'selected region'}`}</CardDescription>
          </div>
          <Link to="/leads">
            <Button variant="outline" size="sm" className="text-orange-600 border-orange-200 hover:bg-orange-50">View All</Button>
          </Link>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="bg-stone-50 hover:bg-stone-50">
                <TableHead>Lead ID</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Region</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentLeads.length > 0 ? (
                recentLeads.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell className="font-medium text-stone-900">{(lead.id || '').substring(0, 8)}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-stone-900">{lead.name}</span>
                        <span className="text-xs text-stone-500">{lead.phone}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-normal">{typeof lead.region === 'object' ? lead.region?.name : lead.region || lead.regionId}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={cn("font-medium capitalize",
                        lead.status === 'new' && "bg-blue-100 text-blue-700 hover:bg-blue-100",
                        lead.status === 'contacted' && "bg-yellow-100 text-yellow-700 hover:bg-yellow-100",
                        lead.status === 'qualified' && "bg-purple-100 text-purple-700 hover:bg-purple-100",
                        lead.status === 'won' && "bg-green-100 text-green-700 hover:bg-green-100",
                        lead.status === 'lost' && "bg-red-100 text-red-700 hover:bg-red-100",
                      )}>
                        {lead.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-stone-500">{new Date(lead.createdAt || Date.now()).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-stone-400">
                    No leads found for this region
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="border-stone-200 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Converted Leads</CardTitle>
            <CardDescription>Won leads and successful conversions</CardDescription>
          </div>
          <Link to="/leads">
            <Button variant="outline" size="sm" className="text-green-600 border-green-200 hover:bg-green-50">View All</Button>
          </Link>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="bg-stone-50 hover:bg-stone-50">
                <TableHead>Lead ID</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Region</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {wonLeads.length > 0 ? (
                wonLeads.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell className="font-medium text-stone-900">{(lead.id || '').substring(0, 8)}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-stone-900">{lead.name}</span>
                        <span className="text-xs text-stone-500">{lead.phone}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-normal">{typeof lead.region === 'object' ? lead.region?.name : lead.region || lead.regionId}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className="bg-green-100 text-green-700 hover:bg-green-100 capitalize">
                        {lead.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-stone-500">{new Date(lead.createdAt || Date.now()).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-stone-400">
                    No converted leads yet
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
