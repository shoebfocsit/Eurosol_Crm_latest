// Canonical status vocabulary — single source of truth, mirrors the backend
// `statuses.ts` enums. Every dropdown, filter and PATCH body must use these
// exact strings: the API validates with @IsEnum, so anything else is a 400
// whose message carries the legal list.
//
// Do NOT add a client-side normalizer that rewrites a value before sending it
// (toUpperCase / 'In Progress' / strip-underscore). A wrong value must surface
// the server's 400 + legal list so the bug is visible, not silently mapped.
export const LEAD_STATUSES = [
  'DRAFT',
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'SITE_VISIT',
  'NEGOTIATION',
  'WON',
  'LOST',
] as const;

export const SURVEY_STATUSES = [
  'SCHEDULED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
] as const;

export const QUOTATION_STATUSES = [
  'DRAFT',
  'SENT',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
] as const;

export const INSTALLATION_STATUSES = [
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'ON_HOLD',
  'CANCELLED',
] as const;

export const PAYMENT_STATUSES = ['PENDING', 'PARTIAL', 'COMPLETED'] as const;

// Invoice statuses are deliberately lowercase in the backend enum.
export const INVOICE_STATUSES = ['draft', 'sent', 'paid', 'overdue'] as const;

export const SERVICE_REQUEST_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
  'CANCELLED',
] as const;

// Feedback statuses are lowercase in the backend enum.
export const FEEDBACK_STATUSES = ['new', 'read', 'pending'] as const;

export const SUBSIDY_STATUSES = [
  'NOT_APPLIED',
  'APPLIED',
  'APPROVED',
  'RECEIVED',
] as const;

export const DOC_VERIFY_STATUSES = ['PENDING', 'PARTIAL', 'VERIFIED'] as const;

export const DOC_STATUSES = ['PENDING', 'VERIFIED', 'REJECTED'] as const;

export const DOC_TYPES = [
  'KYC',
  'SITE',
  'NET_METERING',
  'FINANCIAL',
  'INSTALLATION',
  'HANDOVER',
] as const;

/**
 * Pull the server's error text out of an axios error. A rejected enum arrives
 * as `message: ["status must be one of the following values: A, B, C"]` — that
 * list is the whole point, so join arrays and show them verbatim instead of
 * replacing them with a generic string.
 */
export function apiMessage(err: any, fallback: string): string {
  const body = err?.response?.data ?? {};
  const msg = body?.message ?? body?.error;
  if (Array.isArray(msg)) {
    const joined = msg.map((m) => String(m)).join(' | ').trim();
    if (joined) return joined;
  }
  if (typeof msg === 'string' && msg.trim()) return msg;
  if (err?.message && !/Request failed with status code/i.test(err.message)) return err.message;
  return fallback;
}

/**
 * Display-safe status comparison. Matching is tolerant of case/separator drift
 * in *stored* data (legacy rows), but this is only for reading and filtering —
 * never to decide what gets written to the API.
 */
export function sameStatus(a: unknown, b: unknown): boolean {
  const norm = (v: unknown) => String(v ?? '').toLowerCase().replace(/[\s_-]+/g, '');
  return !!a && !!b && norm(a) === norm(b);
}

/** SCREAMING_SNAKE / lower / Title Case → readable label, e.g. ON_HOLD → On Hold. */
export function statusLabel(v: unknown): string {
  const s = String(v ?? '').trim();
  if (!s) return '—';
  return s
    .toLowerCase()
    .split(/[\s_-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
