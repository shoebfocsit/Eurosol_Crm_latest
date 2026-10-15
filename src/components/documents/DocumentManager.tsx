import React, { useCallback, useEffect, useState } from 'react';
import { FileCheck2, FileUp, Loader2, Trash2, Eye, CheckCircle2, XCircle, FileText, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { documentsApi } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import type { CrmDocument, DocStatus, DocType } from '../../types';
import {
  DOC_TYPES as CANONICAL_DOC_TYPES, DOC_STATUSES, apiMessage, sameStatus, statusLabel,
} from '@/lib/statuses';
import { cn, resolveImageUrl } from '@/lib/utils';
import { AppImage } from '../AppImage';
import { toast } from 'sonner';

export const DOC_TYPES: DocType[] = [...CANONICAL_DOC_TYPES];

export const getApiMessage = (err: any, fallback: string) => apiMessage(err, fallback);

export const handleDocApiError = (err: any, fallback: string) => {
  const status = err?.response?.status;
  if (status === 403) {
    toast.error('Permission nahi — admin se documents permission dilwao.');
    return;
  }
  toast.error(getApiMessage(err, fallback));
};

export function docStatusBadge(status?: string) {
  const s = String(status || 'PENDING').toUpperCase();
  if (s === 'VERIFIED') return 'bg-green-100 text-green-700 border border-green-200';
  if (s === 'REJECTED') return 'bg-red-100 text-red-700 border border-red-200';
  return 'bg-amber-100 text-amber-700 border border-amber-200';
}

// HEIC/HEIF (iPhone photos): browser render nahi karta — download/new-tab se khulta hai.
const isHeicDoc = (d: CrmDocument) =>
  /\.(heic|heif)(\?|#|$)/i.test(d.fileUrl || '') ||
  /heic|heif/i.test(String((d as any).mimeType || ''));

const isImageDoc = (d: CrmDocument) => {
  // HEIC mime image/* se start hota hai par browser render nahi karta — exclude.
  if (isHeicDoc(d)) return false;
  return (
    /\.(jpe?g|png|gif|webp|avif|bmp|svg)(\?|#|$)/i.test(d.fileUrl || '') ||
    /^image\//i.test(String((d as any).mimeType || ''))
  );
};
const isPdfDoc = (d: CrmDocument) =>
  /\.pdf(\?|#|$)/i.test(d.fileUrl || '') ||
  /pdf/i.test(String((d as any).mimeType || ''));

interface DocumentManagerProps {
  leadId: string;
  /** Prefilled docs (e.g. from Customer 360 `lead.documents[]`) — avoids an extra API hit. */
  initialDocs?: CrmDocument[];
  /** When true, never hits GET /documents (360 already embeds docs). */
  embedded?: boolean;
  compact?: boolean;
  defaultDocType?: DocType;
  /** Called after verify/reject/delete so parents refresh 360 (backend auto-syncs docVerifyStatus). */
  onChanged?: () => void;
}

const DocumentManager: React.FC<DocumentManagerProps> = ({
  leadId,
  initialDocs,
  embedded,
  compact,
  defaultDocType = 'KYC',
  onChanged,
}) => {
  const { user, hasPermission } = useAuth();
  const role = String(user?.role || '');
  const isAdminManager = role === 'ADMIN' || role === 'SUPER_ADMIN' || !!user?.isSuperAdmin || role === 'MANAGER';
  const canUpload = isAdminManager || hasPermission('documents', 'create');
  const canVerify = isAdminManager || hasPermission('documents', 'update');
  const canDelete = isAdminManager || hasPermission('documents', 'delete');

  const [docs, setDocs] = useState<CrmDocument[]>(Array.isArray(initialDocs) ? initialDocs : []);
  const [loading, setLoading] = useState(!embedded && !initialDocs);
  const [uploading, setUploading] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [docType, setDocType] = useState<DocType>(defaultDocType);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [previewDoc, setPreviewDoc] = useState<CrmDocument | null>(null);

  // Single-fetch read for one document (used to refresh a row after verify).
  const fetchDocById = async (id: string): Promise<Partial<CrmDocument> | null> => {
    try {
      const res = await documentsApi.getById(id);
      const body = res.data?.data;
      const raw = body?.document || body;
      return raw && typeof raw === 'object' ? raw : null;
    } catch {
      return null;
    }
  };

  const fetchDocs = useCallback(async () => {
    if (!leadId || embedded) return;
    setLoading(true);
    try {
      const params: any = { leadId };
      if (filterType !== 'all') params.docType = filterType;
      if (filterStatus !== 'all') params.status = filterStatus;
      const res = await documentsApi.getAll(params);
      const raw = res.data?.data?.documents || res.data?.data || res.data;
      setDocs(Array.isArray(raw) ? raw : []);
    } catch (err: any) {
      handleDocApiError(err, 'Failed to fetch documents');
    } finally {
      setLoading(false);
    }
  }, [leadId, embedded, filterType, filterStatus]);

  useEffect(() => {
    if (Array.isArray(initialDocs)) setDocs(initialDocs);
  }, [initialDocs]);

  useEffect(() => {
    if (!embedded && !initialDocs) fetchDocs();
  }, [embedded, initialDocs, fetchDocs]);

  const handleUpload = async () => {
    if (!file) { toast.error('Please select a file'); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error('File max 10MB hai'); return; }
    if (!title.trim()) { toast.error('Title required hai (e.g. Aadhar Card - Front)'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('leadId', leadId);
      fd.append('docType', docType);
      fd.append('title', title.trim());
      await documentsApi.upload(fd);
      toast.success('Document uploaded');
      setFile(null);
      setTitle('');
      if (embedded) onChanged?.();
      else fetchDocs();
    } catch (err: any) {
      handleDocApiError(err, 'Failed to upload document');
    } finally {
      setUploading(false);
    }
  };

  const handleVerify = async (doc: CrmDocument, status: 'VERIFIED' | 'REJECTED') => {
    setActingId(doc.id);
    try {
      await documentsApi.verify(doc.id, { status });
      toast.success(status === 'VERIFIED' ? 'Document verified' : 'Document rejected');
      if (embedded) onChanged?.();
      // Single-fetch: re-read this one document so the row shows the stored
      // status. The previous code just assumed `status` was applied locally,
      // which hid the case where the backend stored something else.
      else {
        const fresh = await fetchDocById(doc.id);
        setDocs((prev) => prev.map((d) => (d.id === doc.id ? { ...d, ...(fresh || { status }) } : d)));
      }
      onChanged?.();
    } catch (err: any) {
      handleDocApiError(err, 'Failed to update document');
    } finally {
      setActingId(null);
    }
  };

  const handleDelete = async (doc: CrmDocument) => {
    if (!confirm(`Delete "${doc.title}"?`)) return;
    setActingId(doc.id);
    try {
      await documentsApi.delete(doc.id);
      toast.success('Document deleted');
      if (embedded) onChanged?.();
      else setDocs((prev) => prev.filter((d) => d.id !== doc.id));
      onChanged?.();
    } catch (err: any) {
      handleDocApiError(err, 'Failed to delete document');
    } finally {
      setActingId(null);
    }
  };

  const visible = docs.filter((d) => {
    if (embedded) {
      if (filterType !== 'all' && d.docType !== filterType) return false;
      if (filterStatus !== 'all' && String(d.status).toUpperCase() !== filterStatus) return false;
    }
    return true;
  });

  return (
    <div className={cn('space-y-4', compact && 'space-y-3')}>
      {!embedded && (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {DOC_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[150px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {DOC_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>
                  ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {canUpload && (
        // Deliberately a <div>, never a <form>. This component is rendered
        // inside the quotation-create and schedule-survey dialogs, which are
        // themselves <form>s - a nested form is invalid HTML, React throws
        // "validateDOMNesting <form> cannot be a descendant of <form>", and the
        // browser's form-owner resolution then made the Upload click submit the
        // OUTER dialog instead, so the file never uploaded and the quotation
        // never got created.
        <div className="p-3 bg-stone-50 rounded-lg border space-y-3">
          <p className="text-xs font-bold text-stone-500 uppercase tracking-wider flex items-center gap-1.5">
            <FileUp size={13} /> Upload document (max 10MB)
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">File *</Label>
              <Input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="h-9 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Type *</Label>
              <Select value={docType} onValueChange={(v) => setDocType(v as DocType)}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Title *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Aadhar Card - Front" className="h-9 text-xs" />
            </div>
          </div>
          <Button type="button" size="sm" onClick={handleUpload} disabled={uploading} className="bg-orange-600 hover:bg-orange-700 text-white">
            {uploading ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <FileUp size={14} className="mr-1.5" />}
            Upload
          </Button>
        </div>
      )}

      {loading ? (
        <div className="py-8 flex justify-center"><Loader2 size={24} className="animate-spin opacity-30" /></div>
      ) : visible.length === 0 ? (
        <div className="text-center py-6 border border-dashed rounded-lg text-sm text-stone-400">
          <FileCheck2 size={28} className="mx-auto mb-2 opacity-30" />
          No documents found
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((d) => (
            <div key={d.id} className="flex items-center gap-3 p-2.5 border rounded-lg bg-card">
              {d.fileUrl ? (
                isImageDoc(d) ? (
                  <AppImage src={d.fileUrl} alt={d.title} className="h-10 w-10 rounded object-cover border border-stone-200 shrink-0 cursor-pointer" onClick={() => setPreviewDoc(d)} />
                ) : (
                  <button type="button" onClick={() => setPreviewDoc(d)} className="h-10 w-10 rounded border border-stone-200 bg-stone-50 flex items-center justify-center shrink-0 text-stone-500 hover:bg-stone-100" title="Preview">
                    <FileText size={18} />
                  </button>
                )
              ) : (
                <div className="h-10 w-10 rounded border border-dashed border-stone-200 flex items-center justify-center shrink-0 text-stone-300">
                  <FileText size={18} />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{d.title}</p>
                <p className="text-[11px] text-stone-500">{d.docType} · {(d.id || '').slice(0, 8)}</p>
              </div>
              <Badge className={cn('text-[11px] font-medium', docStatusBadge(d.status))}>{statusLabel(d.status)}</Badge>
              {d.fileUrl && (
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Preview" onClick={() => setPreviewDoc(d)}>
                  <Eye size={14} />
                </Button>
              )}
              {canVerify && d.status !== 'VERIFIED' && (
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-green-600" title="Verify" disabled={actingId === d.id} onClick={() => handleVerify(d, 'VERIFIED')}>
                  <CheckCircle2 size={15} />
                </Button>
              )}
              {canVerify && d.status !== 'REJECTED' && (
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500" title="Reject" disabled={actingId === d.id} onClick={() => handleVerify(d, 'REJECTED')}>
                  <XCircle size={15} />
                </Button>
              )}
              {canDelete && (
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-stone-400 hover:text-red-600" title="Delete (ADMIN/MANAGER)" disabled={actingId === d.id} onClick={() => handleDelete(d)}>
                  <Trash2 size={14} />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Preview dialog — image full view, PDF embedded, else download link.
          fileUrl resolveImageUrl se nikalta hai (relative R2 keys bhi chalti hain). */}
      <Dialog open={!!previewDoc} onOpenChange={(o) => { if (!o) setPreviewDoc(null); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="truncate">{previewDoc?.title}</span>
              {previewDoc && <Badge className={cn('text-[11px] font-medium shrink-0', docStatusBadge(previewDoc.status))}>{statusLabel(previewDoc.status)}</Badge>}
            </DialogTitle>
            <DialogDescription>{previewDoc?.docType}</DialogDescription>
          </DialogHeader>
          {previewDoc?.fileUrl ? (
            isImageDoc(previewDoc) ? (
              <AppImage src={previewDoc.fileUrl} alt={previewDoc.title} className="w-full max-h-[60vh] object-contain rounded-lg border bg-stone-50" />
            ) : isPdfDoc(previewDoc) ? (
              <iframe src={resolveImageUrl(previewDoc.fileUrl)} title={previewDoc.title} className="w-full h-[60vh] rounded-lg border bg-stone-50" />
            ) : (
              <div className="py-8 text-center text-sm text-stone-500">
                <FileText size={36} className="mx-auto mb-2 opacity-30" />
                <p>{previewDoc && isHeicDoc(previewDoc)
                  ? 'iPhone photo (HEIC) browser me preview nahi hoti — neeche New tab se kholo ya download karo.'
                  : 'Is file ka inline preview nahi — neeche kholo ya download karo.'}</p>
              </div>
            )
          ) : (
            <p className="py-8 text-center text-sm text-stone-400">File attached nahi hai.</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewDoc(null)}>Close</Button>
            {previewDoc?.fileUrl && (
              <Button variant="outline" onClick={() => window.open(resolveImageUrl(previewDoc.fileUrl), '_blank')}>
                <ExternalLink size={14} className="mr-1.5" /> New tab me kholo
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DocumentManager;
