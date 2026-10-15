import { toast } from 'sonner';

export const ALLOWED_IMAGE_DOMAINS = ['images.unsplash.com', 'pbs.twimg.com', 'res.cloudinary.com'];

export function validateImageUrl(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'javascript:' || parsed.protocol === 'data:') return false;
    if (parsed.hostname === 'localhost') return false;
    return parsed.pathname.match(/\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i) !== null
      || ALLOWED_IMAGE_DOMAINS.some(d => parsed.hostname.endsWith(d));
  } catch {
    return false;
  }
}

export function validateGoogleMapsUrl(url: string): boolean {
  if (!url) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === 'www.google.com' && parsed.pathname === '/maps/embed';
  } catch {
    return false;
  }
}

export function validateLinkedInUrl(url: string): boolean {
  if (!url) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === 'www.linkedin.com';
  } catch {
    return false;
  }
}

export function validatePositiveAmount(value: string | number, fieldName: string): number | null {
  const num = Number(value);
  if (isNaN(num) || num <= 0) {
    toast.error(`${fieldName} must be a positive number`);
    return null;
  }
  return Math.round(num * 100) / 100;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatCurrencyLakhs(amount: number): string {
  const safeAmount = Math.max(0, amount);
  if (safeAmount >= 100000) {
    return `₹${(safeAmount / 100000).toFixed(1)}L`;
  }
  return formatCurrency(safeAmount);
}

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export function validateFileUpload(file: File): { valid: boolean; error?: string } {
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `File too large. Max 5MB. Got ${(file.size / 1024 / 1024).toFixed(1)}MB.` };
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return { valid: false, error: `Invalid file type: ${file.type}. Allowed: JPG, PNG, WebP, GIF.` };
  }
  return { valid: true };
}

export function maskBankAccount(account: string): string {
  if (!account || account.length <= 4) return account || '';
  return '*'.repeat(account.length - 4) + account.slice(-4);
}
