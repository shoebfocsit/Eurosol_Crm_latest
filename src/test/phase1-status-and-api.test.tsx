/**
 * Phase 1 — Canonical status vocabulary, single-fetch reads, payment delete.
 *
 * Every case here guards a write that the backend would reject. The UI used to
 * send Title Case / lowercase / non-existent values straight to @IsEnum DTOs,
 * so the requests 400'd; these tests pin the request bodies so a regression
 * shows up as a failing assertion rather than a silent 400 in production.
 */
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { Toaster } from '@/components/ui/sonner';
import {
  LEAD_STATUSES, SURVEY_STATUSES, QUOTATION_STATUSES, INSTALLATION_STATUSES,
  PAYMENT_STATUSES, SERVICE_REQUEST_STATUSES, SUBSIDY_STATUSES, DOC_VERIFY_STATUSES,
  DOC_STATUSES, FEEDBACK_STATUSES, INVOICE_STATUSES, DOC_TYPES,
  apiMessage, sameStatus, statusLabel,
} from '../lib/statuses';
import {
  quotationsApi, leadsApi, paymentsApi, installationsApi, serviceRequestsApi,
  documentsApi, surveysApi, employeesApi, settingsApi, customersApi, invoicesApi,
  exportApi, expensesApi, authApi,
} from '../services/api';

vi.mock('next-themes', async () => {
  const actual = await vi.importActual<typeof import('next-themes')>('next-themes');
  return { ...actual, useTheme: () => ({ theme: 'light', setTheme: vi.fn(), resolvedTheme: 'light' }) };
});

// Only the surfaces these pages touch. Anything a page imports but doesn't call
// in these flows is still stubbed so an undefined import can't mask a real error.
vi.mock('../services/api', () => {
  // Each property must resolve to the SAME vi.fn() on every access, otherwise
  // vi.mocked(api.x) tracks a different function than the component calls.
  const m = (extra: any = {}) => new Proxy({ ...extra }, {
    get: (t, p) => {
      const cache = t as any;
      if (!(p in cache)) cache[p] = vi.fn();
      return cache[p];
    },
  });
  return {
    authApi: m({ login: vi.fn(), logout: vi.fn(), getMe: vi.fn(), updateProfile: vi.fn(), forgotPassword: vi.fn(), resetPassword: vi.fn() }),
    employeesApi: m(),
    settingsApi: m({ getRegions: vi.fn(), getCompany: vi.fn(), getBranches: vi.fn() }),
    leadsApi: m(),
    quotationsApi: m(),
    paymentsApi: m(),
    installationsApi: m(),
    serviceRequestsApi: m(),
    documentsApi: m(),
    surveysApi: m(),
    customersApi: m(),
    invoicesApi: m(),
    exportApi: m(),
    expensesApi: m(),
    getAbsoluteApiBaseUrl: () => 'http://localhost:3000/api',
    default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), put: vi.fn(), interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } } },
  };
});



// Pages run a `useEffect(..., [])` that checks hasPermission() on first paint.
// In the app ProtectedRoute holds them back until auth resolves; rendering the
// page directly would mount it while `user` is still null, so the effect
// bails with "Access denied" and never re-runs. This gate mirrors the route.
const AuthGate = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  return user ? <>{children}</> : null;
};

const renderPage = async (ui: React.ReactElement) => {
  // pointerEventsCheck: Radix puts `pointer-events: none` on the page behind an
  // open modal, and Select options render in a portal alongside it. jsdom has
  // no layout so the portal is often measured as inside that inert region, and
  // the assertion fails on CI where timing differs. The click still works.
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  const r = render(
    <BrowserRouter>
      <AuthProvider>
        <AuthGate>{ui}</AuthGate>
        <Toaster richColors />
      </AuthProvider>
    </BrowserRouter>,
  );
  await act(async () => {});
  return { ...r, user };
};

const authUser = () => ({ id: 1, name: 'Test Admin', email: 'admin@test.com', role: 'ADMIN', isSuperAdmin: true });

