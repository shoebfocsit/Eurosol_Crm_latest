import axios from 'axios';
import { safeStorage } from '../lib/storage';
import { triggerUnauthorized } from '../lib/unauthorized';

// Allow tagging a retried request on the axios config (used to prevent
// infinite refresh/retry loops).
declare module 'axios' {
  export interface InternalAxiosRequestConfig {
    _retried?: boolean;
  }
}

// Same-origin `/v1` by default (dev vite proxy + Vercel rewrite forward it to
// the live API). This avoids CORS entirely — the API does not allow browser
// origins. Override with VITE_API_BASE_URL only if direct access is needed.
const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string) || '/v1';

// Token storage keys (must match AuthContext.tsx).
const TOKEN_KEY = 'solar_crm_token';
const REFRESH_TOKEN_KEY = 'solar_crm_refresh_token';
const PORTAL_TOKEN_KEY = 'portal_token';
const PORTAL_REFRESH_TOKEN_KEY = 'portal_refresh_token';
const PORTAL_USER_KEY = 'portal_user';
const USER_KEY = 'solar_crm_user';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// Add a request interceptor to include the JWT token in all requests
api.interceptors.request.use(
  (config) => {
    const url = config.url || '';
    // Portal owns BOTH `/auth/customer/*` and `/customer/*`. `/customers` (CRM list)
    // is deliberately excluded — the trailing slash keeps the two namespaces apart.
    const isPortalEndpoint = /^\/(auth\/customer|customer)\//.test(url);
    const token = safeStorage.getItem(TOKEN_KEY);
    const portalToken = safeStorage.getItem(PORTAL_TOKEN_KEY);
    if (isPortalEndpoint && portalToken) {
      config.headers.Authorization = `Bearer ${portalToken}`;
    } else if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// --- Refresh-token lifecycle ---
// The backend exposes POST /auth/refresh and returns a `refreshToken` on login.
// We store it and use it to recover a 401 (expired access token) once before
// falling back to a full sign-out. Guards prevent infinite retries and
// concurrent refresh storms.
let refreshPromise: Promise<string | null> | null = null;
const DEFAULT_REDIRECT_DELAY = 500;

const redirectToLogin = (delay = DEFAULT_REDIRECT_DELAY) => {
  const loginPath = window.location.pathname.startsWith('/portal') ? '/portal/login' : '/login';
  if (window.location.pathname === loginPath) return;
  setTimeout(() => {
    if (window.location.pathname !== loginPath) {
      window.location.href = loginPath;
    }
  }, delay);
};

function clearAuthState() {
  safeStorage.removeItem(TOKEN_KEY);
  safeStorage.removeItem(REFRESH_TOKEN_KEY);
  safeStorage.removeItem(USER_KEY);
  safeStorage.removeItem(PORTAL_TOKEN_KEY);
  safeStorage.removeItem(PORTAL_REFRESH_TOKEN_KEY);
  safeStorage.removeItem(PORTAL_USER_KEY);
  // Let AuthContext reset its in-memory user so protected routes stop firing
  // requests with a now-removed token (prevents the 401 -> 403 cascade).
  triggerUnauthorized();
}

// Uses the REAL backend refresh endpoint. Resolves with a new access token, or
// null when no refresh token is available / refresh failed.
async function tryRefreshAccessToken(): Promise<string | null> {
  const portalSession = !safeStorage.getItem(TOKEN_KEY) && !!safeStorage.getItem(PORTAL_TOKEN_KEY);
  const refreshTokenKey = portalSession ? PORTAL_REFRESH_TOKEN_KEY : REFRESH_TOKEN_KEY;
  const refreshEndpoint = portalSession ? '/auth/customer/refresh' : '/auth/refresh';
  const refreshToken = safeStorage.getItem(refreshTokenKey);
  if (!refreshToken) return null;

  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await axios.post(`${API_BASE_URL}${refreshEndpoint}`, { refreshToken });
      const d = res.data;
      const newToken = d?.accessToken || d?.access_token || d?.token || d?.data?.accessToken || d?.data?.access_token || d?.data?.token;
      const newRefreshToken = d?.refreshToken || d?.refresh_token || d?.data?.refreshToken || d?.data?.refresh_token;
      if (newToken) {
        safeStorage.setItem(portalSession ? PORTAL_TOKEN_KEY : TOKEN_KEY, newToken);
        if (newRefreshToken) safeStorage.setItem(refreshTokenKey, newRefreshToken);
        return newToken;
      }
    } catch (e) {
      console.warn('[API] token refresh failed', (e as any)?.response?.status || (e as any)?.message);
    } finally {
      refreshPromise = null;
    }
    return null;
  })();

  return refreshPromise;
}

