import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  CreditCard, 
  TrendingUp, 
  Clock, 
  CheckCircle2, 
  Search, 
  Filter, 
  Download,
  ArrowUpRight,
  MoreVertical,
  Loader2,
  Plus,
  FileText,
  Link2,
  Receipt,
  AlertCircle,
  CalendarRange,
  Wallet,
  Pencil,
  Trash2,
  Send,
  Mail,
  MessageSquare,
  History,
  ShieldCheck,
  Zap,
  RefreshCw,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { paymentsApi, leadsApi, quotationsApi, invoicesApi, customersApi, exportApi, expensesApi } from '../services/api';
import { PAYMENT_STATUSES, apiMessage, sameStatus, statusLabel } from '@/lib/statuses';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAuth } from '../contexts/AuthContext';
import { cn, toLocalDateKey, toDateInputValue } from '@/lib/utils';
import { useRegion } from '../contexts/RegionContext';
import { toast } from 'sonner';

const INVOICE_STATUSES = ['draft', 'sent', 'paid', 'overdue'] as const;

// DELETE /payments/:id is only accepted while money is still outstanding.
// COMPLETED is rejected with 409 because undoing it needs a reversal
// (POST /payments/:id/reverse), which does not exist yet.
const isPaymentDeletable = (status: unknown) =>
  sameStatus(status, 'PENDING') || sameStatus(status, 'PARTIAL');
const EXPENSE_CATEGORIES = ['Transport', 'Equipment', 'Marketing', 'Operations', 'Office', 'Other'];

const statusBadge: Record<string, string> = {
  draft: 'bg-stone-100 text-stone-600', sent: 'bg-blue-100 text-blue-700', paid: 'bg-green-100 text-green-700', overdue: 'bg-red-100 text-red-700',
};

type Period = 'week' | 'month' | 'year';

const getDateRange = (period: Period) => {
  const now = new Date();
  const start = new Date();
  if (period === 'week') {
    start.setDate(now.getDate() - 7);
  } else if (period === 'month') {
      // `start` is "now", so setMonth(now.getMonth()-1) on e.g. 31 Mar rolls
      // into 3 Mar. Clamp to the 1st so "Month" is always a real month.
      start.setDate(1);
      start.setMonth(now.getMonth() - 1);
  } else {
    start.setFullYear(now.getFullYear() - 1);
  }
  return { start: toLocalDateKey(start), end: toLocalDateKey(now) };
};

// Payment records may carry either the new explicit fields (totalAmount /
// receivedAmount) or the legacy single `amount` field — normalize for display.
const num = (v: any): number => {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};
const payTotal = (p: any): number =>
  num(
    p?.totalAmount ??
    p?.total_amount ??
    p?.total ??
    p?.grandTotal ??
    p?.grand_total ??
    p?.netAmount ??
    p?.net_amount ??
    p?.payableAmount ??
    p?.invoiceAmount ??
    p?.amount ??
    0
  );
const payReceived = (p: any): number =>
  num(
    p?.receivedAmount ??
    p?.received_amount ??
    p?.received ??
    p?.paidAmount ??
    p?.paid_amount ??
    p?.paid ??
    p?.collectedAmount ??
    p?.amount ??
    0
  );

// Backend list shape varies (data.payments | data.items | data.rows |
// data.results | data.list | nested data.data | bare array) — try all keys.
const extractList = (res: any, keys: string[], label: string): any[] => {
  const root = res?.data?.data ?? res?.data;
  const candidates: any[] = [root, ...keys.map((k) => root?.[k]).filter((v) => v !== undefined)];
  for (const c of candidates) {
    if (Array.isArray(c)) return c;
  }
  if (root && typeof root === 'object') {
    for (const v of Object.values(root)) {
      if (Array.isArray(v) && v.length > 0) return v;
    }
  }
  console.info(`[${label}] unexpected list shape, keys:`, root && typeof root === 'object' ? Object.keys(root) : typeof root);
  return [];
};