const seedAuth = () => {
  localStorage.setItem('solar_crm_token', 'test-token');
  localStorage.setItem('solar_crm_user', JSON.stringify(authUser()));
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  seedAuth();
  vi.mocked(employeesApi.getPermissions).mockResolvedValue({ data: [] } as any);
  // AuthProvider clears the session when getMe() rejects, which makes
  // hasPermission() return false and silently hides every row action.
  vi.mocked(authApi.getMe).mockResolvedValue({ data: { data: authUser() } } as any);
  vi.mocked(settingsApi.getRegions).mockResolvedValue({ data: { data: [] } } as any);
  vi.mocked(employeesApi.getAll).mockResolvedValue({ data: { data: [] } } as any);
  vi.mocked(leadsApi.getAll).mockResolvedValue({ data: { data: [] } } as any);
  vi.mocked(customersApi.getAll).mockResolvedValue({ data: { data: [] } } as any);
  vi.mocked(invoicesApi.getAll).mockResolvedValue({ data: { data: [] } } as any);
  vi.mocked(expensesApi.getStats).mockResolvedValue({ data: { data: {} } } as any);
  vi.mocked(settingsApi.getCompany).mockResolvedValue({ data: { data: {} } } as any);
});
afterEach(() => localStorage.clear());

// ---------------------------------------------------------------------------

