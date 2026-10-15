import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Local (device timezone) date key in YYYY-MM-DD format.
 * Use this instead of `new Date().toISOString().slice(0, 10)` —
 * toISOString() is UTC, so in IST (UTC+5:30) it returns the
 * previous day between midnight and 5:30 AM.
 */
export function toLocalDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Normalize any server date (ISO datetime, date-only, Date) to yyyy-MM-dd for <input type="date">. */
export function toDateInputValue(v?: string | Date | null): string {
  if (!v) return '';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return '';
  return toLocalDateKey(d);
}

/** Normalize any server datetime to yyyy-MM-ddThh:mm (local) for <input type="datetime-local">. */
export function toDateTimeInputValue(v?: string | Date | null): string {
  if (!v) return '';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(v)) {
    const d = new Date(v);
    if (isNaN(d.getTime())) return '';
    // Input had no timezone (local) — if it parses, re-emit local parts to avoid UTC shift.
    if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(v)) {
      const p = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
    }
  }
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Convert a date/datetime-local input value to ISO string for the API. Returns undefined for empty/invalid. */
export function toApiIso(v?: string | Date | null): string | undefined {
  if (!v) return undefined;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}

// Read lazily (not module-scope) so tests/stubs and runtime env changes apply.
function getApiDomain(): string {
  return (
    (import.meta.env.VITE_API_BASE_URL as string)?.replace(/\/v1\/?$/, '') ||
    (import.meta.env.PROD ? 'https://api.eurosolservice.com' : '')
  );
}

export function resolveImageUrl(url?: string | null): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const apiDomain = getApiDomain();
  const key = url.trim().replace(/^\.\//, '').replace(/^\/+/, '');
  if (key.startsWith('local-uploads/')) return `${apiDomain}/uploads/${key.slice('local-uploads/'.length)}`;
  if (key.startsWith('public/uploads/')) return `${apiDomain}/uploads/${key.slice('public/uploads/'.length)}`;
  if (key.startsWith('uploads/')) return `${apiDomain}/${key}`;
  return url;
}