// Add a response interceptor to handle unauthorized errors & report to Sentry/Loki
// Rate limiting must be enforced by the backend.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const isLoginOrRefreshRequest =
      error.config?.url?.includes('/auth/login') ||
      error.config?.url?.includes('/auth/refresh') ||
      error.config?.url?.includes('/auth/customer/login') ||
      error.config?.url?.includes('/auth/customer/refresh');
    const status = error.response?.status;

    // Attempt to refresh + retry ONCE for an expired access token (401), but
    // never for the login/refresh endpoints themselves.
    if (status === 401 && !isLoginOrRefreshRequest && !error.config?._retried) {
      try {
        const newToken = await tryRefreshAccessToken();
        if (newToken) {
          error.config._retried = true;
          error.config.headers = error.config.headers || {};
          error.config.headers.Authorization = `Bearer ${newToken}`;
          return api.request(error.config);
        }
      } catch {
        // fall through to signed-out handling below
      }
      // Fresh token was not obtainable — session is gone.
      clearAuthState();
      redirectToLogin();
      return Promise.reject(error);
    }

    // Genuine 401 on a protected request (nothing to refresh, or login failed).
    if (status === 401 && !isLoginOrRefreshRequest) {
      clearAuthState();
      redirectToLogin();
    }

    if (error.code === 'ECONNABORTED' && error.message?.includes('timeout')) {
      console.warn(`[API] Request to ${error.config?.url} timed out`);
    }
    if (status === 500 || !error.response) {
      try {
        const safeUrl = error.config?.url?.split('?')[0];
        const safeError = new Error('API request failed');
        import('@sentry/react').then((Sentry) => {
          Sentry.captureException(safeError, {
            tags: { api_url: safeUrl || 'unknown', status: String(status || 'network') },
            extra: { method: error.config?.method || 'unknown', url: safeUrl || 'unknown' }
          });
        }).catch(() => {});
        console.error(JSON.stringify({ level: 'error', msg: 'api_error', url: safeUrl, status, message: safeError.message }));
      } catch {}
    }
    return Promise.reject(error);
  }
);

export default api;

// --- Auth Endpoints ---
export const authApi = {
  login: (data: any) => api.post('/auth/login', data),
  // Best-effort server logout. Uses RAW axios (no interceptors) so an already
  // expired token doesn't trigger refresh/redirect cascades or error logs —
  // client state is cleared by the caller regardless.
  logout: () => {
    const token = safeStorage.getItem(TOKEN_KEY);
    return axios
      .post(
        `${API_BASE_URL}/auth/logout`,
        {},
        { headers: token ? { Authorization: `Bearer ${token}` } : {}, timeout: 8000 }
      )
      .catch(() => undefined);
  },
  getMe: () => api.get('/auth/me'),
  updateProfile: (data: any) => api.patch('/auth/update-profile', data),
  forgotPassword: (data: { email: string }) => api.post('/auth/forgot-password', data),
  resetPassword: (data: { token: string; password: string }) => api.post('/auth/reset-password', data),
};

