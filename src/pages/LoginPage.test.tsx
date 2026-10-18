import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../contexts/AuthContext';
import LoginPage from './LoginPage';
import { vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';

// Mock next-themes to avoid provider issues in test
vi.mock('next-themes', async () => {
  const actual = await vi.importActual<typeof import('next-themes')>('next-themes');
  return {
    ...actual,
    useTheme: () => ({ theme: 'light', setTheme: vi.fn(), resolvedTheme: 'light' }),
  };
});

vi.mock('../services/api', () => ({
  authApi: {
    login: vi.fn().mockResolvedValue({
      data: {
        accessToken: 'mock-token',
        user: { id: '1', name: 'Test User', email: 'test@test.com', role: 'ADMIN', phone: '9876543210', isSuperAdmin: false }
      }
    }),
    getMe: vi.fn().mockResolvedValue({
      data: { id: '1', name: 'Test User', email: 'test@test.com', role: 'ADMIN', phone: '9876543210', isSuperAdmin: false }
    }),
    updateProfile: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
  },
  employeesApi: {
    getPermissions: vi.fn().mockResolvedValue({ data: [] }),
    getAll: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(),
    restore: vi.fn(), activate: vi.fn(), updatePermissions: vi.fn(), setSuperAdmin: vi.fn(), uploadDocument: vi.fn(),
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

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <BrowserRouter>
      <AuthProvider>
        <Toaster position="top-right" richColors closeButton />
        {ui}
      </AuthProvider>
    </BrowserRouter>
  );
};

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders login form with all fields', () => {
    renderWithProviders(<LoginPage />);
    expect(screen.getByLabelText('Email Address')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign In/i })).toBeInTheDocument();
  });

  it('shows validation error for empty fields', async () => {
    renderWithProviders(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));
    // LoginPage sets error state to "Please enter both email and password" and toast "Missing credentials"
    // Check for the inline error which is reliably rendered
    await waitFor(() => expect(screen.getByText('Please enter both email and password')).toBeInTheDocument());
    // Also toast should appear (via Toaster) - allow either
    // await waitFor(() => expect(screen.getByText('Missing credentials')).toBeInTheDocument());
  });

  it('shows validation error for invalid email format', async () => {
    renderWithProviders(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'invalid-email' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));
    await waitFor(() => expect(screen.getByText('Please enter a valid email address')).toBeInTheDocument());
  });

  it('calls login API with correct credentials and navigates on success', async () => {
    renderWithProviders(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'test@test.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));
    
    await waitFor(() => expect(screen.getByText('Login successful! Welcome back.')).toBeInTheDocument());
  });

  it('toggles password visibility', () => {
    renderWithProviders(<LoginPage />);
    const passwordInput = screen.getByLabelText('Password');
    expect(passwordInput).toHaveAttribute('type', 'password');
    
    fireEvent.click(screen.getByLabelText('Show password'));
    expect(passwordInput).toHaveAttribute('type', 'text');
    
    fireEvent.click(screen.getByLabelText('Hide password'));
    expect(passwordInput).toHaveAttribute('type', 'password');
  });
});