const PaymentRevenue: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'payments' | 'invoices' | 'expenses'>('payments');
  // Payments tab visible hai.
  const SHOW_PAYMENTS_TAB = true;
  const [period, setPeriod] = useState<Period>('month');
  
  // Payments state
  const [payments, setPayments] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [quotations, setQuotations] = useState<any[]>([]);
  const [isLoadingPayments, setIsLoadingPayments] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isRecordDialogOpen, setIsRecordDialogOpen] = useState(false);
  const [viewPayment, setViewPayment] = useState<any>(null);
  const [recordPaymentData, setRecordPaymentData] = useState<any>(null);
  const [deletePaymentId, setDeletePaymentId] = useState<string | null>(null);
  const [deletePaymentLoading, setDeletePaymentLoading] = useState(false);

  // Invoices state
  const [invoices, setInvoices] = useState<any[]>([]);
  const [aging, setAging] = useState<any>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [isLoadingInvoices, setIsLoadingInvoices] = useState(true);
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState('all');
  const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);
  const [invoiceSaving, setInvoiceSaving] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState<any>({ customerId: '', customerName: '', amount: '', dueDate: '', status: 'draft' });

  // Expenses state
  const [expenses, setExpenses] = useState<any[]>([]);
  const [expenseStats, setExpenseStats] = useState<any>({});
  const [expenseCategories, setExpenseCategories] = useState<string[]>([]);
  const [isLoadingExpenses, setIsLoadingExpenses] = useState(true);
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState('all');
  const [isExpenseOpen, setIsExpenseOpen] = useState(false);
  const [expenseSaving, setExpenseSaving] = useState(false);
  const [expenseForm, setExpenseForm] = useState<any>({ title: '', category: 'Transport', amount: '', date: '', paymentMode: 'UPI', notes: '' });

  // Shared
  const isLoading = isLoadingPayments || isLoadingInvoices || isLoadingExpenses;
  const { matchRegion, selectedRegion, setSelectedRegion } = useRegion();
  const clearPaymentFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setSelectedRegion('all');
  };

  // Staff-only data: the real API returns 403 for CUSTOMER accounts on these
  // endpoints, so we skip the requests entirely for non-staff users (avoids
  // 403 console errors and just shows empty states).
  const { user } = useAuth();
  const isStaffUser = !!user && user.role !== 'CUSTOMER';

  // --- Payments ---
  // Note: /v1/payments is accessible to all roles (it was not in the 403 list),
  // so we always fetch it. Invoices/expenses remain staff-only (gated below).
  // Payments are recorded against a quotationId (no customerName on the record),
  // so resolve the display name from nested objects or the fetched lists.
  const getPaymentClientName = (pay: any): string => {
    if (!pay) return 'N/A';
    const q = pay.quotationId || pay.quotation_id
      ? quotations.find((x: any) => x.id === (pay.quotationId || pay.quotation_id))
      : undefined;
    const qLeadId = (q as any)?.leadId || (q as any)?.lead_id || (q as any)?.lead?.id;
    return (
      pay.customerName ||
      pay.customer_name ||
      pay.customer?.name ||
      pay.lead?.name ||
      pay.lead?.fullName ||
      pay.leadName ||
      pay.lead_name ||
      pay.clientName ||
      pay.client_name ||
      pay.name ||
      pay.quotation?.lead?.name ||
      pay.quotation?.leadName ||
      pay.quotation?.customer?.name ||
      pay.quotation?.customerName ||
      q?.lead?.name ||
      (q as any)?.leadName ||
      (q as any)?.customer?.name ||
      (q as any)?.customerName ||
      leads.find((l: any) => l.id === (pay.leadId || pay.lead_id || qLeadId))?.name ||
      customers.find((c: any) => c.id === (pay.customerId || pay.customer_id || (q as any)?.customerId))?.name ||
      'N/A'
    );
  };
  const fetchPayments = useCallback(async () => {
    setIsLoadingPayments(true);
    try {
      const response = await paymentsApi.getAll();
      const list = extractList(response, ['payments'], 'payments');
      console.info('[payments] fetched:', list.length, 'first-item keys:', list[0] ? Object.keys(list[0]) : []);
      setPayments(list);
    } catch (error: any) {
      const status = error?.response?.status;
      toast.error(status === 403 ? 'Payments dekhne ka access nahi — admin se permission lo.' : 'Failed to fetch payments');
    } finally {
      setIsLoadingPayments(false);
    }
  }, []);

  // Single-fetch read for one payment. Used by the detail dialog and to
  // reconcile a row after a status change or delete.
  const fetchPaymentById = async (id: string): Promise<any | null> => {
    try {
      const res = await paymentsApi.getById(id);
      const root = res?.data?.data ?? res?.data;
      const cand = [root?.payment, root].find((v) => v && typeof v === 'object' && !Array.isArray(v));
      return cand || null;
    } catch {
      return null;
    }
  };

  const handleDeletePayment = async () => {
    if (!deletePaymentId || deletePaymentLoading) return;
    setDeletePaymentLoading(true);
    try {
      await paymentsApi.delete(deletePaymentId);
      setPayments((prev) => prev.filter((p) => p.id !== deletePaymentId));
      setViewPayment((cur: any) => (cur && cur.id === deletePaymentId ? null : cur));
      toast.success('Payment deleted');
      setDeletePaymentId(null);
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 409) {
        // Lost the race with a concurrent status change — re-read and let the
        // UI fall back to the disabled, "reversal coming soon" state.
        const fresh = await fetchPaymentById(deletePaymentId);
        if (fresh) setPayments((prev) => prev.map((p) => (p.id === fresh.id ? { ...p, ...fresh } : p)));
        toast.error('Ye payment ab delete nahi ho sakta — reversal coming soon');
      } else if (status === 403) {
        toast.error('Permission nahi — admin se payments permission dilwao.');
      } else {
        toast.error(apiMessage(error, 'Failed to delete payment'));
      }
    } finally {
      setDeletePaymentLoading(false);
    }
  };

  const fetchLeads = useCallback(async () => {
    try {
      // Region join ke liye POORI list chahiye (default page me purane
      // leads kat jate hain aur payments ka region unknown ho jata hai).
      const response = await leadsApi.getAll({ limit: 200 });
      const data = response.data.data?.leads || response.data.data;
      const leadsData = Array.isArray(data) ? data : [];
      // Saare leads rakho (sirf WON nahi) — payment→lead name join sab par chahiye.
      setLeads(leadsData);
    } catch (error) {
      console.error('Failed to fetch leads', error);
    }
  }, []);

  const fetchQuotations = useCallback(async () => {
    try {
      const res = await quotationsApi.getAll();
      const data = res.data.data?.quotations || res.data.data;
      setQuotations(Array.isArray(data) ? data : []);
    } catch {
      setQuotations([]);
    }
  }, []);

  const handleRecordPayment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const receivedAmount = Number(formData.get('receivedAmount'));
    const totalAmount = Number(formData.get('totalAmount'));

    if (receivedAmount <= 0 || totalAmount <= 0) {
      toast.error('Amounts must be positive');
      return;
    }
    if (receivedAmount > totalAmount) {
      toast.error('Received amount cannot exceed total amount');
      return;
    }

    const quotationId = formData.get('quotationId') as string;
    if (!quotationId) {
      toast.error('Please select a quotation');
      return;
    }

    const paymentData: any = {
      quotationId,
      amount: receivedAmount,
      totalAmount,
      receivedAmount,
      paymentDate: new Date().toISOString(),
      notes: formData.get('notes') as string,
    };
    const pm = formData.get('paymentMode') as string;
    if (pm) paymentData.paymentMethod = pm;
    const ref = formData.get('transactionId') as string;
    if (ref) paymentData.referenceNo = ref;

    try {
      await paymentsApi.create(paymentData);
      fetchPayments();
      setIsRecordDialogOpen(false);
      toast.success('Payment recorded successfully!');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to record payment — ensure quotation exists');
    }
  };

  const openRecordPaymentDialog = (payment?: any) => {
    setRecordPaymentData(payment);
    setIsRecordDialogOpen(true);
  };

  // --- Invoices ---
  const fetchInvoices = useCallback(async () => {
    setIsLoadingInvoices(true);
    if (!isStaffUser) {
      setInvoices([]);
      setAging(null);
      setCustomers([]);
      setIsLoadingInvoices(false);
      return;
    }
    try {
      const params: any = {};
      if (invoiceStatusFilter !== 'all') params.status = invoiceStatusFilter;
      if (selectedRegion !== 'all') params.regionId = selectedRegion;
      const [res, agingRes, custRes] = await Promise.all([
        invoicesApi.getAll(params),
        invoicesApi.getAging().catch(() => ({ data: { data: null } })),
        customersApi.getAll().catch(() => ({ data: { data: { customers: [] } } })),
      ]);
      const data = res.data.data;
      setInvoices(extractList(res, ['invoices'], 'invoices'));
      const rawAging = agingRes.data.data || null;
      // The renderer reads b.label / b.amount / b.count. `Object.entries` over an
      // array yields index/object pairs, so amount became an object (₹NaN) and
      // count was always dropped ("0 invoice(s)"). Normalise both shapes.
      if (rawAging) {
        const rawBuckets: any = (rawAging as any).buckets;
        const buckets = Array.isArray(rawBuckets)
          ? rawBuckets.map((b: any) => (b && typeof b === 'object'
              ? { label: b.label ?? b.name ?? '', amount: b.amount ?? b.total ?? 0, count: b.count ?? 0 }
              : { label: String(b), amount: 0, count: 0 }))
          : Object.entries(rawBuckets || {}).map(([label, v]: [string, any]) => (
              v && typeof v === 'object'
                ? { label, amount: v.amount ?? v.total ?? 0, count: v.count ?? 0 }
                : { label, amount: Number(v) || 0, count: 0 }
            ));
        setAging({ ...rawAging, buckets } as any);
      } else {
        setAging(null);
      }
      setCustomers(extractList(custRes, ['customers'], 'invoice-customers'));
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to fetch invoices');
    } finally {
      setIsLoadingInvoices(false);
    }
  }, [invoiceStatusFilter, isStaffUser, selectedRegion]);

  const saveInvoice = async () => {
    const amount = Number(invoiceForm.amount);
    // `min="0.01"` was decorative: this dialog has no <form>, so Save is a plain
    // onClick and native validation never ran — negative receivables got through.
    if (!invoiceForm.customerId || !invoiceForm.amount) { toast.error('Customer and amount are required'); return; }
    if (!isFinite(amount) || amount <= 0) { toast.error('Amount must be a positive number'); return; }
    setInvoiceSaving(true);
    try {
      const payload: any = {
        customerId: invoiceForm.customerId,
        // Khali dueDate bhejne par backend 400 deta hai ("must be a valid
        // ISO 8601 date string") — sirf bhara ho to bhejo.
        ...(invoiceForm.dueDate ? { dueDate: invoiceForm.dueDate } : {}),
        // Issue Date was rendered (and loaded on edit) but never sent.
        issuedDate: invoiceForm.issuedDate || undefined,
        items: [{ description: 'Invoice amount', quantity: 1, unitPrice: amount }],
      };
      if (invoiceForm.id) {
        await invoicesApi.update(invoiceForm.id, payload);
        toast.success('Invoice updated');
      } else {
        await invoicesApi.create(payload);
        toast.success('Invoice created');
      }
      setIsInvoiceOpen(false);
setInvoiceForm({ customerId: '', customerName: '', amount: '', dueDate: '', status: 'draft' });
      fetchInvoices();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to save invoice');
    } finally {
      setInvoiceSaving(false);
    }
  };

  const updateInvoiceStatus = async (inv: any, status: string) => {
    try {
      await invoicesApi.updateStatus(inv.id, { status });
      setInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, status } : i));
      toast.success(`Invoice ${status}`);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Update failed');
    }
  };

  const generateInvoiceLink = async (inv: any) => {
    try {
      const res = await invoicesApi.generatePaymentLink(inv.id);
      const rawLink = res.data.data?.paymentLink || res.data.data?.url || res.data.data?.link || '';
    if (!rawLink) {
      toast.error('No payment link returned by the server');
      return;
    }
      const link = rawLink.replace(/^https?:\/\/localhost(?::\d+)?/i, window.location.origin);
      await navigator.clipboard.writeText(link).catch(() => {});
      setInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, paymentLink: link } : i));
      toast.success('Payment link generated & copied');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to generate link');
    }
  };

  const downloadInvoicePdf = async (inv: any) => {
    try {
      const res = await invoicesApi.downloadPdf(inv.id);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = `${inv.number || inv.invoiceNumber || 'invoice'}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success('Invoice PDF downloaded');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'PDF download failed');
    }
  };

  const deleteInvoice = async (inv: any) => {
    try {
      await invoicesApi.delete(inv.id);
      setInvoices(prev => prev.filter(i => i.id !== inv.id));
      toast.success('Invoice deleted');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Delete failed');
    }
  };

  // --- Expenses ---
  const fetchExpenses = useCallback(async () => {
    setIsLoadingExpenses(true);
    if (!isStaffUser) {
      setExpenses([]);
      setExpenseStats({});
      setExpenseCategories([]);
      setIsLoadingExpenses(false);
      return;
    }
    try {
      const params: any = {};
      if (expenseCategoryFilter !== 'all') params.category = expenseCategoryFilter;
      if (selectedRegion !== 'all') params.regionId = selectedRegion;
      const [res, statsRes] = await Promise.all([expensesApi.getAll(params), expensesApi.getStats()]);
      const freshExpenses = extractList(res, ['expenses'], 'expenses');
      setExpenses(freshExpenses);
      const s = statsRes.data.data || {};
      const total = Number(s.overall ?? s.total ?? 0);
      const thisMonth = Number(s.thisMonth ?? s.month ?? 0);
      const count = s.count ?? freshExpenses.length;
      setExpenseStats({ total, thisMonth, count, byCategory: s.byCategory || [] });
      const found = Array.isArray(res.data?.data?.categories) ? res.data.data.categories : (Array.isArray(s?.byCategory) ? s.byCategory.map((c: any) => c.name) : []);
      // Without a fallback the category dropdown could contain only
      // "All Categories" — a filter the user can never apply.
      setExpenseCategories(found.length ? found : EXPENSE_CATEGORIES);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to fetch expenses');
    } finally {
      setIsLoadingExpenses(false);
    }
  }, [expenseCategoryFilter, isStaffUser, selectedRegion]);

  const saveExpense = async () => {
    if (!expenseForm.title.trim()) { toast.error('Title is required'); return; }
    const amount = Number(expenseForm.amount);
    if (isNaN(amount) || amount <= 0) { toast.error('Amount must be a positive number'); return; }
    setExpenseSaving(true);
    try {
      const payload: any = {
        description: expenseForm.title,
        category: expenseForm.category,
        amount: Number(expenseForm.amount),
        expenseDate: expenseForm.date || toLocalDateKey(),
        // paymentMode backend whitelist me nahi — bhejne par 400
        // ("property paymentMode should not exist"). Form me dikhta hai,
        // par API ko nahi bhejte.
      };
      if (expenseForm.notes) payload.notes = expenseForm.notes;
      if (expenseForm.id) {
        await expensesApi.update(expenseForm.id, payload);
        toast.success('Expense updated');
      } else {
        await expensesApi.create(payload);
        toast.success('Expense added');
      }
      setIsExpenseOpen(false);
      setExpenseForm({ title: '', category: 'Transport', amount: '', date: '', paymentMode: 'UPI', notes: '' });
      fetchExpenses();
    } catch (error: any) {
      const msg = error.response?.data?.message || error.response?.data?.error || error.message || 'Failed to save expense';
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setExpenseSaving(false);
    }
  };

  const deleteExpense = async (e: any) => {
    if (!confirm(`Delete "${e.description || e.title}"? This cannot be undone.`)) return;
    try {
      await expensesApi.delete(e.id);
      setExpenses(prev => prev.filter(x => x.id !== e.id));
      toast.success('Expense deleted');
      fetchExpenses();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Delete failed');
    }
  };

  // --- Export ---
  const handleExport = async (type: 'payments' | 'invoices' | 'expenses') => {
    try {
      const res = await exportApi.download(type);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = `${type}-export.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} exported`);
    } catch {
      toast.error('Export failed');
    }
  };

  // Load data
  useEffect(() => {
    fetchPayments();
    fetchLeads();
    fetchQuotations();
  }, [fetchPayments, fetchLeads, fetchQuotations]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  // Period buttons
  const periodButtons: { value: Period; label: string }[] = [
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' },
    { value: 'year', label: 'Year' },
  ];

  // Payment ka region: quotation → lead join. IMPORTANT: list wala full lead
  // PEHLE (usme region hai); nested lead me region nahi hota — wo shadow
  // karke region filter tod deta tha (installations wala hi bug).
  const paymentRegionOf = (p: any) => {
    const pq = (p.quotationId || (p as any).quotation_id) ? quotations.find((x: any) => x.id === (p.quotationId || (p as any).quotation_id)) : undefined;
    const full = leads.find((l: any) => l.id === (p.leadId || (p as any).lead_id || (pq as any)?.leadId || (pq as any)?.lead_id || (pq as any)?.lead?.id));
    const plead = full || (p as any).lead || (pq as any)?.lead;
    return (plead as any)?.region || (plead as any)?.regionId;
  };

  // Filtered data
  const filteredPayments = payments.filter(p => {
    const matchesSearch = (getPaymentClientName(p) || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (p.id || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || sameStatus(p.status, statusFilter);
    // Global region: resolve via quotation → lead join (keep if unclassifiable).
    const matchesRegion = matchRegion(paymentRegionOf(p), true);
    return matchesSearch && matchesStatus && matchesRegion;
  });

  const filteredInvoices = invoices.filter(inv => {
    // Case-insensitive: the filter values and statusBadge keys are lowercase,
    // so a server sending 'PAID'/'SENT' made every filter return nothing and
    // left the badge unstyled.
    const matchesStatus = invoiceStatusFilter === 'all'
      || String(inv.status || '').toLowerCase() === String(invoiceStatusFilter).toLowerCase();
    return matchesStatus;
  });

  const filteredExpenses = expenses.filter(e => {
    const matchesCategory = expenseCategoryFilter === 'all' || e.category === expenseCategoryFilter;
    return matchesCategory;
  });

  // Summary over the selected period (week/month/year) + selected region.
  // Falls back to all payments when none carry a parsable date.
  const periodSummary = useMemo(() => {
    const scoped = selectedRegion === 'all'
      ? payments
      : payments.filter((p) => matchRegion(paymentRegionOf(p), true));
    const { start, end } = getDateRange(period);
    const inRange = scoped.filter(p => {
      const key = toDateInputValue(p.paymentDate || p.createdAt);
      return key && key >= start && key <= end;
    });
    // Fall back to ALL payments only when NO payment carries a parsable date.
    // The old `inRange.length > 0 ? inRange : payments` fell back whenever the
    // selected period was simply empty, so "This Week" could display the
    // entire lifetime ledger as this week's collections.
    const anyDate = scoped.some(p => !!toDateInputValue(p.paymentDate || p.createdAt));
    const list = anyDate ? inRange : scoped;
    const total = list.reduce((acc: number, p: any) => acc + payTotal(p), 0);
    const received = list.reduce((acc: number, p: any) => acc + payReceived(p), 0);
    const pending = total - received;
    const collectionRate = total > 0 ? (received / total) * 100 : 0;
    return {
      totalRevenue: total,
      receivedAmount: received,
      pendingAmount: pending,
      revenueTrend: collectionRate >= 80 ? '+5.2%' : collectionRate >= 60 ? '+2.1%' : collectionRate >= 40 ? '-1.3%' : '-4.7%',
      receivedTrend: total > 0 ? `${((received / total) * 100).toFixed(1)}%` : '0%',
      pendingTrend: total > 0 ? `${((pending / total) * 100).toFixed(1)}%` : '0%',
    };
  }, [payments, period, selectedRegion]);

  return (
    <div className="space-y-6">
      {/* Header with Period Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Payments & Revenue</h1>
          <p className="text-stone-500">Track payments, invoices, and expenses with time-period filters</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          {/* Period Selector */}
          <div className="flex items-center gap-1 bg-stone-100 rounded-lg p-1">
            {periodButtons.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setPeriod(value)}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium rounded-md transition-all",
                  period === value
                    ? "bg-white text-orange-600 shadow-sm"
                    : "text-stone-600 hover:text-stone-900 hover:bg-stone-200"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          {SHOW_PAYMENTS_TAB && (
          <TabsTrigger value="payments">
            <CreditCard className="mr-2 h-4 w-4" /> Payments
          </TabsTrigger>
          )}
          <TabsTrigger value="invoices">
            <FileText className="mr-2 h-4 w-4" /> Invoices
          </TabsTrigger>
          <TabsTrigger value="expenses">
            <Wallet className="mr-2 h-4 w-4" /> Expenses
          </TabsTrigger>
        </TabsList>

        {/* PAYMENTS TAB (filhal hidden) */}
        {SHOW_PAYMENTS_TAB && (
        <TabsContent value="payments">
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Button variant="outline" className="border-stone-200" onClick={() => handleExport('payments')}>
                  <Download size={18} className="mr-2" /> Export Report
                </Button>
                <Dialog open={isRecordDialogOpen} onOpenChange={setIsRecordDialogOpen}>
                  <DialogTrigger asChild onClick={() => openRecordPaymentDialog(recordPaymentData)}> 
                    <Button className="bg-orange-600 hover:bg-orange-700 text-white">
                      <CreditCard size={18} className="mr-2" /> Record Payment
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Record New Payment</DialogTitle>
                      <DialogDescription>Add a payment record for a quotation.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleRecordPayment} className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="quotationId">Select Quotation *</Label>
                        <Select name="quotationId" required>
                          <SelectTrigger id="quotationId">
                            <SelectValue placeholder={quotations.length ? "Select quotation" : "No quotations — create one first"} />
                          </SelectTrigger>
                          <SelectContent>
                            {quotations.map((q: any) => (
                              <SelectItem key={q.id} value={q.id}>
                                {q.lead?.name || q.leadName || 'Quotation'} — {q.systemSize || q.systemSizeKW || 0}KW — ₹{(q.totalCost || q.netAmount || 0).toLocaleString()} ({(q.id || '').slice(0,6)})
                              </SelectItem>
                            ))}
                            {quotations.length === 0 && (
                              <div className="p-2 text-center text-xs text-stone-400">No quotations available — create a quotation first</div>
                            )}
                          </SelectContent>
                        </Select>
                        {quotations.length === 0 && (
                          <p className="text-xs text-amber-600">Create a quotation from the Quotations page before recording a payment.</p>
                        )}
                        <input type="hidden" name="leadId" value="" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="totalAmount">Total Project Amount (₹)</Label>
                          <Input
                            id="totalAmount"
                            name="totalAmount"
                            type="number"
                            placeholder="450000"
                            required
                            min="1"
                            defaultValue={recordPaymentData?.totalAmount || ''}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="receivedAmount">Amount Received (₹)</Label>
                          <Input
                            id="receivedAmount"
                            name="receivedAmount"
                            type="number"
                            placeholder="50000"
                            required
                            min="1"
                            defaultValue={recordPaymentData?.receivedAmount || ''}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="paymentMode">Payment Mode</Label>
                          <Select name="paymentMode" required defaultValue={recordPaymentData?.paymentMethod || 'Online'}>
                            <SelectTrigger id="paymentMode">
                              <SelectValue placeholder="Select mode" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Online">Online</SelectItem>
                              <SelectItem value="Cheque">Cheque</SelectItem>
                              <SelectItem value="Cash">Cash</SelectItem>
                              <SelectItem value="EMI">EMI</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="transactionId">Transaction ID / Ref</Label>
                          <Input
                            id="transactionId"
                            name="transactionId"
                            placeholder="TXN123456"
                            defaultValue={recordPaymentData?.referenceNo || ''}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="notes">Notes</Label>
                        <Input
                          id="notes"
                          name="notes"
                          placeholder="Payment remarks"
                          defaultValue={recordPaymentData?.notes || ''}
                        />
                      </div>
                      <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setIsRecordDialogOpen(false)}>Cancel</Button>
                        <Button type="submit" className="bg-orange-600 hover:bg-orange-700 text-white">Record</Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
                {/* View Payment Details Dialog */}
                <Dialog open={viewPayment !== null} onOpenChange={() => setViewPayment(null)}>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="hidden">
                      <MoreVertical size={16} />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="p-6">
                    <DialogHeader>
                      <DialogTitle>Payment Details</DialogTitle>
                      <DialogDescription>Payment {viewPayment?.id?.substring(0, 6) || ''}</DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-4 mt-4">
                      <div>
                        <Label>Payment ID</Label>
                        <p className="mt-1 font-medium text-stone-500">{viewPayment?.id || '—'}</p>
                      </div>
                      <div>
                        <Label>Client</Label>
                        <p className="mt-1 font-medium text-stone-500">{viewPayment ? getPaymentClientName(viewPayment) : '—'}</p>
                      </div>
                      <div>
        <Label>Total Amount</Label>
        <p className="mt-1 font-medium text-stone-500">₹{(payTotal(viewPayment)).toLocaleString()}</p>
      </div>
      <div>
        <Label>Received</Label>
        <p className="mt-1 font-medium text-stone-500">₹{(payReceived(viewPayment)).toLocaleString()}</p>
      </div>
      <div>
        <Label>Pending</Label>
        <p className="mt-1 font-medium text-stone-500">₹{(payTotal(viewPayment) - payReceived(viewPayment)).toLocaleString()}</p>
      </div>
      <div>
        <Label>Status</Label>
        <p className="mt-1 font-medium text-stone-500">{viewPayment?.status || '—'}</p>
      </div>
      <div>
        <Label>Payment Method</Label>
        <p className="mt-1 font-medium text-stone-500">{viewPayment?.paymentMethod || '—'}</p>
      </div>
      <div>
        <Label>Date</Label>
        <p className="mt-1 font-medium text-stone-500">{new Date(viewPayment?.createdAt || Date.now()).toLocaleDateString()}</p>
      </div>
    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setViewPayment(null)}>Close</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                {/* Delete Payment — only reachable for PENDING / PARTIAL. */}
                <Dialog
                  open={!!deletePaymentId}
                  onOpenChange={(o) => { if (!o && !deletePaymentLoading) setDeletePaymentId(null); }}
                >
                  <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                      <DialogTitle>Delete Payment</DialogTitle>
                      <DialogDescription>
                        Is payment record ko permanently delete karein? Ye action undo nahi hoga.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setDeletePaymentId(null)} disabled={deletePaymentLoading}>
                        Cancel
                      </Button>
                      <Button variant="destructive" onClick={handleDeletePayment} disabled={deletePaymentLoading}>
                        {deletePaymentLoading && <Loader2 size={16} className="mr-2 animate-spin" />}
                        Delete
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { title: 'Total Revenue', value: `₹${Math.max(0, periodSummary.totalRevenue / 100000).toFixed(1)}L`, icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50', trend: periodSummary.receivedTrend },
                { title: 'Received Amount', value: `₹${Math.max(0, periodSummary.receivedAmount / 100000).toFixed(1)}L`, icon: CheckCircle2, color: 'text-blue-600', bg: 'bg-blue-50', trend: periodSummary.receivedTrend },
                { title: 'Pending Amount', value: `₹${Math.max(0, periodSummary.pendingAmount / 100000).toFixed(1)}L`, icon: Clock, color: 'text-orange-600', bg: 'bg-orange-50', trend: periodSummary.pendingTrend },
              ].map((item) => (
                <Card key={item.title} className="border-stone-200 shadow-sm">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className={`p-2 rounded-lg ${item.bg} ${item.color}`}>
                        <item.icon size={24} />
                      </div>
                      {/* These are shares of the period, not period-over-period
                          growth — a green up-arrow on a "revenue trend" read as
                          growth that this page never actually computes. */}
                      <div className="flex items-center gap-1 text-xs font-medium text-stone-500">
                        {item.trend} of total
                      </div>
                    </div>
                    <div className="mt-4">
                      <p className="text-sm font-medium text-stone-500">{item.title}</p>
                      <p className="text-2xl font-bold text-stone-900">{item.value}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Payments Table */}
            <Card className="border-stone-200 shadow-sm">
              <CardHeader className="p-4 border-b border-stone-100">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
                    <Input 
                      placeholder="Search by client or payment ID..." 
                      className="pl-10 h-10 border-stone-200 focus-visible:ring-orange-500"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-[150px] h-10 border-stone-200">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Status</SelectItem>
                          {PAYMENT_STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>
                          ))}
                        </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-stone-50">
                      <TableHead>Payment ID</TableHead>
                      <TableHead>Client Name</TableHead>
                      <TableHead>Total Amount</TableHead>
                      <TableHead>Received</TableHead>
                      <TableHead>Pending</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoadingPayments ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-64 text-center">
                          <div className="flex flex-col items-center justify-center text-stone-400">
                            <Loader2 size={48} className="mb-4 animate-spin opacity-20" />
                            <p className="text-lg font-medium">Loading payments...</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : filteredPayments.length > 0 ? (
                      filteredPayments.map((pay) => (
                        <TableRow key={pay.id}>
                          <TableCell className="font-medium">{(pay.id || '').substring(0, 8)}</TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-semibold">{getPaymentClientName(pay)}</span>
                              <span className="text-xs text-stone-500">
                                {new Date(pay.createdAt || Date.now()).toLocaleDateString()} • {pay.paymentMethod || pay.paymentMode || '—'}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="font-semibold">₹{(payTotal(pay)).toLocaleString()}</TableCell>
                          <TableCell className="text-green-600 font-medium">₹{(payReceived(pay)).toLocaleString()}</TableCell>
                          <TableCell className="text-red-600 font-medium">₹{(payTotal(pay) - payReceived(pay)).toLocaleString()}</TableCell>
                          <TableCell>
                            <Badge className={cn(
                              "font-medium",
                              sameStatus(pay.status, 'COMPLETED') && "bg-green-100 text-green-700 hover:bg-green-100",
                              sameStatus(pay.status, 'PARTIAL') && "bg-yellow-100 text-yellow-700 hover:bg-yellow-100",
                              sameStatus(pay.status, 'PENDING') && "bg-red-100 text-red-700 hover:bg-red-100",
                            )}>
                              {statusLabel(pay.status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreVertical size={16} />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuLabel className="text-xs text-stone-500">Actions</DropdownMenuLabel>
                                <DropdownMenuItem
                                  className="cursor-pointer"
                                  onClick={async () => {
                                    // Single-fetch: show the stored record, not the
                                    // possibly stale row.
                                    const fresh = await fetchPaymentById(pay.id);
                                    setViewPayment({ ...pay, ...(fresh || {}) });
                                  }}
                                >
                                  <ChevronRight size={14} className="mr-2" /> View Details
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuLabel className="text-xs text-stone-500">Update Status</DropdownMenuLabel>
                                {PAYMENT_STATUSES.map((st) => (
                                  <DropdownMenuItem
                                    key={st}
                                    className="cursor-pointer"
                                    disabled={sameStatus(pay.status, st)}
                                    onClick={async () => {
                                      try {
                                        await paymentsApi.update(pay.id, { status: st });
                                        toast.success(`Status → ${statusLabel(st)} (dashboard + analytics auto-refresh)`);
                                        const fresh = await fetchPaymentById(pay.id);
                                        if (fresh) setPayments((prev) => prev.map((p) => (p.id === pay.id ? { ...p, ...fresh } : p)));
                                        else fetchPayments();
                                      } catch (error: any) {
                                        toast.error(apiMessage(error, 'Failed to update status'));
                                      }
                                    }}
                                  >
                                    <ChevronRight size={14} className="mr-2" /> {statusLabel(st)}
                                    {sameStatus(pay.status, st) && <span className="ml-auto text-[10px] text-stone-400">current</span>}
                                  </DropdownMenuItem>
                                ))}
                                <DropdownMenuSeparator />
                                {/* DELETE /payments/:id is allowed only while the
                                    payment is PENDING or PARTIAL. A COMPLETED
                                    payment needs a reversal, which is Phase-2
                                    (POST /payments/:id/reverse). Firing the
                                    delete anyway just produced a 409, so the
                                    item is disabled with the reason spelled out. */}
                                {isPaymentDeletable(pay.status) ? (
                                  <DropdownMenuItem
                                    className="cursor-pointer text-red-600"
                                    onClick={() => setDeletePaymentId(pay.id)}
                                  >
                                    <Trash2 size={14} className="mr-2" /> Delete Payment
                                  </DropdownMenuItem>
                                ) : (
                                  // A disabled Radix item swallows pointer events,
                                  // so the reason lives on a wrapper's title
                                  // attribute — same pattern the icon buttons use.
                                  <div title="reversal coming soon">
                                    <DropdownMenuItem
                                      disabled
                                      aria-disabled="true"
                                      className="text-stone-400 opacity-70 cursor-not-allowed"
                                    >
                                      <Trash2 size={14} className="mr-2" /> Delete Payment
                                    </DropdownMenuItem>
                                  </div>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : payments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-64 text-center text-stone-400">
                          <p className="text-lg font-medium">No payments recorded yet</p>
                          <p className="text-sm mt-1">Record Payment se pehli entry karo — table yahi dikhegi.</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      <TableRow>
                        <TableCell colSpan={7} className="h-64 text-center text-stone-400">
                          <p className="text-lg font-medium">{payments.length} payment{payments.length > 1 ? 's' : ''} hidden by filters</p>
                          <p className="text-sm mt-1">Search / status / region filter me fas rahe hain{selectedRegion !== 'all' ? ` (region: ${selectedRegion})` : ''}.</p>
                          <Button variant="outline" size="sm" className="mt-3" onClick={clearPaymentFilters}>Clear all filters</Button>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        )}

        {/* INVOICES TAB */}
        <TabsContent value="invoices">
          <div className="space-y-5">
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <div className="md:ml-auto flex items-center gap-2">
                <Select value={invoiceStatusFilter} onValueChange={setInvoiceStatusFilter}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    {INVOICE_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={() => handleExport('invoices')}>Export</Button>
                <Button onClick={() => { setInvoiceForm({ customerId: '', customerName: '', amount: '', dueDate: '', status: 'draft', issuedDate: '' }); setIsInvoiceOpen(true); }}>
                  <Plus size={16} className="mr-1" /> New Invoice
                </Button>
              </div>
            </div>

            {/* Invoice Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Card><CardContent className="flex items-center gap-3 p-4">
                <div className="h-10 w-10 rounded-lg bg-orange-50 flex items-center justify-center"><Receipt size={18} className="text-orange-600" /></div>
                <div><p className="text-2xl font-bold">₹{Number(aging?.totalOutstanding || 0).toLocaleString('en-IN')}</p><p className="text-xs text-stone-500">Total outstanding</p></div>
              </CardContent></Card>
              <Card><CardContent className="flex items-center gap-3 p-4">
                <div className="h-10 w-10 rounded-lg bg-red-50 flex items-center justify-center"><AlertCircle size={18} className="text-red-600" /></div>
                <div><p className="text-2xl font-bold">{aging?.overdueCount ?? 0}</p><p className="text-xs text-stone-500">Overdue invoices</p></div>
              </CardContent></Card>
              <Card><CardContent className="flex items-center gap-3 p-4">
                <div className="h-10 w-10 rounded-lg bg-green-50 flex items-center justify-center"><CheckCircle2 size={18} className="text-green-600" /></div>
                <div><p className="text-2xl font-bold">{invoices.filter(i => String(i.status || '').toLowerCase() === 'paid').length}</p><p className="text-xs text-stone-500">Paid invoices</p></div>
              </CardContent></Card>
            </div>

            {aging?.buckets?.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm font-semibold mb-3">Aging Summary</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {aging.buckets.map((b: any) => (
                      <div key={b.label} className="rounded-lg border p-3">
                        <p className="text-xs text-stone-400">{b.label}</p>
                        <p className="text-lg font-bold">₹{Number(b.amount).toLocaleString('en-IN')}</p>
                        <p className="text-xs text-stone-400">{b.count ?? 0} invoice(s)</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="p-0">
                {isLoadingInvoices ? (
                  <div className="py-16 flex justify-center"><Loader2 size={32} className="animate-spin opacity-30" /></div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">GST (18%)</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredInvoices.map(inv => (
                        <TableRow key={inv.id}>
                          <TableCell className="font-medium">{inv.number || inv.invoiceNumber}</TableCell>
                          <TableCell>{inv.customer?.name || inv.customerName}</TableCell>
                          <TableCell className="text-right">₹{Number(inv.subtotal ?? inv.amount ?? 0).toLocaleString('en-IN')}</TableCell>
                          <TableCell className="text-right text-stone-500">₹{Number(inv.taxAmount ?? inv.gstAmount ?? 0).toLocaleString('en-IN')}</TableCell>
                          <TableCell className="text-right font-semibold">₹{Number(inv.total ?? inv.totalAmount ?? 0).toLocaleString('en-IN')}</TableCell>
                          <TableCell><Badge className={statusBadge[String(inv.status || '').toLowerCase()] || ''}>{inv.status}</Badge></TableCell>
                          <TableCell className="text-sm">{(inv.dueDate || '—').slice(0, 10)}</TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            <Button variant="ghost" size="sm" title="Download PDF" onClick={() => downloadInvoicePdf(inv)}><Download size={15} /></Button>
                            <Button variant="ghost" size="sm" title="Payment link" onClick={() => generateInvoiceLink(inv)}><Link2 size={15} /></Button>
                            <Select value={inv.status} onValueChange={v => updateInvoiceStatus(inv, v)}>
                              <SelectTrigger className="w-24 h-7 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {INVOICE_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <Button variant="ghost" size="sm" onClick={() => { setInvoiceForm({ id: inv.id, customerId: inv.customerId, customerName: inv.customer?.name || '', amount: String(inv.subtotal ?? inv.amount), dueDate: (inv.dueDate || '').slice(0, 10), issuedDate: (inv.issuedDate || '').slice(0, 10), status: inv.status }); setIsInvoiceOpen(true); }}><Pencil size={15} /></Button>
                            <Button variant="ghost" size="sm" onClick={() => deleteInvoice(inv)}><Trash2 size={15} className="text-red-500" /></Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {invoices.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-stone-400 py-8">No invoices found</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Dialog open={isInvoiceOpen} onOpenChange={setIsInvoiceOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{invoiceForm.id ? 'Edit Invoice' : 'New Invoice'}</DialogTitle>
                  <DialogDescription>Amount is exclusive of 18% GST, added automatically.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Customer *</Label>
                    <Select value={invoiceForm.customerId} onValueChange={v => setInvoiceForm({ ...invoiceForm, customerId: v })}>
                      <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                      <SelectContent>
                        {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Amount (excl. GST) *</Label>
                      <Input type="number" value={invoiceForm.amount || ''} onChange={e => setInvoiceForm({ ...invoiceForm, amount: e.target.value })} min="0.01" step="0.01" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Status</Label>
                      <Select value={invoiceForm.status} onValueChange={v => setInvoiceForm({ ...invoiceForm, status: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{INVOICE_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Issue Date</Label>
                      <Input type="date" value={invoiceForm.issuedDate || ''} onChange={e => setInvoiceForm({ ...invoiceForm, issuedDate: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Due Date</Label>
                      <Input type="date" value={invoiceForm.dueDate || ''} onChange={e => setInvoiceForm({ ...invoiceForm, dueDate: e.target.value })} />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsInvoiceOpen(false)}>Cancel</Button>
                  <Button onClick={saveInvoice} disabled={invoiceSaving}>{invoiceSaving ? <Loader2 size={15} className="animate-spin" /> : 'Save Invoice'}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </TabsContent>

        {/* EXPENSES TAB */}
        <TabsContent value="expenses">
          <div className="space-y-5">
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <div className="md:ml-auto flex items-center gap-2">
                <Select value={expenseCategoryFilter} onValueChange={setExpenseCategoryFilter}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {expenseCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={() => handleExport('expenses')}><Download size={15} className="mr-1" /> Export</Button>
                <Button onClick={() => { setExpenseForm({ title: '', category: 'Transport', amount: '', date: '', paymentMode: 'UPI', notes: '' }); setIsExpenseOpen(true); }}>
                  <Plus size={16} className="mr-1" /> Add Expense
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Card><CardContent className="flex items-center gap-3 p-4">
                <div className="h-10 w-10 rounded-lg bg-orange-50 flex items-center justify-center"><Wallet size={18} className="text-orange-600" /></div>
                <div><p className="text-2xl font-bold">₹{Number(expenseStats.total || 0).toLocaleString('en-IN')}</p><p className="text-xs text-stone-500">Total expenses</p></div>
              </CardContent></Card>
              <Card><CardContent className="flex items-center gap-3 p-4">
                <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center"><TrendingUp size={18} className="text-blue-600" /></div>
                <div><p className="text-2xl font-bold">₹{Number(expenseStats.thisMonth || 0).toLocaleString('en-IN')}</p><p className="text-xs text-stone-500">This month</p></div>
              </CardContent></Card>
              <Card><CardContent className="flex items-center gap-3 p-4">
                <div className="h-10 w-10 rounded-lg bg-green-50 flex items-center justify-center"><CalendarRange size={18} className="text-green-600" /></div>
                <div><p className="text-2xl font-bold">{expenseStats.count || 0}</p><p className="text-xs text-stone-500">Expense entries</p></div>
              </CardContent></Card>
            </div>

            <Card>
              <CardContent className="p-0">
                {isLoadingExpenses ? (
                  <div className="py-16 flex justify-center"><Loader2 size={32} className="animate-spin opacity-30" /></div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Title</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Payment Mode</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredExpenses.map(e => (
                        <TableRow key={e.id}>
                          <TableCell>
                            <p className="font-medium">{e.description || e.title}</p>
                            {e.notes && <p className="text-xs text-stone-400 truncate max-w-[220px]">{e.notes}</p>}
                          </TableCell>
                          <TableCell><Badge variant="outline">{e.category}</Badge></TableCell>
                          <TableCell className="text-sm">{(e.expenseDate || e.date || '').slice(0, 10) || '—'}</TableCell>
                          <TableCell className="text-sm">{e.paymentMode || '—'}</TableCell>
                          <TableCell className="text-right font-semibold">₹{Number(e.amount).toLocaleString('en-IN')}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" onClick={() => { setExpenseForm({ ...e, title: e.description || e.title || '', amount: String(e.amount), date: (e.expenseDate || '').slice(0, 10), category: e.category || 'Transport', paymentMode: e.paymentMode || 'UPI', notes: e.notes || '' }); setIsExpenseOpen(true); }}><Pencil size={15} /></Button>
                            <Button variant="ghost" size="sm" onClick={() => deleteExpense(e)}><Trash2 size={15} className="text-red-500" /></Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {expenses.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-stone-400 py-8">No expenses found</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            

            <Dialog open={isExpenseOpen} onOpenChange={setIsExpenseOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{expenseForm.id ? 'Edit Expense' : 'Add Expense'}</DialogTitle>
                  <DialogDescription>Record an operational spend.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Title *</Label>
                    <Input value={expenseForm.title || ''} onChange={e => setExpenseForm({ ...expenseForm, title: e.target.value })} placeholder="e.g. Team transport" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Category</Label>
                      <Select value={expenseForm.category} onValueChange={v => setExpenseForm({ ...expenseForm, category: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{expenseCategories.length ? expenseCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>) : EXPENSE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Amount (₹) *</Label>
                      <Input type="number" value={expenseForm.amount || ''} onChange={e => setExpenseForm({ ...expenseForm, amount: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Date</Label>
                      <Input type="date" value={expenseForm.date || ''} onChange={e => setExpenseForm({ ...expenseForm, date: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Payment Mode</Label>
                      <Select value={expenseForm.paymentMode} onValueChange={v => setExpenseForm({ ...expenseForm, paymentMode: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {['UPI', 'Cash', 'Bank Transfer', 'Online', 'Card'].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Notes</Label>
                    <Input value={expenseForm.notes || ''} onChange={e => setExpenseForm({ ...expenseForm, notes: e.target.value })} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsExpenseOpen(false)}>Cancel</Button>
                  <Button onClick={saveExpense} disabled={expenseSaving}>{expenseSaving ? <Loader2 size={15} className="animate-spin" /> : 'Save Expense'}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PaymentRevenue;