// --- Analytics Endpoints ---
export const analyticsApi = {
  getSummary: (params?: { regionId?: string }) => api.get('/analytics/summary', { params }),
  getRevenueChart: (params?: { regionId?: string }) => api.get('/analytics/revenue-chart', { params }),
  getRegionChart: (params?: { regionId?: string }) => api.get('/analytics/region-chart', { params }),
};

// --- Leads & Inquiries Endpoints ---
// Website contact form (BookSurvey/ContactSection on eurosolprime) POSTs to
// `/website-inquiries` (CreateInquiryDto: name*, phone*). The CRM reads that
// SAME store here, so every website submission shows up in the CRM inbox.
// (This is a different store from the legacy `/web/contact` web-leads;
// ContactLeadsManager shows both side by side.)
export const websiteInquiriesApi = {
  getAll: () => api.get('/website-inquiries'),
  convertToLead: (id: string) => api.post(`/website-inquiries/${id}/convert`),
};

export const leadsApi = {
  getAll: (params?: { status?: string; regionId?: string; assignedToMe?: boolean; page?: number; limit?: number; search?: string }) =>
    api.get('/leads', { params }),
  getWonLeads: (params?: { page?: number; limit?: number }) => api.get('/leads/won', { params }),
  getById: (id: string) => api.get(`/leads/${id}`),
  create: (data: any) => api.post('/leads', data),
  update: (id: string, data: any) => api.patch(`/leads/${id}`, data),
  delete: (id: string) => api.delete(`/leads/${id}`),
  // Backend contract: { ownerId } required — assigneeId bhejoge to 400.
  // (UI me assignment Transfer dialog se hota hai; ye helper future use ke liye.)
  assign: (id: string, data: { ownerId: string }) =>
    api.post(`/leads/${id}/assign`, data),
  transfer: (id: string, data: { newOwnerId: string; reason: string }) => api.post(`/leads/${id}/transfer`, data),
  getComments: (id: string) => api.get(`/leads/${id}/comments`),
  addComment: (id: string, data: { comment: string }) => api.post(`/leads/${id}/comments`, data),
  getInventoryUsage: (id: string) => api.get(`/leads/${id}/inventory-usage`),
};

