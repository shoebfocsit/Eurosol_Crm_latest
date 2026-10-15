import React, { useState, useEffect } from 'react';
import { 
  Search, Phone, Mail, MapPin, Calendar, CheckSquare, MessageSquare, RefreshCw, Loader2, ArrowRight, CheckCircle2, Clock
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../ui/dialog';
import { webApi } from '../../services/api';
import { websiteInquiriesApi } from '../../services/api'; // real /website-inquiries store (same one the website writes to)
import { toast } from 'sonner';

interface WebInquiry {
  id: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  status: string;
  createdAt: string;
}

interface WebLead {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  city: string;
  serviceType: 'Installation' | 'Maintenance' | 'Custom Design' | 'Solar Audit' | 'General Inquiry';
  message: string;
  status: 'new' | 'contacted' | 'converted' | 'closed';
  createdAt: string;
}

const ContactLeadsManager: React.FC = () => {
  // Navigation sub-section state
  const [subSection, setSubSection] = useState<'leads' | 'inquiries'>('leads');
  
  // Data State
  const [leads, setLeads] = useState<WebLead[]>([]);
  const [inquiries, setInquiries] = useState<WebInquiry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Search Term
  const [searchTerm, setSearchTerm] = useState('');
  
  // Filters for Web Leads
  const [leadStatusFilter, setLeadStatusFilter] = useState<string>('all');
  const [serviceTypeFilter, setServiceTypeFilter] = useState<string>('all');
  
  // Filters for Website Inquiries
  const [inquiryStatusFilter, setInquiryStatusFilter] = useState<string>('all');

  // Dialog & Form states for Contact Leads
  const [isLeadDialogOpen, setIsLeadDialogOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<WebLead | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [leadStatus, setLeadStatus] = useState<'new' | 'contacted' | 'converted' | 'closed'>('new');
  const [leadComment, setLeadComment] = useState('');

  // Action states for Inquiries
  const [actioningInquiryId, setActioningInquiryId] = useState<string | null>(null);

  // Legacy web-contact leads: server-side unconverted count + per-row convert.
  const [unconvertedCount, setUnconvertedCount] = useState<number | null>(null);
  const [convertingLeadId, setConvertingLeadId] = useState<string | null>(null);

  const fetchLeadsOnly = async () => {
    try {
      const resp = await webApi.getContactLeads({
        status: leadStatusFilter !== 'all' ? leadStatusFilter : undefined,
        serviceType: serviceTypeFilter !== 'all' ? serviceTypeFilter : undefined,
      });
      const data = resp.data.data?.leads || resp.data.leads || resp.data.data || resp.data;
      setLeads(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to fetch contact form leads');
    }
  };

  const fetchInquiriesOnly = async () => {
    try {
      let data: any;
      try {
        // Primary: the real website-inquiries store that the public
        // contact form POSTs to (GET /website-inquiries).
        const resp = await websiteInquiriesApi.getAll();
        data = resp.data.data?.inquiries || resp.data.inquiries || resp.data.data?.leads || resp.data.leads || resp.data.data || resp.data;
      } catch {
        // Fallback: legacy web-contact leads (keeps the tab working if the
        // inquiries route is ever unavailable).
        const resp = await webApi.getContactLeads();
        data = resp.data.data?.leads || resp.data.leads || resp.data.data || resp.data;
      }
      // Map either store shape to the inquiry table shape. Website inquiries
      // carry `isConverted` instead of a status string — derive it.
      const mapped = Array.isArray(data)
        ? data.map((d: any) => ({
            id: d.id,
            name: d.fullName || d.name || 'Anonymous',
            email: d.email || '',
            phone: d.phone || '',
            message: d.message || '',
            status: d.status || (d.isConverted || d.convertedLeadId ? 'converted to lead' : 'new'),
            createdAt: d.createdAt || new Date().toISOString(),
          }))
        : [];
      setInquiries(mapped);
    } catch (err) {
      console.error(err);
      setInquiries([]);
    }
  };

  const fetchAllData = async (showToast = false) => {
    setIsLoading(true);
    try {
      await Promise.all([
        fetchLeadsOnly(),
        fetchInquiriesOnly()
      ]);
      // Best-effort server count of unconverted legacy leads (silent on failure).
      webApi.getUnconvertedCount()
        .then((r: any) => {
          const d = r.data?.data ?? r.data;
          const n = typeof d === 'number' ? d : Number(d?.count ?? d?.unconverted ?? d?.total);
          if (!isNaN(n)) setUnconvertedCount(n);
        })
        .catch(() => {});
      if (showToast) {
        toast.success('Forms list updated successfully!');
      }
    } catch (err) {
      toast.error('Failed to fetch public submission entries');
    } finally {
      setIsLoading(false);
    }
  };

  // Re-fetch on filter changes
  useEffect(() => {
    fetchLeadsOnly();
  }, [leadStatusFilter, serviceTypeFilter]);

  // Load initial data
  useEffect(() => {
    fetchAllData();
  }, []);

  // Handle Edit/Qualify Dialog for Leads
  const openEditLeadDialog = (lead: WebLead) => {
    setSelectedLead(lead);
    setLeadStatus(lead.status || 'new');
    setLeadComment(lead.message || '');
    setIsLeadDialogOpen(true);
  };

  const handleUpdateLeadStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead) return;

    setIsSubmitting(true);
    try {
      await webApi.updateContactLead(selectedLead.id, {
        status: leadStatus,
        message: leadComment
      });
      toast.success('Lead status and remarks updated successfully!');
      setIsLeadDialogOpen(false);
      fetchLeadsOnly();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error updating lead details');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Convert Inquiry to CRM Lead
  const handleConvertInquiry = async (id: string) => {
    setActioningInquiryId(id);
    try {
      await websiteInquiriesApi.convertToLead(id);
      toast.success('Inquiry successfully converted to regular CRM Lead!');
      await fetchInquiriesOnly();
    } catch (err) {
      toast.error('Failed to convert inquiry to CRM lead');
    } finally {
      setActioningInquiryId(null);
    }
  };

  // Handle Convert legacy web-contact lead to CRM Lead (POST /web/contact/leads/:id/convert).
  const handleConvertLead = async (id: string) => {
    setConvertingLeadId(id);
    try {
      const res: any = await webApi.convertContactLead(id);
      const msg = res?.data?.message;
      toast.success(typeof msg === 'string' && msg ? msg : 'Lead converted to CRM!');
      await fetchLeadsOnly();
    } catch (err: any) {
      const raw = err?.response?.data?.message || 'Failed to convert lead';
      toast.error(Array.isArray(raw) ? raw.join(', ') : raw);
    } finally {
      setConvertingLeadId(null);
    }
  };

  // Client-side filtering logic
  const filteredLeads = leads.filter(l => {
    const term = searchTerm.toLowerCase();
    const nameMatch = (l.fullName || '').toLowerCase().includes(term);
    const emailMatch = (l.email || '').toLowerCase().includes(term);
    const phoneMatch = (l.phone || '').toLowerCase().includes(term);
    const cityMatch = (l.city || '').toLowerCase().includes(term);
    
    // Status and Service filters are already handled by server params or can fallback here
    return nameMatch || emailMatch || phoneMatch || cityMatch;
  });

  const filteredInquiries = inquiries.filter(i => {
    const term = searchTerm.toLowerCase();
    const nameMatch = (i.name || '').toLowerCase().includes(term);
    const emailMatch = (i.email || '').toLowerCase().includes(term);
    const phoneMatch = (i.phone || '').toLowerCase().includes(term);
    const messageMatch = (i.message || '').toLowerCase().includes(term);
    
    // Client-side inquiry status filter
    const matchesStatus = inquiryStatusFilter === 'all' || 
      (inquiryStatusFilter === 'new' && (i.status || '').toLowerCase() === 'new') ||
      (inquiryStatusFilter === 'converted' && (i.status || '').toLowerCase().includes('convert'));

    return (nameMatch || emailMatch || phoneMatch || messageMatch) && matchesStatus;
  });

  return (
    <div className="space-y-4">
      {/* Overview Stat Cards specifically for Web Submissions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-stone-200 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-55 text-orange-600 bg-orange-50">
                <MessageSquare size={18} />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">Total Contact Leads</p>
                <p className="text-xl font-bold text-stone-950 font-mono">{leads.length}</p>
              </div>
            </div>
            <div className="text-xs bg-orange-100 text-orange-850 px-2.5 py-1 rounded-full font-medium">
              {unconvertedCount ?? leads.filter(l => l.status === 'new').length} New
            </div>
          </CardContent>
        </Card>

        <Card className="border-stone-200 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-55 text-blue-600 bg-blue-50">
                <Mail size={18} />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">Total Site Inquiries</p>
                <p className="text-xl font-bold text-stone-950 font-mono">{inquiries.length}</p>
              </div>
            </div>
            <div className="text-xs bg-blue-105 text-blue-800 bg-blue-50 px-2.5 py-1 rounded-full font-medium">
              {inquiries.filter(i => (i.status || '').toLowerCase() === 'new').length} Pending
            </div>
          </CardContent>
        </Card>

        <Card className="border-stone-200 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-55 text-emerald-600 bg-emerald-50">
                <CheckCircle2 size={18} />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">Converted To CRM</p>
                <p className="text-xl font-bold text-stone-950 font-mono">
                  {leads.filter(l => l.status === 'converted').length + inquiries.filter(i => (i.status || '').toLowerCase().includes('convert')).length}
                </p>
              </div>
            </div>
            <span className="text-xs text-stone-500 font-medium">Auto-synced</span>
          </CardContent>
        </Card>
      </div>

      <Card className="border-stone-200 shadow-sm">
        <CardHeader className="p-4 border-b border-stone-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-stone-50/50">
          <div>
            <CardTitle className="text-base font-bold text-stone-900">Web Submissions Hub</CardTitle>
            <CardDescription className="text-stone-500 text-xs">Manage submissions from website forms. Qualify requests or convert general chats to leads.</CardDescription>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            {/* Unified Selector Buttons */}
            <div className="flex bg-stone-100/90 p-1 rounded-lg border border-stone-200/60 shadow-inner">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSubSection('leads');
                  setSearchTerm('');
                }}
                className={`h-8 text-xs font-semibold px-4 transition-all duration-205 py-1 ${
                  subSection === 'leads' 
                    ? "bg-card text-stone-950 shadow-sm hover:bg-card" 
                    : "text-stone-600 hover:text-stone-900"
                }`}
              >
                <MessageSquare size={13} className="mr-1.5" />
                Contact Leads ({leads.length})
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSubSection('inquiries');
                  setSearchTerm('');
                }}
                className={`h-8 text-xs font-semibold px-4 transition-all duration-205 py-1 ${
                  subSection === 'inquiries' 
                    ? "bg-card text-stone-950 shadow-sm hover:bg-card" 
                    : "text-stone-600 hover:text-stone-900"
                }`}
              >
                <Mail size={13} className="mr-1.5" />
                Website Inquiries ({inquiries.length})
              </Button>
            </div>

            <Button variant="outline" size="sm" onClick={() => fetchAllData(true)} className="h-9 border-stone-200 text-stone-600 font-medium gap-1 text-xs">
              <RefreshCw size={12} /> Reload
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          
          {/* Dynamic Filters Area depending on active sub-section */}
          <div className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-stone-100 bg-card/50">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={16} />
              <Input 
                placeholder={
                  subSection === 'leads' 
                    ? "Search leads by name, email, phone, city..." 
                    : "Search inquiries by name, email, query..."
                }
                className="pl-9 h-10 border-stone-200 text-xs text-stone-800 placeholder-stone-400 focus-visible:ring-orange-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {subSection === 'leads' ? (
              /* Leads Filter Panel */
              <div className="flex flex-wrap items-center gap-4 text-xs mt-2 lg:mt-0">
                <div className="flex items-center gap-2">
                  <span className="text-stone-500 font-medium whitespace-nowrap">Status:</span>
                  <select
                    className="h-9 border border-stone-200 rounded-md px-2 bg-card text-xs font-medium text-stone-700 focus:outline-none focus:ring-1 focus:ring-orange-500"
                    value={leadStatusFilter}
                    onChange={(e) => setLeadStatusFilter(e.target.value)}
                  >
                    <option value="all">All Statuses</option>
                    <option value="new">New Inbox</option>
                    <option value="contacted">Contacted</option>
                    <option value="converted">Converted</option>
                    <option value="closed">Closed / Expired</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-stone-500 font-medium whitespace-nowrap">Service Type:</span>
                  <select
                    className="h-9 border border-stone-200 rounded-md px-2 bg-card text-xs font-medium text-stone-700 focus:outline-none focus:ring-1 focus:ring-orange-500"
                    value={serviceTypeFilter}
                    onChange={(e) => setServiceTypeFilter(e.target.value)}
                  >
                    <option value="all">All Services</option>
                    <option value="Installation">Installation</option>
                    <option value="Maintenance">Maintenance</option>
                    <option value="Custom Design">Custom Design</option>
                    <option value="Solar Audit">Solar Audit</option>
                    <option value="General Inquiry">General Inquiry</option>
                  </select>
                </div>
              </div>
            ) : (
              /* Inquiries Filter Panel */
              <div className="flex flex-wrap items-center gap-4 text-xs mt-2 lg:mt-0">
                <div className="flex items-center gap-2">
                  <span className="text-stone-500 font-medium whitespace-nowrap">Conversion Status:</span>
                  <select
                    className="h-9 border border-stone-200 rounded-md px-2 bg-card text-xs font-medium text-stone-700 focus:outline-none focus:ring-1 focus:ring-orange-500"
                    value={inquiryStatusFilter}
                    onChange={(e) => setInquiryStatusFilter(e.target.value)}
                  >
                    <option value="all">All Submissions</option>
                    <option value="new">New Inquiries</option>
                    <option value="converted">Converted to CRM Lead</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Table content rendering */}
          {subSection === 'leads' ? (
            /* ========================================================
               LEADS TABLE 
               ========================================================= */
            <Table>
              <TableHeader>
                <TableRow className="bg-stone-50">
                  <TableHead className="text-xs font-bold text-stone-600">Sender Name</TableHead>
                  <TableHead className="text-xs font-bold text-stone-600">Contact Details</TableHead>
                  <TableHead className="text-xs font-bold text-stone-600">Location & Date</TableHead>
                  <TableHead className="text-xs font-bold text-stone-600">Service Category</TableHead>
                  <TableHead className="text-xs font-bold text-stone-600">Lead Query Notes</TableHead>
                  <TableHead className="text-xs font-bold text-stone-600">Current Status</TableHead>
                  <TableHead className="text-xs font-bold text-stone-600 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-48 text-center">
                      <div className="flex flex-col items-center justify-center text-stone-400 py-6">
                        <Loader2 size={24} className="animate-spin mb-2" />
                        <span className="text-xs">Synchronizing inbox channels...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredLeads.length > 0 ? (
                  filteredLeads.map((lead) => (
                    <TableRow key={lead.id} className="hover:bg-stone-50/50">
                      <TableCell className="font-semibold text-stone-900 text-xs">{lead.fullName}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5 text-xs text-stone-600">
                          <span className="flex items-center gap-1 font-mono"><Phone size={10} className="text-stone-400" /> {lead.phone}</span>
                          <span className="flex items-center gap-1 text-stone-505"><Mail size={10} className="text-stone-400" /> {lead.email}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col text-xs text-stone-600 gap-0.5">
                          <span className="font-medium text-stone-700 flex items-center gap-1"><MapPin size={10} className="text-stone-400" /> {lead.city}</span>
                          <span className="text-stone-400 flex items-center gap-1 font-mono"><Calendar size={10} className="text-stone-400" /> {new Date(lead.createdAt || Date.now()).toLocaleDateString()}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-indigo-600 border-indigo-200 bg-indigo-50/20 text-[10px]">
                          {lead.serviceType}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <p className="text-xs text-stone-650 truncate" title={lead.message}>
                          {lead.message || <span className="text-stone-300 italic">No notes</span>}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge className={`border-none h-5 text-[10px] uppercase font-bold tracking-wider ${
                          lead.status === 'new' ? 'bg-blue-105 text-blue-700 bg-blue-50' :
                          lead.status === 'contacted' ? 'bg-amber-105 text-amber-700 bg-amber-50' :
                          lead.status === 'converted' ? 'bg-green-105 text-green-700 bg-green-50' :
                          'bg-stone-105 text-stone-700 bg-stone-50'
                        }`}>
                          {lead.status === 'new' ? 'New Submission' : lead.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {lead.status !== 'converted' && (
                            <Button
                              onClick={() => handleConvertLead(lead.id)}
                              variant="outline"
                              size="sm"
                              disabled={convertingLeadId === lead.id}
                              className="h-8 text-green-700 border-green-200 hover:bg-green-50 gap-1 text-xs"
                              title="Convert to CRM lead"
                            >
                              {convertingLeadId === lead.id ? <Loader2 size={12} className="animate-spin" /> : <ArrowRight size={12} />} Convert
                            </Button>
                          )}
                          <Button 
                            onClick={() => openEditLeadDialog(lead)} 
                            variant="outline" 
                            size="sm" 
                            className="h-8 text-orange-600 border-orange-200 hover:bg-orange-50 hover:text-orange-700 gap-1 text-xs"
                          >
                            <CheckSquare size={12} /> Qualify
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-stone-400 text-xs">
                      No prospective contact leads match current filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          ) : (
            /* ========================================================
               WEBSITE INQUIRIES TABLE 
               ========================================================= */
            <Table>
              <TableHeader>
                <TableRow className="bg-stone-50">
                  <TableHead className="text-xs font-bold text-stone-600">Visitor Name</TableHead>
                  <TableHead className="text-xs font-bold text-stone-600">Contact Channels</TableHead>
                  <TableHead className="text-xs font-bold text-stone-600">Inquiry Text</TableHead>
                  <TableHead className="text-xs font-bold text-stone-600">Received On</TableHead>
                  <TableHead className="text-xs font-bold text-stone-600">Conversion</TableHead>
                  <TableHead className="text-xs font-bold text-stone-600 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-48 text-center">
                      <div className="flex flex-col items-center justify-center text-stone-400 py-6">
                        <Loader2 size={24} className="animate-spin mb-2" />
                        <span className="text-xs">Fetching inquiry pipeline entries...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredInquiries.length > 0 ? (
                  filteredInquiries.map((inq) => (
                    <TableRow key={inq.id} className="hover:bg-stone-50/50">
                      <TableCell className="font-semibold text-stone-900 text-xs">{inq.name}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5 text-xs text-stone-600">
                          <span className="flex items-center gap-1 font-mono"><Phone size={10} className="text-stone-400" /> {inq.phone || 'N/A'}</span>
                          <span className="flex items-center gap-1 text-stone-505"><Mail size={10} className="text-stone-400" /> {inq.email || 'N/A'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-md">
                        <p className="text-xs text-stone-600 line-clamp-2" title={inq.message}>
                          {inq.message || <span className="text-stone-300 italic">No description filled</span>}
                        </p>
                      </TableCell>
                      <TableCell className="text-xs text-stone-505">
                        <div className="flex items-center gap-1 font-sans">
                          <Calendar size={11} className="text-stone-400" />
                          <span>{new Date(inq.createdAt || Date.now()).toLocaleDateString()}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`border-none h-5 text-[10px] font-bold tracking-wider uppercase ${
                          (inq.status || '').toLowerCase() === 'new' 
                            ? 'bg-sky-105 text-sky-700 bg-sky-50' 
                            : 'bg-emerald-105 text-emerald-800 bg-emerald-50'
                        }`}>
                          {(inq.status || 'New')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {(inq.status || '').toLowerCase() !== 'converted to lead' ? (
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="h-8 text-orange-600 border-orange-200 hover:bg-orange-50 font-semibold text-xs gap-1 py-1.5"
                            onClick={() => handleConvertInquiry(inq.id)}
                            disabled={actioningInquiryId === inq.id}
                          >
                            {actioningInquiryId === inq.id ? (
                              <Loader2 size={11} className="animate-spin" />
                            ) : (
                              <>
                                Convert to CRM <ArrowRight size={11} />
                              </>
                            )}
                          </Button>
                        ) : (
                          <div className="text-emerald-600 text-xs font-semibold flex items-center justify-end gap-1 px-2 py-1 bg-emerald-50 border border-emerald-100 rounded-lg max-w-fit ml-auto">
                            <CheckCircle2 size={12} /> Added to CRM
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-stone-400 text-xs">
                      No general visitor inquiries match criteria.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}

        </CardContent>
      </Card>

      {/* dialog control for editing specific prospective web lead status */}
      <Dialog open={isLeadDialogOpen} onOpenChange={setIsLeadDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-stone-900 font-bold">Qualify & Retag Website Lead</DialogTitle>
            <DialogDescription className="text-stone-500 text-xs">
              Mark lead interaction progress and keep logs on discussions.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdateLeadStatus} className="space-y-4 py-2">
            {selectedLead && (
              <div className="bg-stone-50 p-3 rounded-lg border border-stone-100 text-xs space-y-2">
                <p className="text-stone-700"><b>From:</b> {selectedLead.fullName} ({selectedLead.city})</p>
                <p className="text-stone-700"><b>Interested In:</b> {selectedLead.serviceType}</p>
                <div className="p-2 bg-card rounded border border-stone-200 text-stone-600 italic">
                  "{selectedLead.message}"
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-semibold text-stone-700">Qualifying Status *</label>
              <select
                className="w-full h-10 border border-stone-200 rounded-md px-3 text-xs bg-card focus:outline-none focus:ring-1 focus:ring-orange-500 text-stone-800 font-medium"
                value={leadStatus}
                onChange={(e) => setLeadStatus(e.target.value as any)}
              >
                <option value="new">New Inbox Submission</option>
                <option value="contacted">Contacted (Initial call done)</option>
                <option value="converted">Converted (Move to Active Lead Pool)</option>
                <option value="closed">Closed / Disqualified</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-stone-700">Comments & Remarks</label>
              <textarea
                className="w-full p-2 border border-stone-200 rounded-md text-xs h-24 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-orange-500"
                placeholder="Type additional context or qualification details here..."
                value={leadComment}
                onChange={(e) => setLeadComment(e.target.value)}
              />
            </div>

            <DialogFooter className="pt-2 gap-2 sm:gap-0">
              <Button type="button" variant="outline" className="text-xs h-9" onClick={() => setIsLeadDialogOpen(false)} disabled={isSubmitting}>
                Back
              </Button>
              <Button type="submit" className="bg-orange-600 hover:bg-orange-700 text-white text-xs h-9 px-4 font-semibold" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 size={14} className="animate-spin mr-1.5" /> Saving...
                  </>
                ) : (
                  'Update Status'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ContactLeadsManager;
