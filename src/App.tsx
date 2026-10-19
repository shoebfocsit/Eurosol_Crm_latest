/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense, type ReactNode } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { RegionProvider } from './contexts/RegionContext';
import { Toaster } from '@/components/ui/sonner';
import Layout from './components/Layout';
import { Loader2 } from 'lucide-react';
import { lazyRetry } from './lib/lazyRetry';

const LoginPage = lazy(lazyRetry(() => import('./pages/LoginPage'), 'LoginPage'));
const Dashboard = lazy(lazyRetry(() => import('./pages/Dashboard'), 'Dashboard'));
const LeadManagement = lazy(lazyRetry(() => import('./pages/LeadManagement'), 'LeadManagement'));
const SiteSurvey = lazy(lazyRetry(() => import('./pages/SiteSurvey'), 'SiteSurvey'));
const Quotation = lazy(lazyRetry(() => import('./pages/Quotation'), 'Quotation'));
const InstallationTracking = lazy(lazyRetry(() => import('./pages/InstallationTracking'), 'InstallationTracking'));
const Inventory = lazy(lazyRetry(() => import('./pages/Inventory'), 'Inventory'));
const PaymentRevenue = lazy(lazyRetry(() => import('./pages/PaymentRevenue'), 'PaymentRevenue'));
const ServiceManagement = lazy(lazyRetry(() => import('./pages/ServiceManagement'), 'ServiceManagement'));
const EmployeeManagement = lazy(lazyRetry(() => import('./pages/EmployeeManagement'), 'EmployeeManagement'));
const RegionManagement = lazy(lazyRetry(() => import('./pages/RegionManagement'), 'RegionManagement'));
const FeedbackManagement = lazy(lazyRetry(() => import('./pages/FeedbackManagement'), 'FeedbackManagement'));
const BlogManagement = lazy(lazyRetry(() => import('./pages/BlogManagement'), 'BlogManagement'));
const AdminPanel = lazy(lazyRetry(() => import('./pages/AdminPanel'), 'AdminPanel'));
const Tasks = lazy(lazyRetry(() => import('./pages/Tasks'), 'Tasks'));
const GrowthAnalytics = lazy(lazyRetry(() => import('./pages/GrowthAnalytics'), 'GrowthAnalytics'));
const Customers = lazy(lazyRetry(() => import('./pages/Customers'), 'Customers'));
const AuditLogs = lazy(lazyRetry(() => import('./pages/AuditLogs'), 'AuditLogs'));
const PortalLogin = lazy(lazyRetry(() => import('./pages/portal/PortalLogin'), 'PortalLogin'));
const PortalProfile = lazy(lazyRetry(() => import('./pages/portal/PortalProfile'), 'PortalProfile'));
const ForgotPassword = lazy(lazyRetry(() => import('./pages/portal/ForgotPassword'), 'ForgotPassword'));
const ResetPassword = lazy(lazyRetry(() => import('./pages/portal/ResetPassword'), 'ResetPassword'));

function PageFallback() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center text-stone-400">
      <Loader2 size={40} className="animate-spin opacity-30" />
    </div>
  );
}

// Permission-gated routes: a non-admin needs their permission list resolved
// before we answer, otherwise the empty default list would bounce them.
function AdminRoute({ children, module, action = 'read' }: { children: ReactNode; module?: string; action?: 'create' | 'read' | 'update' | 'delete' }) {
  const { user, isSuperAdmin, isLoading, hasPermission, permissionsLoaded } = useAuth();
  if (isLoading) return <PageFallback />;
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN' || user?.isSuperAdmin || isSuperAdmin;
  if (module && !isAdmin && !permissionsLoaded) return <PageFallback />;
  const allowed = isAdmin || (module ? hasPermission(module as any, action) : false);
  return allowed ? children : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <RegionProvider>
      <Toaster position="top-right" richColors closeButton />
      <BrowserRouter>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/leads" element={<LeadManagement />} />
              <Route path="/survey" element={<SiteSurvey />} />
              <Route path="/quotations" element={<Quotation />} />
              <Route path="/installations" element={<AdminRoute module="installations"><InstallationTracking /></AdminRoute>} />
              <Route path="/inventory" element={<AdminRoute module="inventory"><Inventory /></AdminRoute>} />
              <Route path="/payments" element={<PaymentRevenue />} />
              <Route path="/service" element={<AdminRoute module="service_requests"><ServiceManagement /></AdminRoute>} />
              <Route path="/employees" element={<AdminRoute module="employees"><EmployeeManagement /></AdminRoute>} />
              <Route path="/regions" element={<AdminRoute module="regions"><RegionManagement /></AdminRoute>} />
              <Route path="/feedback" element={<AdminRoute module="feedback"><FeedbackManagement /></AdminRoute>} />
              <Route path="/blog" element={<BlogManagement />} />
              <Route path="/admin-panel" element={<AdminRoute module="website"><AdminPanel key={location.search} /></AdminRoute>} />
              <Route path="/tasks" element={<AdminRoute module="tasks"><Tasks /></AdminRoute>} />
              <Route path="/analytics" element={<AdminRoute module="analytics"><GrowthAnalytics /></AdminRoute>} />
              <Route path="/customers" element={<Customers />} />
              <Route path="/audit-logs" element={<AdminRoute><AuditLogs /></AdminRoute>} />
            </Route>

            <Route path="/portal/login" element={<PortalLogin />} />
            <Route path="/portal/profile" element={<PortalProfile />} />
            <Route path="/portal/forgot-password" element={<ForgotPassword />} />
            <Route path="/portal/reset-password" element={<ResetPassword />} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
      </RegionProvider>
    </AuthProvider>
  );
}

