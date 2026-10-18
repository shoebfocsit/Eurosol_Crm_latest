import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { vi } from 'vitest';
import { authApi, employeesApi } from '../services/api';

vi.mock('../services/api', () => ({
  authApi: {
    login: vi.fn().mockResolvedValue({
      data: {
        accessToken: 'mock-token',
        user: { id: '1', name: 'Test User', email: 'test@test.com', role: 'ADMIN', phone: '9876543210', isSuperAdmin: false }
      }
    }),
    logout: vi.fn().mockResolvedValue({ data: {} }),
    getMe: vi.fn().mockResolvedValue({
      data: {
        id: '1', name: 'Test User', email: 'test@test.com', role: 'ADMIN', phone: '9876543210', isSuperAdmin: false
      }
    }),
    updateProfile: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
  },
  employeesApi: {
    getAll: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    restore: vi.fn(),
    activate: vi.fn(),
    getPermissions: vi.fn().mockResolvedValue({
      data: [
        { module: 'leads', canCreate: true, canRead: true, canUpdate: true, canDelete: false },
        { module: 'inventory', canCreate: false, canRead: true, canUpdate: false, canDelete: false }
      ]
    }),
    updatePermissions: vi.fn(),
    setSuperAdmin: vi.fn(),
    uploadDocument: vi.fn(),
  },
  analyticsApi: { getSummary: vi.fn(), getRevenueChart: vi.fn(), getRegionChart: vi.fn() },
  leadsApi: { getAll: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), getComments: vi.fn(), addComment: vi.fn() },
  surveysApi: { getAll: vi.fn(), create: vi.fn(), uploadReport: vi.fn() },
  quotationsApi: { getAll: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), downloadPdf: vi.fn() },
  installationsApi: { getAll: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), submitAssets: vi.fn() },
  inventoryApi: { getAll: vi.fn(), create: vi.fn(), stockIn: vi.fn(), stockOut: vi.fn(), delete: vi.fn(), getMovements: vi.fn() },
  paymentsApi: { getAll: vi.fn(), create: vi.fn(), getStats: vi.fn() },
  serviceRequestsApi: { getAll: vi.fn(), create: vi.fn(), update: vi.fn() },
  settingsApi: { getRegions: vi.fn(), createRegion: vi.fn(), updateRegion: vi.fn(), deleteRegion: vi.fn(), getCompany: vi.fn(), updateCompany: vi.fn() },
  notificationsApi: { getAll: vi.fn(), markAsRead: vi.fn(), markAllRead: vi.fn() },
  webApi: {},
  feedbackApi: { getAll: vi.fn(), getById: vi.fn(), create: vi.fn(), updateStatus: vi.fn(), delete: vi.fn(), getCount: vi.fn() },
  tasksApi: { getAll: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), getTodaysReminders: vi.fn() },
  calendarApi: { getEvents: vi.fn() },
  customersApi: { getAll: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  expensesApi: { getAll: vi.fn(), getStats: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  invoicesApi: { getAll: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), updateStatus: vi.fn(), generatePaymentLink: vi.fn(), delete: vi.fn(), downloadPdf: vi.fn(), getAging: vi.fn() },
  growthAnalyticsApi: { getFunnel: vi.fn(), getLeadScores: vi.fn(), getEngineerPerformance: vi.fn(), getForecast: vi.fn() },
  auditApi: { getAll: vi.fn() },
  branchesApi: { getAll: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  exportApi: { download: vi.fn() },
  blogApi: { getPosts: vi.fn(), getFeatured: vi.fn(), getPostBySlug: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), getFieldData: vi.fn(), upsertFieldData: vi.fn(), deleteFieldData: vi.fn() },
  websiteInquiriesApi: { getAll: vi.fn(), convertToLead: vi.fn() },
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), put: vi.fn(), interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } } },
}));

const TestComponent = () => {
  const { user, isAuthenticated, hasPermission, login, logout, isLoading } = useAuth();
  return (
    <div>
      <span data-testid="user-name">{user?.name || 'no-user'}</span>
      <span data-testid="authenticated">{String(isAuthenticated)}</span>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="has-leads-create">{String(hasPermission('leads', 'create'))}</span>
      <span data-testid="has-inventory-delete">{String(hasPermission('inventory', 'delete'))}</span>
      <button onClick={() => login('test@test.com', 'password')}>Login</button>
      <button onClick={logout}>Logout</button>
    </div>
  );
};