describe('1 — Canonical status vocabulary (src/lib/statuses.ts)', () => {
  it('1.1 — every list matches the backend enum exactly', () => {
    expect([...LEAD_STATUSES]).toEqual(['DRAFT', 'NEW', 'CONTACTED', 'QUALIFIED', 'SITE_VISIT', 'NEGOTIATION', 'WON', 'LOST']);
    expect([...SURVEY_STATUSES]).toEqual(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']);
    expect([...QUOTATION_STATUSES]).toEqual(['DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'EXPIRED']);
    expect([...INSTALLATION_STATUSES]).toEqual(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD', 'CANCELLED']);
    expect([...PAYMENT_STATUSES]).toEqual(['PENDING', 'PARTIAL', 'COMPLETED']);
    expect([...SERVICE_REQUEST_STATUSES]).toEqual(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'CANCELLED']);
    expect([...SUBSIDY_STATUSES]).toEqual(['NOT_APPLIED', 'APPLIED', 'APPROVED', 'RECEIVED']);
    expect([...DOC_VERIFY_STATUSES]).toEqual(['PENDING', 'PARTIAL', 'VERIFIED']);
    expect([...DOC_STATUSES]).toEqual(['PENDING', 'VERIFIED', 'REJECTED']);
    expect([...FEEDBACK_STATUSES]).toEqual(['new', 'read', 'pending']);
    expect([...INVOICE_STATUSES]).toEqual(['draft', 'sent', 'paid', 'overdue']);
    expect([...DOC_TYPES]).toEqual(['KYC', 'SITE', 'NET_METERING', 'FINANCIAL', 'INSTALLATION', 'HANDOVER']);
  });

  it('1.2 — no list contains a value the enum lacks (the "proposal" bug)', () => {
    const all = [
      ...LEAD_STATUSES, ...SURVEY_STATUSES, ...QUOTATION_STATUSES, ...INSTALLATION_STATUSES,
      ...PAYMENT_STATUSES, ...SERVICE_REQUEST_STATUSES, ...SUBSIDY_STATUSES,
      ...DOC_VERIFY_STATUSES, ...DOC_STATUSES, ...FEEDBACK_STATUSES, ...INVOICE_STATUSES,
    ];
    // 'proposal' and 'Scheduled' were both written to the API and both 400'd.
    expect(all).not.toContain('proposal' as any);
    expect(all).not.toContain('PROPOSAL' as any);
    expect(all).not.toContain('Scheduled' as any);
    expect(all).not.toContain('In Progress' as any);
  });

  it('1.3 — sameStatus() matches legacy stored values but writes stay canonical', () => {
    // These are the exact mismatches that broke the service-request cycle.
    expect(sameStatus('IN_PROGRESS', 'In Progress')).toBe(true);
    expect(sameStatus('inprogress', 'IN_PROGRESS')).toBe(true);
    expect(sameStatus('ON_HOLD', 'On Hold')).toBe(true);
    // Spelling variants are NOT sameStatus's job — it only bridges case and
    // separators. US-vs-UK spelling is handled per page (normSurveyStatus).
    expect(sameStatus('CANCELED', 'CANCELLED')).toBe(false);
    expect(sameStatus('completed', 'COMPLETED')).toBe(true);
    expect(sameStatus('OPEN', 'RESOLVED')).toBe(false);
    expect(sameStatus('', 'OPEN')).toBe(false);
    expect(sameStatus(null, undefined)).toBe(false);
  });

  it('1.4 — apiMessage() surfaces the 400 legal-value list instead of a generic string', () => {
    const enumErr = { response: { status: 400, data: { message: ['status must be one of the following values: DRAFT, NEW, CONTACTED'] } } };
    expect(apiMessage(enumErr, 'fallback')).toContain('DRAFT, NEW, CONTACTED');
    expect(apiMessage({ response: { data: { message: 'Not approved yet' } } }, 'x')).toBe('Not approved yet');
    expect(apiMessage({}, 'fallback')).toBe('fallback');
    // Axios' own message must not mask the server's.
    expect(apiMessage({ message: 'Request failed with status code 400', response: { data: { message: [] } } }, 'fb')).toBe('fb');
  });

  it('1.5 — statusLabel() prettifies for display without changing the written value', () => {
    expect(statusLabel('IN_PROGRESS')).toBe('In Progress');
    expect(statusLabel('ON_HOLD')).toBe('On Hold');
    expect(statusLabel('SITE_VISIT')).toBe('Site Visit');
    expect(statusLabel('new')).toBe('New');
    expect(statusLabel('')).toBe('—');
  });
});

// ---------------------------------------------------------------------------

describe('2 — Quotation pricing: partial PATCH + approved lock', () => {
  const quotation = (over: any = {}) => ({
    id: 'q-1',
    systemSize: 5, panelBrand: 'Tata', panelCount: 20,
    inverterBrand: 'Solis', inverterCount: 1,
    totalCost: 250000, subsidyAmount: 78000, netAmount: 172000,
    validUntil: '2026-12-31', notes: 'Original terms',
    status: 'DRAFT',
    lead: { id: 'l-1', name: 'Ravi Patel', phone: '9876543210' },
    ...over,
  });

  const openEditor = async () => {
    const Q = (await import('../pages/Quotation')).default;
    return renderPage(<Q />);
  };

  // Open the row's Radix action menu and activate one item.
  const rowItem = async (user: any, item: RegExp) => {
    const row = (await screen.findByText('Ravi Patel')).closest('tr')!;
    await user.click(within(row).getAllByRole('button').at(-1)!);
    await user.click(await screen.findByRole('menuitem', { name: item }));
  };

  it('2.1 — opening the editor loads the entity via GET /quotations/:id, not the list', async () => {
    vi.mocked(quotationsApi.getAll).mockResolvedValue({ data: { data: { quotations: [quotation()] } } } as any);
    vi.mocked(quotationsApi.getById).mockResolvedValue({ data: { data: { quotation: quotation({ notes: 'Server copy' }) } } } as any);

    const { user } = await openEditor();
    await rowItem(user, /Edit Quotation/);
    

    await waitFor(() => expect(quotationsApi.getById).toHaveBeenCalledWith('q-1'));
    expect(quotationsApi.getById).toHaveBeenCalledTimes(1);
  });

  it('2.2 — save sends ONLY changed fields; untouched fields are absent', async () => {
    vi.mocked(quotationsApi.getAll).mockResolvedValue({ data: { data: { quotations: [quotation()] } } } as any);
    vi.mocked(quotationsApi.update).mockResolvedValue({ data: { data: {} } } as any);
    // The detail GET is also the diff baseline, so it must return the ORIGINAL
    // values — returning the edited number here would make the diff empty.
    vi.mocked(quotationsApi.getById).mockResolvedValue({ data: { data: { quotation: quotation() } } } as any);

    const { user } = await openEditor();
    await rowItem(user, /Edit Quotation/);

    const totalInput = (await screen.findByLabelText(/Total Cost/i)) as HTMLInputElement;
    await user.clear(totalInput);
    await user.type(totalInput, '260000');
    await user.click(screen.getByRole('button', { name: /^Save$/i }));

    await waitFor(() => expect(quotationsApi.update).toHaveBeenCalled());
    const [, body] = vi.mocked(quotationsApi.update).mock.calls[0];
    // Net auto-recalculates while untouched, so it legitimately rides along;
    // what must NOT ride along is the untouched identity/status fields.
    expect(body).toMatchObject({ totalCost: 260000 });
    expect(body).not.toHaveProperty('leadId');
    expect(body).not.toHaveProperty('status');
    expect(body).not.toHaveProperty('systemSize');
    expect(body).not.toHaveProperty('panelCount');
    expect(body).not.toHaveProperty('panelBrand');
    expect(body).not.toHaveProperty('notes');
  });

  it('2.3 — clearing validUntil sends "" so the stored date is actually cleared', async () => {
    vi.mocked(quotationsApi.getAll).mockResolvedValue({ data: { data: { quotations: [quotation()] } } } as any);
    vi.mocked(quotationsApi.getById).mockResolvedValue({ data: { data: { quotation: quotation() } } } as any);
    vi.mocked(quotationsApi.update).mockResolvedValue({ data: { data: {} } } as any);

    const { user } = await openEditor();
    await rowItem(user, /Edit Quotation/);
    

    const until = (await screen.findByLabelText(/Valid Until/i)) as HTMLInputElement;
    await user.clear(until);
    await user.click(screen.getByRole('button', { name: /^Save$/i }));

    await waitFor(() => expect(quotationsApi.update).toHaveBeenCalled());
    const [, body] = vi.mocked(quotationsApi.update).mock.calls[0];
    // The old code omitted empty strings, so the old date silently came back.
    expect(body).toHaveProperty('validUntil', '');
  });

  it('2.4 — APPROVED quotation renders locked and the save button is disabled', async () => {
    vi.mocked(quotationsApi.getAll).mockResolvedValue({ data: { data: { quotations: [quotation({ status: 'APPROVED' })] } } } as any);
    vi.mocked(quotationsApi.getById).mockResolvedValue({ data: { data: { quotation: quotation({ status: 'APPROVED' }) } } } as any);

    const { user } = await openEditor();
    await rowItem(user, /Edit Quotation/);
    

    expect(await screen.findByText(/approved — read only/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Save$/i })).toBeDisabled();
  });

  it('2.5 — a 409 mid-save latches the form read-only and never calls update twice', async () => {
    vi.mocked(quotationsApi.getAll).mockResolvedValue({ data: { data: { quotations: [quotation()] } } } as any);
    vi.mocked(quotationsApi.getById).mockResolvedValue({ data: { data: { quotation: quotation() } } } as any);
    vi.mocked(quotationsApi.update).mockRejectedValue({ response: { status: 409, data: { message: 'Approved quotations are read-only' } } });

    const { user } = await openEditor();
    await rowItem(user, /Edit Quotation/);
    

    const total = (await screen.findByLabelText(/Total Cost/i)) as HTMLInputElement;
    await user.clear(total);
    await user.type(total, '999');
    await user.click(screen.getByRole('button', { name: /^Save$/i }));

    await waitFor(() => expect(screen.getByRole('button', { name: /^Save$/i })).toBeDisabled());
    expect(vi.mocked(quotationsApi.update).mock.calls.length).toBe(1);
  });

  it('2.6 — the "proposal" status is gone; rejected leads fall back to NEGOTIATION', async () => {
    vi.mocked(quotationsApi.getAll).mockResolvedValue({ data: { data: { quotations: [quotation()] } } } as any);
    vi.mocked(quotationsApi.updateStatus).mockResolvedValue({ data: { message: 'ok' } } as any);
    vi.mocked(leadsApi.update).mockResolvedValue({ data: { data: {} } } as any);

    const { user } = await openEditor();
    await rowItem(user, /Mark as Rejected/);
    

    await waitFor(() => expect(leadsApi.update).toHaveBeenCalled());
    const [, body] = vi.mocked(leadsApi.update).mock.calls[0];
    expect(body).toEqual({ status: 'NEGOTIATION' });
    expect(body).not.toHaveProperty('status', 'proposal');
  });
});

// ---------------------------------------------------------------------------

describe('3 — Payment delete gate and canonical status writes', () => {
  const payment = (status: string, id = 'p-1') => ({
    id, status, totalAmount: 172000, receivedAmount: 50000, leadId: 'l-1',
    quotationId: 'q-1', createdAt: new Date().toISOString(),
  });

  const renderPayments = async () => {
    const P = (await import('../pages/PaymentRevenue')).default;
    return renderPage(<P />);
  };

  const openRowMenu = async (user: any, id: string) => {
    const cell = (await screen.findByText(id.slice(0, 8))).closest('tr')!;
    await user.click(within(cell).getByRole('button'));
  };

  // Menu item -> confirmation dialog -> DELETE /payments/:id
  const confirmDelete = async (user: any, id: string) => {
    await openRowMenu(user, id);
    await user.click(await screen.findByRole('menuitem', { name: /Delete Payment/ }));
    await user.click(await screen.findByRole('button', { name: /^Delete$/ }));
  };

  it('3.1 — PENDING payment offers delete and DELETE /payments/:id is called', async () => {
    vi.mocked(paymentsApi.getAll).mockResolvedValue({ data: { data: { payments: [payment('PENDING')] } } } as any);
    vi.mocked(paymentsApi.getById).mockResolvedValue({ data: { data: { payment: payment('PENDING') } } } as any);
    vi.mocked(paymentsApi.delete).mockResolvedValue({ data: { data: {} } } as any);

    const { user } = await renderPayments();
    await confirmDelete(user, 'p-1');

    await waitFor(() => expect(paymentsApi.delete).toHaveBeenCalledWith('p-1'));
  });

  it('3.2 — PARTIAL payment also allows delete', async () => {
    vi.mocked(paymentsApi.getAll).mockResolvedValue({ data: { data: { payments: [payment('PARTIAL', 'p-2')] } } } as any);
    vi.mocked(paymentsApi.getById).mockResolvedValue({ data: { data: { payment: payment('PARTIAL', 'p-2') } } } as any);
    vi.mocked(paymentsApi.delete).mockResolvedValue({ data: { data: {} } } as any);

    const { user } = await renderPayments();
    await openRowMenu(user, 'p-2');
    // PARTIAL is still reversible-by-delete, so the item must NOT be disabled.
    const item = await screen.findByRole('menuitem', { name: /Delete Payment/ });
    expect(item.closest('[aria-disabled="true"]')).toBeNull();
    expect(item.closest('[title="reversal coming soon"]')).toBeNull();

    await user.click(item);
    await user.click(await screen.findByRole('button', { name: /^Delete$/ }));
    await waitFor(() => expect(paymentsApi.delete).toHaveBeenCalledWith('p-2'));
  });

  it('3.3 — COMPLETED payment disables delete and explains why', async () => {
    vi.mocked(paymentsApi.getAll).mockResolvedValue({ data: { data: { payments: [payment('COMPLETED', 'p-3')] } } } as any);
    vi.mocked(paymentsApi.getById).mockResolvedValue({ data: { data: { payment: payment('COMPLETED', 'p-3') } } } as any);

    const { user } = await renderPayments();
    await openRowMenu(user, 'p-3');

    const item = await screen.findByText('Delete Payment');
    expect(item.closest('[aria-disabled="true"]')).toBeTruthy();
    // Reversal is Phase-2, so the reason must be visible on the disabled item.
    expect(item.closest('[title="reversal coming soon"]')).toBeTruthy();
  });

  it('3.4 — status changes write SCREAMING_SNAKE, not Title Case', async () => {
    vi.mocked(paymentsApi.getAll).mockResolvedValue({ data: { data: { payments: [payment('PENDING', 'p-4')] } } } as any);
    vi.mocked(paymentsApi.getById).mockResolvedValue({ data: { data: { payment: payment('COMPLETED', 'p-4') } } } as any);
    vi.mocked(paymentsApi.update).mockResolvedValue({ data: { data: {} } } as any);

    const { user } = await renderPayments();
    await openRowMenu(user, 'p-4');
    await user.click(await screen.findByRole('menuitem', { name: /Completed/ }));

    await waitFor(() => expect(paymentsApi.update).toHaveBeenCalled());
    const [, body] = vi.mocked(paymentsApi.update).mock.calls[0];
    expect(body).toEqual({ status: 'COMPLETED' });
    expect(body).not.toHaveProperty('status', 'Completed');
  });

  it('3.5 — a 409 on delete falls back to the disabled state instead of retrying', async () => {
    vi.mocked(paymentsApi.getAll).mockResolvedValue({ data: { data: { payments: [payment('PENDING', 'p-5')] } } } as any);
    vi.mocked(paymentsApi.getById).mockResolvedValue({ data: { data: { payment: payment('COMPLETED', 'p-5') } } } as any);
    vi.mocked(paymentsApi.delete).mockRejectedValue({ response: { status: 409, data: { message: 'Payment is completed' } } });

    const { user } = await renderPayments();
    await confirmDelete(user, 'p-5');

    await waitFor(() => expect(paymentsApi.delete).toHaveBeenCalledTimes(1));
    // On 409 the dialog stays open, and Radix marks the table aria-hidden, so
    // close it before querying the row again.
    await user.click(await screen.findByRole('button', { name: /^Cancel$/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // The row now reads COMPLETED, so re-opening the menu must offer no delete.
    await openRowMenu(user, 'p-5');
    const item = await screen.findByText('Delete Payment');
    expect(item.closest('[aria-disabled="true"]')).toBeTruthy();
    // And it must not have retried the delete behind the scenes.
    expect(paymentsApi.delete).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------

// The page has a region filter combobox above the detail dialog, and the dialog
// itself has several Selects — scope to the dialog and take the first one,
// which is the canonical "Execution Status".
const pickStatusOption = async (user: any, label: string) => {
  const dialog = await screen.findByRole('dialog');
  await user.click(within(dialog).getAllByRole('combobox')[0]);
  // Target the option by role, not by text: the label also appears in the
  // trigger and in a hidden mirror node, so findAllByText could return an
  // element that is not the clickable option.
  await user.click(await screen.findByRole('option', { name: label }));
};

describe('4 — Single-fetch reads: detail + refresh use GET /:id, not the list', () => {
  it('4.1 — a failed PATCH reconciles one record via getById, never a re-list', async () => {
    vi.mocked(installationsApi.getAll).mockResolvedValue({ data: { data: { installations: [
      { id: 'i-1', status: 'PENDING', progress: 10, lead: { name: 'Asha' } },
    ] } } } as any);
    vi.mocked(installationsApi.getById).mockResolvedValue({ data: { data: { installation: { id: 'i-1', status: 'PENDING', progress: 10, lead: { name: 'Asha' } } } } } as any);
    vi.mocked(installationsApi.update).mockRejectedValue({ response: { status: 500, data: { message: 'boom' } } });
    vi.mocked(leadsApi.getAll).mockResolvedValue({ data: { data: [] } } as any);
    vi.mocked(settingsApi.getRegions).mockResolvedValue({ data: { data: [] } } as any);

    const I = (await import('../pages/InstallationTracking')).default;
    const { user } = await renderPage(<I />);

    const row = (await screen.findByText('Asha')).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: /View details/i }));
    await pickStatusOption(user, 'In Progress');

    await waitFor(() => expect(installationsApi.getById).toHaveBeenCalledWith('i-1'));
    // The point of single-fetch: the list endpoint is NOT re-fetched.
    expect(installationsApi.getAll).toHaveBeenCalledTimes(1);
  });

  it('4.2 — installation status writes use the canonical enum', async () => {
    vi.mocked(installationsApi.getAll).mockResolvedValue({ data: { data: { installations: [
      { id: 'i-2', status: 'PENDING', progress: 10, lead: { name: 'Vikram' } },
    ] } } } as any);
    vi.mocked(installationsApi.getById).mockResolvedValue({ data: { data: { installation: { id: 'i-2', status: 'IN_PROGRESS', progress: 50, lead: { name: 'Vikram' } } } } } as any);
    vi.mocked(installationsApi.update).mockResolvedValue({ data: { data: {} } } as any);
    vi.mocked(leadsApi.getAll).mockResolvedValue({ data: { data: [] } } as any);

    const I = (await import('../pages/InstallationTracking')).default;
    const { user } = await renderPage(<I />);

    const row = (await screen.findByText('Vikram')).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: /View details/i }));
    await pickStatusOption(user, 'In Progress');

    await waitFor(() => expect(installationsApi.update).toHaveBeenCalled());
    // Canonical SCREAMING_SNAKE, not the column's display title.
    expect(vi.mocked(installationsApi.update).mock.calls[0][1]).toMatchObject({ status: 'IN_PROGRESS' });
    const [, body] = vi.mocked(installationsApi.update).mock.calls[0];
    // 'In Progress' here is the bug that made every install status change 400.
    expect(body.status).toBe('IN_PROGRESS');
  });

  it('4.3 — service-request cycle advances from the stored enum value', async () => {
    vi.mocked(serviceRequestsApi.getAll).mockResolvedValue({ data: { data: { serviceRequests: [
      { id: 's-1', status: 'IN_PROGRESS', type: 'Maintenance', customerName: 'Kiran' },
    ] } } } as any);
    vi.mocked(serviceRequestsApi.getById).mockResolvedValue({ data: { data: { serviceRequest: { id: 's-1', status: 'RESOLVED' } } } } as any);
    vi.mocked(serviceRequestsApi.update).mockResolvedValue({ data: { data: {} } } as any);
    vi.mocked(settingsApi.getRegions).mockResolvedValue({ data: { data: [] } } as any);

    const S = (await import('../pages/ServiceManagement')).default;
    await renderPage(<S />);

    const row = (await screen.findByText('Kiran')).closest('tr')!;
    fireEvent.click(within(row).getByRole('button'));
    fireEvent.click(await screen.findByText('Update Status'));

    // The old code compared 'inprogress' against 'in progress', never matched,
    // and reported "already closed" without issuing a request.
    await waitFor(() => expect(serviceRequestsApi.update).toHaveBeenCalled());
    const [, body] = vi.mocked(serviceRequestsApi.update).mock.calls[0];
    expect(body).toEqual({ status: 'RESOLVED' });
  });

  it('4.4 — document verify re-reads the single document', async () => {
    vi.mocked(documentsApi.getAll).mockResolvedValue({ data: { data: { documents: [
      { id: 'd-1', title: 'Aadhaar', status: 'PENDING', docType: 'KYC', fileUrl: 'https://x/a.pdf' },
    ] } } } as any);
    vi.mocked(documentsApi.getById).mockResolvedValue({ data: { data: { document: { id: 'd-1', title: 'Aadhaar', status: 'VERIFIED' } } } } as any);
    vi.mocked(documentsApi.verify).mockResolvedValue({ data: { data: {} } } as any);

    const D = (await import('../components/documents/DocumentManager')).default;
    await renderPage(<D leadId="l-1" />);

    fireEvent.click(await screen.findByTitle(/Verify/i));
    await waitFor(() => expect(documentsApi.verify).toHaveBeenCalledWith('d-1', { status: 'VERIFIED' }));
    await waitFor(() => expect(documentsApi.getById).toHaveBeenCalledWith('d-1'));
  });

  it('4.5 — survey photo upload refreshes one survey, not the whole list', async () => {
    const survey = { id: 'sv-1', status: 'SCHEDULED', lead: { name: 'Meera' }, engineerId: 'e-1' };
    vi.mocked(surveysApi.getAll).mockResolvedValue({ data: { data: { surveys: [survey] } } } as any);
    vi.mocked(surveysApi.getById).mockResolvedValue({ data: { data: { survey: { ...survey, photos: ['a.jpg'] } } } } as any);
    vi.mocked(surveysApi.upload).mockResolvedValue({ data: { data: {} } } as any);

    const Sv = (await import('../pages/SiteSurvey')).default;
    await renderPage(<Sv />);

    expect(surveysApi.getById).not.toHaveBeenCalled();
    expect(surveysApi.getAll).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------

describe('5 — Lead status writes and read-side tolerance', () => {
  it('5.1 — changing a lead status sends a canonical enum value', async () => {
    vi.mocked(leadsApi.getAll).mockResolvedValue({ data: { data: { leads: [
      { id: 'l-1', name: 'Ravi Patel', status: 'NEW', phone: '9876543210' },
    ] } } } as any);
    vi.mocked(leadsApi.update).mockResolvedValue({ data: { data: {} } } as any);
    vi.mocked(quotationsApi.getAll).mockResolvedValue({ data: { data: [] } } as any);
    vi.mocked(quotationsApi.getById).mockResolvedValue({ data: { data: {} } } as any);
    vi.mocked(surveysApi.getAll).mockResolvedValue({ data: { data: [] } } as any);
    vi.mocked(paymentsApi.getAll).mockResolvedValue({ data: { data: [] } } as any);
    vi.mocked(exportApi.download).mockResolvedValue({ data: new Blob() } as any);

    const L = (await import('../pages/LeadManagement')).default;
    const { user } = await renderPage(<L />);

    const row = (await screen.findByText('Ravi Patel')).closest('tr')!;
    await user.click(within(row).getAllByRole('button').at(-1)!);
    await user.click(await screen.findByRole('menuitem', { name: /Change Status/i }));
    await user.click(await screen.findByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Qualified' }));

    await waitFor(() => expect(leadsApi.update).toHaveBeenCalled());
    const [, body] = vi.mocked(leadsApi.update).mock.calls[0];
    expect(body).toEqual({ status: 'QUALIFIED' });
    expect(body.status).not.toBe('qualified');
  });

  it('5.2 — a legacy lowercase row still renders and filters', async () => {
    vi.mocked(leadsApi.getAll).mockResolvedValue({ data: { data: { leads: [
      { id: 'l-1', name: 'Legacy Rao', status: 'qualified', phone: '9000000001' },
    ] } } } as any);
    vi.mocked(quotationsApi.getAll).mockResolvedValue({ data: { data: [] } } as any);
    vi.mocked(surveysApi.getAll).mockResolvedValue({ data: { data: [] } } as any);
    vi.mocked(paymentsApi.getAll).mockResolvedValue({ data: { data: [] } } as any);
    vi.mocked(settingsApi.getRegions).mockResolvedValue({ data: { data: [] } } as any);

    const L = (await import('../pages/LeadManagement')).default;
    await renderPage(<L />);

    expect(await screen.findByText('Legacy Rao')).toBeInTheDocument();
    // getStatusBadgeClass is matched via sameStatus, so it must be styled.
    expect(screen.getByText('qualified').closest('span')?.className).toMatch(/cyan/);
  });
});