// --- Surveys & Quotations Endpoints ---
// LIVE: POST /surveys/:id/upload with field `photos` (max 10) — NOT /upload-report (old mock path).
// getById on every resource below is the single-fetch read: detail dialogs and
// post-mutation refreshes hit `GET /:id`, never a full list re-fetch.
// Pipeline update (backend `main` live):
// - POST /surveys/:id/submit-quotation { roofType, roofArea, structureType, shadingIssues, meterType, sanctionedLoad, notes }
//   → { survey, quotation } (quotation DRAFT, lead → NEGOTIATION). Never send `status`.
// - POST /surveys/:id/cancel { reason? } → survey CANCELLED, lead → QUALIFIED. 400 if already COMPLETED.
export const surveysApi = {
  getAll: () => api.get('/surveys'),
  getById: (id: string) => api.get(`/surveys/${id}`),
  create: (data: any) => api.post('/surveys', data),
  update: (id: string, data: any) => api.patch(`/surveys/${id}`, data),
  uploadReport: (id: string, formData: FormData) =>
    api.post(`/surveys/${id}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  upload: (id: string, formData: FormData) =>
    api.post(`/surveys/${id}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  submitQuotation: (id: string, data: { roofType?: string; roofArea?: number; structureType?: string; shadingIssues?: string; meterType?: string; sanctionedLoad?: number; notes?: string }) =>
    api.post(`/surveys/${id}/submit-quotation`, data),
  cancel: (id: string, data?: { reason?: string }) =>
    api.post(`/surveys/${id}/cancel`, data || {}),
};

export const quotationsApi = {
  getAll: () => api.get('/quotations'),
  // Single-fetch read. Returns the quotation with its nested lead + payments,
  // so the pricing form can be opened straight from a deep link without
  // waiting for (or re-fetching) the whole list.
  getById: (id: string) => api.get(`/quotations/${id}`),
  create: (data: any) => api.post('/quotations', data),
  // UpdateQuotationDto is a PARTIAL/whitelist DTO: send only the fields that
  // actually changed. `leadId` and `status` are NOT accepted here (400) —
  // status goes through /quotations/:id/status. Send "" to clear validUntil or
  // notes instead of omitting them, or the old value is silently kept.
  // 409 when the quotation is APPROVED (read-only) or the transition is illegal.
  update: (id: string, data: any) => api.patch(`/quotations/${id}`, data),
  // APPROVED auto-creates Customer + installation on backend (lead → WON).
  // Frontend must NOT double-create: refresh leads + customers after APPROVED.
  updateStatus: (id: string, data: { status: string }) => api.patch(`/quotations/${id}/status`, data),
  delete: (id: string) => api.delete(`/quotations/${id}`),
  downloadPdf: (id: string) => api.get(`/quotations/${id}/download`, { responseType: 'blob' }),
};

// --- Operations & Installations Endpoints ---
// LIVE (8570dc5): POST /installations is enabled — {leadId* required, engineerId?, startDate?, expectedEndDate?, notes?} — 409 if exists. Roles: ADMIN, MANAGER.
// GET /installations/:id is the single-fetch read: use it for detail views and
// post-mutation refresh instead of re-listing every installation.
export const installationsApi = {
  getAll: () => api.get('/installations'),
  getById: (id: string) => api.get(`/installations/${id}`),
  create: (data: { leadId: string; engineerId?: string; startDate?: string; expectedEndDate?: string; notes?: string }) =>
    api.post('/installations', data),
  update: (id: string, data: any) => api.patch(`/installations/${id}`, data),
  submitAssets: (id: string, data: any) => api.post(`/installations/${id}/assets`, data),
  delete: (id: string) => api.delete(`/installations/${id}`),
};

// --- Inventory Management Endpoints ---
export const inventoryApi = {
  getAll: (params?: any) => api.get('/inventory', { params }),
  getById: (id: string) => api.get(`/inventory/${id}`),
  create: (data: any) => api.post('/inventory', data),
  update: (id: string, data: any) => api.patch(`/inventory/${id}`, data),
  stockIn: (id: string, data: any) => api.post(`/inventory/${id}/stock-in`, data),
  stockOut: (id: string, data: any) => api.post(`/inventory/${id}/stock-out`, data),
  getAlerts: () => api.get('/inventory/alerts'),
  getMovements: (params?: any) => api.get('/inventory/movements', { params }),
  delete: (id: string) => api.delete(`/inventory/${id}`),
};

// --- Payments & Revenue Endpoints ---
// LIVE (8570dc5): GET /payments/:id added; GET /payments/stats is registered BEFORE /:id (route-order fixed).
// DELETE /payments/:id is allowed while the payment is PENDING/PARTIAL. A
// COMPLETED payment is refused (409) — reversal (POST /payments/:id/reverse) is
// Phase-2, so the UI disables delete there instead of firing a doomed request.
export const paymentsApi = {
  getAll: () => api.get('/payments'),
  create: (data: any) => api.post('/payments', data),
  getStats: () => api.get('/payments/stats'),
  getById: (id: string) => api.get(`/payments/${id}`),
  update: (id: string, data: any) => api.patch(`/payments/${id}`, data),
  delete: (id: string) => api.delete(`/payments/${id}`),
};

// --- Service & Complaints Endpoints ---
// getById is the single-fetch read: detail dialogs and post-mutation refreshes
// hit it instead of re-listing every service request.
export const serviceRequestsApi = {
  getAll: () => api.get('/service-requests'),
  getById: (id: string) => api.get(`/service-requests/${id}`),
  create: (data: any) => api.post('/service-requests', data),
  update: (id: string, data: any) => api.patch(`/service-requests/${id}`, data),
  delete: (id: string) => api.delete(`/service-requests/${id}`),
};

// --- Admin Settings Endpoints ---
export const employeesApi = {
  getAll: (params?: { role?: string; search?: string; page?: number; limit?: number; status?: string }) =>
    api.get('/employees', { params }),
  getById: (id: string) => api.get(`/employees/${id}`),
  create: (data: any) => api.post('/employees', data),
  update: (id: string, data: any) => api.patch(`/employees/${id}`, data),
  delete: (id: string) => api.delete(`/employees/${id}`),
  restore: (id: string, data?: { password?: string }) => api.put(`/employees/${id}/restore`, data || {}),
  activate: (id: string) => api.put(`/employees/${id}/activate`),
  getPermissions: (id: string) => api.get(`/employees/${id}/permissions`),
  updatePermissions: (id: string, data: { isSuperAdmin?: boolean; permissions?: any[] }) => api.put(`/employees/${id}/permissions`, data),
  // Role defaults (ADMIN only): template per role + one-click reset to role set.
  getRoleDefaults: () => api.get('/employees/roles/defaults'),
  applyRoleDefaults: (id: string) => api.post(`/employees/${id}/apply-role-defaults`, {}),
  setSuperAdmin: (id: string) => api.put(`/employees/${id}/super-admin`),
  uploadDocument: (id: string, type: string, formData: FormData) =>
    api.post(`/employees/${id}/upload-document?type=${type}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
};

export const settingsApi = {
  getRegions: () => api.get('/settings/regions'),
  createRegion: (data: { name: string }) => api.post('/settings/regions', data),
  // Confirmed present in the deployed API's own OpenAPI spec (verified 2026-09-27).
  updateRegion: (id: string, data: { name: string }) => api.patch(`/settings/regions/${id}`, data),
  deleteRegion: (id: string, reassignToRegionId?: string) => {
    const qs = reassignToRegionId ? `?reassignToRegionId=${encodeURIComponent(reassignToRegionId)}` : '';
    return api.delete(`/settings/regions/${id}${qs}`);
  },
  getCompany: () => api.get('/settings'),
  updateCompany: (data: any) => api.patch('/settings', data),
};

export const notificationsApi = {
  getAll: () => api.get('/notifications'),
  markAsRead: (id: string) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.post('/notifications/read-all'),
};

// --- Web Projects, Products, Gallery, Videos, Contacts, Testimonials, stats, AMC Plans, Team, Certifications, Site Settings ---
export const webApi = {
  // Web Projects
  getProjects: (params?: { type?: string; page?: number; limit?: number }) => 
    api.get('/web/projects', { params }),
  getProject: (id: string) => api.get(`/web/projects/${id}`),
  createProject: (formData: FormData) => api.post('/web/projects', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  updateProject: (id: string, formData: FormData) => api.patch(`/web/projects/${id}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  deleteProject: (id: string) => api.delete(`/web/projects/${id}`),

  // Web Products
  getProducts: (params?: { category?: string; subType?: string; page?: number; limit?: number }) => 
    api.get('/web/products', { params }),
  getProduct: (id: string) => api.get(`/web/products/${id}`),
  createProduct: (formData: FormData) => api.post('/web/products', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  updateProduct: (id: string, formData: FormData) => api.patch(`/web/products/${id}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  deleteProduct: (id: string) => api.delete(`/web/products/${id}`),

  // Web Gallery
  getGallery: (params?: { featured?: boolean; page?: number; limit?: number }) => 
    api.get('/web/gallery', { params }),
  createGallery: (formData: FormData) => api.post('/web/gallery', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  deleteGallery: (id: string) => api.delete(`/web/gallery/${id}`),

  // Web Videos
  getVideos: (params?: { section?: string }) => api.get('/web/videos', { params }),
  createVideo: (data: any) => api.post('/web/videos', data),
  updateVideo: (id: string, data: any) => api.patch(`/web/videos/${id}`, data),
  deleteVideo: (id: string) => api.delete(`/web/videos/${id}`),

  // Web Contact (leads) — LIVE: POST /web/contact (public), GET /web/contact/leads, GET /unconverted-count, POST /:id/convert, PATCH /:id
  getContactLeads: (params?: { status?: string; serviceType?: string; page?: number; limit?: number }) =>
    api.get('/web/contact/leads', { params }),
  getUnconvertedCount: () => api.get('/web/contact/unconverted-count'),
  convertContactLead: (id: string) => api.post(`/web/contact/leads/${id}/convert`),
  updateContactLead: (id: string, data: any) => api.patch(`/web/contact/leads/${id}`, data),
  submitContactPublic: (data: any) => api.post('/web/contact', data),

  // Testimonials
  getTestimonials: () => api.get('/testimonials'),
  createTestimonial: (data: any) => api.post('/testimonials', data),
  updateTestimonial: (id: string, data: any) => api.patch(`/testimonials/${id}`, data),
  deleteTestimonial: (id: string) => api.delete(`/testimonials/${id}`),

  // Site Stats
  getStats: () => api.get('/web/stats'),
  updateStats: (data: any) => api.put('/web/stats', data),

  // AMC Plans
  getAmcPlans: () => api.get('/web/amc-plans'),
  createAmcPlan: (data: any) => api.post('/web/amc-plans', data),
  updateAmcPlan: (id: string, data: any) => api.patch(`/web/amc-plans/${id}`, data),
  deleteAmcPlan: (id: string) => api.delete(`/web/amc-plans/${id}`),

  // Team
  getTeam: () => api.get('/web/team'),
  createTeamMember: (formData: FormData) => api.post('/web/team', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  updateTeamMember: (id: string, formData: FormData) => api.patch(`/web/team/${id}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  deleteTeamMember: (id: string) => api.delete(`/web/team/${id}`),

  // Certifications
  getCertifications: () => api.get('/web/certifications'),
  createCertification: (formData: FormData) => api.post('/web/certifications', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  updateCertification: (id: string, formData: FormData) => api.patch(`/web/certifications/${id}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  deleteCertification: (id: string) => api.delete(`/web/certifications/${id}`),

  // Site Settings
  getSiteSettings: () => api.get('/web/site-settings'),
  updateSiteSettings: (data: any) => api.put('/web/site-settings', data),
};

// --- Feedback Endpoint ---
export const feedbackApi = {
  getAll: (params?: any) => api.get('/feedback', { params }),
  getById: (id: string) => api.get(`/feedback/${id}`),
  create: (data: any) => api.post('/feedback', data),
  updateStatus: (id: string, data: { status: string }) => api.patch(`/feedback/${id}/status`, data),
  delete: (id: string) => api.delete(`/feedback/${id}`),
  getCount: () => api.get('/feedback/count'),
};

// --- Advanced CRM Endpoints (Tasks, Customers 360, Warranty, Referrals, Expenses, Invoices, Templates, Audit, Branches, Exports) ---
export const tasksApi = {
  getAll: (params?: any) => api.get('/tasks', { params }),
  create: (data: any) => api.post('/tasks', data),
  update: (id: string, data: any) => api.patch(`/tasks/${id}`, data),
  delete: (id: string) => api.delete(`/tasks/${id}`),
  getTodaysReminders: () => api.get('/tasks/reminders/today'),
};

export const calendarApi = {
  getEvents: (params?: { from?: string; to?: string }) => api.get('/calendar/events', { params }),
};

export const customersApi = {
  getAll: (params?: any) => api.get('/customers', { params }),
  getById: (id: string) => api.get(`/customers/${id}`),
  create: (data: any) => api.post('/customers', data),
  update: (id: string, data: any) => api.patch(`/customers/${id}`, data),
  // Confirmed present in the deployed API's own OpenAPI spec (verified 2026-09-27).
  delete: (id: string) => api.delete(`/customers/${id}`),
};

// --- Documents Endpoints (CRM Pipeline Update, backend `main` live) ---
// - POST /documents/upload — multipart/form-data: file (binary ≤10MB) + leadId + docType + title
//   → data = { id, leadId, docType, title, fileUrl, status: "PENDING", ... } (fileUrl = preview/download)
// - GET /documents?leadId=&docType=&status= — lead-wise list (use leadId on lead detail page)
// - GET /documents/:id — single-fetch read for detail/refresh after verify/delete
// - PATCH /documents/:id/verify { status: "VERIFIED" | "REJECTED" } — ADMIN/MANAGER only
// - DELETE /documents/:id — ADMIN/MANAGER only
// Enums: docType = KYC | SITE | NET_METERING | FINANCIAL | INSTALLATION | HANDOVER
//        status = PENDING | VERIFIED | REJECTED
// Auto-sync: backend updates linked Customer.docVerifyStatus (PENDING → PARTIAL → VERIFIED) —
// frontend must NOT calculate it, just refresh the 360 view.
// 403 on any call = missing `documents` permission rows → toast "contact admin".
export const documentsApi = {
  upload: (formData: FormData) =>
    api.post('/documents/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  getAll: (params?: { leadId?: string; docType?: string; status?: string }) =>
    api.get('/documents', { params }),
  getById: (id: string) => api.get(`/documents/${id}`),
  verify: (id: string, data: { status: 'VERIFIED' | 'REJECTED' }) =>
    api.patch(`/documents/${id}/verify`, data),
  delete: (id: string) => api.delete(`/documents/${id}`),
};

export const warrantiesApi = {
  getAll: (params?: any) => api.get('/warranties', { params }),
  getExpiring: () => api.get('/warranties/expiring'),
  create: (data: any) => api.post('/warranties', data),
  update: (id: string, data: any) => api.patch(`/warranties/${id}`, data),
  delete: (id: string) => api.delete(`/warranties/${id}`),
};

export const referralsApi = {
  getAll: (params?: any) => api.get('/referrals', { params }),
  create: (data: any) => api.post('/referrals', data),
  update: (id: string, data: any) => api.patch(`/referrals/${id}`, data),
  delete: (id: string) => api.delete(`/referrals/${id}`),
};

export const expensesApi = {
  getAll: (params?: any) => api.get('/expenses', { params }),
  getStats: () => api.get('/expenses/stats'),
  create: (data: any) => api.post('/expenses', data),
  update: (id: string, data: any) => api.patch(`/expenses/${id}`, data),
  delete: (id: string) => api.delete(`/expenses/${id}`),
};

export const invoicesApi = {
  getAll: (params?: any) => api.get('/invoices', { params }),
  getById: (id: string) => api.get(`/invoices/${id}`),
  create: (data: any) => api.post('/invoices', data),
  update: (id: string, data: any) => api.patch(`/invoices/${id}`, data),
  updateStatus: (id: string, data: any) => api.patch(`/invoices/${id}/status`, data),
  generatePaymentLink: (id: string) => api.post(`/invoices/${id}/payment-link`),
  delete: (id: string) => api.delete(`/invoices/${id}`),
  downloadPdf: (id: string) => api.get(`/invoices/${id}/pdf`, { responseType: 'blob' }),
  getAging: () => api.get('/invoices/aging/summary'),
};

export const growthAnalyticsApi = {
  getFunnel: (params?: { regionId?: string }) => api.get('/analytics/funnel', { params }),
  getLeadScores: (params?: { regionId?: string }) => api.get('/analytics/lead-score', { params }),
  getEngineerPerformance: (params?: { regionId?: string }) => api.get('/analytics/engineer-performance', { params }),
  getForecast: (params?: { regionId?: string }) => api.get('/analytics/forecast', { params }),
};

export const templatesApi = {
  getAll: (params?: any) => api.get('/templates', { params }),
  create: (data: any) => api.post('/templates', data),
  update: (id: string, data: any) => api.patch(`/templates/${id}`, data),
  delete: (id: string) => api.delete(`/templates/${id}`),
};

export const deliveryApi = {
  // LIVE: /notifications/send-* is ADMIN-only (403 for SALES/ENGINEER/MANAGER). Callers should gate
  // with hasPermission('notifications','create') / isSuperAdmin and fall back to client share/mailto.
  sendEmail: (data: any) => api.post('/notifications/send-email', data),
  sendWhatsApp: (data: any) => api.post('/notifications/send-whatsapp', data),
  getLogs: (params?: any) => api.get('/notifications/logs', { params }),
};

export const auditApi = {
  getAll: (params?: any) => api.get('/audit-logs', { params }),
};

export const branchesApi = {
  getAll: () => api.get('/settings/branches'),
  create: (data: any) => api.post('/settings/branches', data),
  update: (id: string, data: any) => api.patch(`/settings/branches/${id}`, data),
  delete: (id: string) => api.delete(`/settings/branches/${id}`),
};

export const exportApi = {
  download: (module: string) => api.get(`/export/${module}`, { responseType: 'blob' }),
};

export const blogApi = {
  getPosts: (params?: any) => api.get('/blog/posts', { params }),
  getFeatured: () => api.get('/blog/posts/featured'),
  getPostBySlug: (slug: string) => api.get(`/blog/posts/${slug}`),
  create: (data: any) => api.post('/blog/posts', data),
  update: (slug: string, data: any) => api.put(`/blog/posts/${slug}`, data),
  delete: (slug: string) => api.delete(`/blog/posts/${slug}`),
  getFieldData: () => api.get('/blog/site/field-data'),
  upsertFieldData: (data: any) => api.post('/blog/site/field-data', data),
  deleteFieldData: (key: string) => api.delete(`/blog/site/field-data/${key}`),
};

// Self-service customer portal (owner-filtered backend endpoints)
export const customerAuthApi = {
  register: (data: { name: string; email: string; password: string; phone?: string }) =>
    api.post('/auth/customer/register', data),
  login: (data: { email: string; password: string }) => api.post('/auth/customer/login', data),
  refresh: (data: { refreshToken: string }) => api.post('/auth/customer/refresh', data),
};

export const customerApi = {
  me: () => api.get('/customer/me'),
  updateProfile: (data: any) => api.patch('/customer/profile', data),
  dashboard: () => api.get('/customer/dashboard'),
  invoices: () => api.get('/customer/invoices'),
  warranties: () => api.get('/customer/warranties'),
  referrals: () => api.get('/customer/referrals'),
  payments: () => api.get('/customer/payments'),
  quotations: () => api.get('/customer/quotations'),
  installations: () => api.get('/customer/installations'),
  leads: () => api.get('/customer/leads'),
  serviceRequests: () => api.get('/customer/service-requests'),
};

// Resolve the absolute API base URL actually used for requests.
// VITE_API_BASE_URL may be a relative path (e.g. `/v1`, used with the dev proxy)
// or an absolute URL (e.g. `https://api.eurosolservice.com/v1`). When it is
// relative we fall back to the real API host so generated links (e.g. the
// quotation PDF shared in WhatsApp) point at the real API, never localhost.
export function getApiBaseUrl(): string {
  return (import.meta.env.VITE_API_BASE_URL as string) || '/v1';
}

export function getAbsoluteApiBaseUrl(): string {
  const base = getApiBaseUrl().replace(/\/+$/, '');
  if (/^https?:\/\//i.test(base)) return base;
  return 'https://api.eurosolservice.com/v1';
}