const renderWithAuth = (ui: React.ReactElement) => {
  return render(
    <BrowserRouter>
      <AuthProvider>{ui}</AuthProvider>
    </BrowserRouter>
  );
};

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // reset default mocks
    vi.mocked(authApi.getMe).mockResolvedValue({
      data: { id: '1', name: 'Test User', email: 'test@test.com', role: 'ADMIN', phone: '9876543210', isSuperAdmin: false }
    } as any);
    vi.mocked(authApi.login).mockResolvedValue({
      data: {
        accessToken: 'mock-token',
        user: { id: '1', name: 'Test User', email: 'test@test.com', role: 'ADMIN', phone: '9876543210', isSuperAdmin: false }
      }
    } as any);
    vi.mocked(employeesApi.getPermissions).mockResolvedValue({
      data: [
        { module: 'leads', canCreate: true, canRead: true, canUpdate: true, canDelete: false },
        { module: 'inventory', canCreate: false, canRead: true, canUpdate: false, canDelete: false }
      ]
    } as any);
  });

  it('provides initial unauthenticated state', async () => {
    renderWithAuth(<TestComponent />);
    // wait for initial isLoading to settle
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    expect(screen.getByTestId('user-name')).toHaveTextContent('no-user');
    expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
  });

  it('loads user from localStorage on mount', async () => {
    const storedUser = { id: '2', name: 'Stored User', email: 'stored@test.com', role: 'SALES_EXECUTIVE', phone: '1234567890' };
    // Ensure getMe returns the stored user so test is deterministic (AuthContext fetches /auth/me when token exists)
    vi.mocked(authApi.getMe).mockResolvedValue({ data: storedUser } as any);
    // Also need to mock permissions for this user - empty or same
    vi.mocked(employeesApi.getPermissions).mockResolvedValue({
      data: [
        { module: 'leads', canCreate: true, canRead: true, canUpdate: true, canDelete: false }
      ]
    } as any);

    localStorage.setItem('solar_crm_token', 'existing-token');
    localStorage.setItem('solar_crm_user', JSON.stringify(storedUser));

    renderWithAuth(<TestComponent />);
    
    await waitFor(() => {
      expect(screen.getByTestId('user-name')).toHaveTextContent('Stored User');
      expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
    });
  });

  it('logs in user and stores token', async () => {
    renderWithAuth(<TestComponent />);
    
    fireEvent.click(screen.getByText('Login'));
    
    await waitFor(() => {
      expect(screen.getByTestId('user-name')).toHaveTextContent('Test User');
      expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
      expect(localStorage.setItem).toHaveBeenCalledWith('solar_crm_token', 'mock-token');
      expect(localStorage.setItem).toHaveBeenCalledWith('solar_crm_user', expect.any(String));
    });
  });

  it('checks permissions correctly', async () => {
    const permUser = { id: '1', name: 'Test User', email: 'test@test.com', role: 'SALES_EXECUTIVE', phone: '9876543210', isSuperAdmin: false };
    vi.mocked(authApi.getMe).mockResolvedValue({ data: permUser } as any);
    vi.mocked(employeesApi.getPermissions).mockResolvedValue({
      data: [
        { module: 'leads', canCreate: true, canRead: true, canUpdate: true, canDelete: false },
        { module: 'inventory', canCreate: false, canRead: true, canUpdate: false, canDelete: false }
      ]
    } as any);

    localStorage.setItem('solar_crm_token', 'existing-token');
    localStorage.setItem('solar_crm_user', JSON.stringify(permUser));

    renderWithAuth(<TestComponent />);
    
    await waitFor(() => {
      expect(screen.getByTestId('has-leads-create')).toHaveTextContent('true');
      expect(screen.getByTestId('has-inventory-delete')).toHaveTextContent('false');
    });
  });

  it('logs out and clears storage', async () => {    const stored = { id: '1', name: 'Test', email: 'test@test.com', role: 'SALES_EXECUTIVE', phone: '9876543210' };
    vi.mocked(authApi.getMe).mockResolvedValue({ data: stored } as any);
    localStorage.setItem('solar_crm_token', 'existing-token');
    localStorage.setItem('solar_crm_user', JSON.stringify(stored));

    renderWithAuth(<TestComponent />);
    
    await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('true'));
    
    fireEvent.click(screen.getByText('Logout'));
    
    expect(screen.getByTestId('user-name')).toHaveTextContent('no-user');
    expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
    expect(localStorage.removeItem).toHaveBeenCalledWith('solar_crm_token');
    expect(localStorage.removeItem).toHaveBeenCalledWith('solar_crm_user');
    expect(authApi.logout).toHaveBeenCalledTimes(1);
  });

  it('clears in-memory user state when getMe returns 401 (expired session)', async () => {
    const stored = { id: '1', name: 'Test', email: 'test@test.com', role: 'SALES_EXECUTIVE', phone: '9876543210' };
    localStorage.setItem('solar_crm_token', 'expired-token');
    localStorage.setItem('solar_crm_user', JSON.stringify(stored));
    // getMe rejects with 401 -> session invalid
    vi.mocked(authApi.getMe).mockRejectedValue({ response: { status: 401 }, message: 'Invalid or expired token' } as any);

    renderWithAuth(<TestComponent />);

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    // Previously the in-memory `user` stayed set after a 401 (only storage was
    // cleared), leaving isAuthenticated true and causing protected pages to keep
    // firing requests with a removed token (401 -> 403 cascade). Now user + state
    // are reset so the app immediately treats the session as ended.
    expect(screen.getByTestId('user-name')).toHaveTextContent('no-user');
    expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
    expect(localStorage.removeItem).toHaveBeenCalledWith('solar_crm_token');
  });


  it('super admin bypasses permission checks', async () => {
    const superUser = { id: '1', name: 'Super Admin', email: 'super@test.com', role: 'SUPER_ADMIN', phone: '9876543210', isSuperAdmin: true };
    vi.mocked(authApi.getMe).mockResolvedValue({ data: superUser } as any);
    // permissions won't matter for super admin but mock anyway
    vi.mocked(employeesApi.getPermissions).mockResolvedValue({ data: [] } as any);
    localStorage.setItem('solar_crm_token', 'existing-token');
    localStorage.setItem('solar_crm_user', JSON.stringify(superUser));

    renderWithAuth(<TestComponent />);
    
    await waitFor(() => {
      expect(screen.getByTestId('has-leads-create')).toHaveTextContent('true');
      expect(screen.getByTestId('has-inventory-delete')).toHaveTextContent('true');
    });
  });
});
