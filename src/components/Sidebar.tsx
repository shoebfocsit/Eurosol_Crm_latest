import React, { useEffect } from 'react';
import { NavLink, useNavigate, useLocation, Link } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  ClipboardList, 
  Map, 
  FileText, 
  Truck, 
  Package, 
  CreditCard, 
  Wrench, 
  Globe, 
  LogOut,
  Menu,
  X,
  MessageSquare,
  PenTool,
  Plus,
  CalendarDays,
  Wallet,
  Receipt,
  TrendingUp,
  MapPin,
  ScrollText,
  Users as UsersIcon
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Role } from '../types';
import { cn, resolveImageUrl } from '@/lib/utils';
import { Button } from './ui/button';
import { Badge } from './ui/badge';

import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

const prefetchChunk: Record<string, () => Promise<unknown>> = {
  '/': () => import('../pages/Dashboard'),
  '/leads': () => import('../pages/LeadManagement'),
  '/survey': () => import('../pages/SiteSurvey'),
  '/quotations': () => import('../pages/Quotation'),
  '/installations': () => import('../pages/InstallationTracking'),
  '/inventory': () => import('../pages/Inventory'),
  '/customers': () => import('../pages/Customers'),
  '/payments': () => import('../pages/PaymentRevenue'),
  '/service': () => import('../pages/ServiceManagement'),
  '/employees': () => import('../pages/EmployeeManagement'),
  '/regions': () => import('../pages/RegionManagement'),
  '/admin-panel': () => import('../pages/AdminPanel'),
  '/feedback': () => import('../pages/FeedbackManagement'),
  '/blog': () => import('../pages/BlogManagement'),
  '/tasks': () => import('../pages/Tasks'),
  '/analytics': () => import('../pages/GrowthAnalytics'),
  '/audit-logs': () => import('../pages/AuditLogs'),
};

const Sidebar: React.FC<SidebarProps> = ({ isOpen, setIsOpen }) => {
  const { user, hasPermission, isSuperAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Auto-close the drawer after navigating on mobile (lg+ keeps the rail)
  useEffect(() => {
    if (isOpen && window.innerWidth < 1024) setIsOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN' || user?.isSuperAdmin || isSuperAdmin;
  // Check if user has ANY permission (create/read/update/delete) for the module
  const canSee = (module: any) => !!(isAdmin || hasPermission(module, 'create') || hasPermission(module, 'read') || hasPermission(module, 'update') || hasPermission(module, 'delete'));
  const canAddItem = (module: any) => isAdmin || hasPermission(module, 'create');

  const menuItems = [
    { name: 'Dashboard', icon: LayoutDashboard, path: '/', show: true, canAdd: false, module: 'dashboard' },
    { name: 'Lead Management', icon: Users, path: '/leads', show: canSee('leads'), canAdd: true, module: 'leads' },
    { name: 'Quotation / Proposal', icon: FileText, path: '/quotations', show: canSee('quotations'), canAdd: true, module: 'quotations' },
    { name: 'Site Survey', icon: Map, path: '/survey', show: canSee('surveys'), canAdd: true, module: 'surveys' },
    { name: 'Installation Tracking', icon: Truck, path: '/installations', show: canSee('installations'), canAdd: true, module: 'installations' },
    { name: 'Inventory', icon: Package, path: '/inventory', show: canSee('inventory'), canAdd: true, module: 'inventory' },
    // Customers 360 — visible to SALES_EXECUTIVE too (data auto-scoped; out-of-zone → 403 toast).
    { name: 'Customers', icon: UsersIcon, path: '/customers', show: canSee('customers'), canAdd: false, module: 'customers' },
    { name: 'Payments & Revenue', icon: CreditCard, path: '/payments', show: canSee('payments'), canAdd: true, module: 'payments' },
    { name: 'Service & AMC', icon: Wrench, path: '/service', show: canSee('service_requests'), canAdd: true, module: 'service_requests' },
    { name: 'Employee Management', icon: ClipboardList, path: '/employees', show: canSee('employees'), canAdd: true, module: 'employees' },
    { name: 'Regions', icon: MapPin, path: '/regions', show: canSee('regions'), canAdd: true, module: 'regions' },
    { name: 'Admin Panel', icon: Globe, path: '/admin-panel', show: isAdmin, canAdd: true, module: 'admin-panel', addPath: '/admin-panel?tab=projects&new=1' },
    { name: 'Feedback', icon: MessageSquare, path: '/feedback', show: canSee('feedback'), canAdd: true, module: 'feedback' },
    { name: 'Blog', icon: PenTool, path: '/blog', show: canSee('blog'), canAdd: true, module: 'blog' },
    { name: 'Tasks & Calendar', icon: CalendarDays, path: '/tasks', show: isAdmin, canAdd: true, module: 'tasks' },
    { name: 'Growth Analytics', icon: TrendingUp, path: '/analytics', show: isAdmin, canAdd: false },
    { name: 'Audit Logs', icon: ScrollText, path: '/audit-logs', show: isAdmin, canAdd: false },
  ];

  const filteredItems = menuItems.filter(item => item.show);

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 lg:hidden" 
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside className={cn(
        "fixed top-0 left-0 z-50 h-screen transition-all duration-300 bg-card border-r border-stone-200",
        isOpen ? "w-64" : "w-20",
        "lg:translate-x-0",
        !isOpen && "-translate-x-full lg:translate-x-0"
      )}>
        <div className="flex flex-col h-full">
          {/* Logo Section */}
          <div className="flex items-center justify-between h-16 px-4 border-b border-stone-100">
            <Link to="/" className={cn("flex items-center gap-2 shrink-0", !isOpen && "mx-auto")} title="Go to Dashboard">
              <div className="w-10 h-10 shrink-0 bg-orange-600 rounded-full flex items-center justify-center overflow-hidden ring-2 ring-orange-200">
                <img src="/favicon.svg" alt="SolarCRM logo" className="w-7 h-7" draggable={false} />
              </div>
              {isOpen && (
                <span className="text-sm font-bold text-stone-900 tracking-tight truncate">Solar CRM</span>
              )}
            </Link>
            {isOpen && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(false)}
                className="shrink-0 text-stone-500 hover:text-stone-900 lg:hidden"
              >
                <X size={20} />
              </Button>
            )}
          </div>

          {/* User Info Section */}
          {isOpen && user && (
            <div className="px-4 py-4 border-b border-stone-100">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={resolveImageUrl(user.avatar)} alt={user.name} />
                  <AvatarFallback>{user.name?.charAt(0) || 'U'}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-stone-900 truncate">{user.name}</p>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 mt-1">
                    {user.role?.replace(/_/g, ' ') || 'User'}
                  </Badge>
                </div>
              </div>
            </div>
          )}

          {/* Navigation Items */}
          <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto scrollbar-thin">
            {filteredItems.map((item) => (
              <div key={item.path} className="flex items-center gap-2 group/nav">
                <NavLink
                  to={item.path}
                  title={item.name}
                  onMouseEnter={() => prefetchChunk[item.path]?.().catch(() => {})}
                  className={({ isActive }) => cn(
                    "flex items-center gap-3 h-9 px-3 rounded-lg text-sm transition-all flex-1 min-w-0 border",
                    isOpen ? "justify-start" : "justify-center",
                    isActive
                      ? "bg-orange-50 text-orange-600 font-medium border-orange-100 shadow-sm"
                      : "text-stone-600 border-transparent hover:bg-stone-50 hover:text-stone-900 hover:border-stone-100"
                  )}
                >
                  <item.icon size={18} className="shrink-0" strokeWidth={isOpen ? 2 : 2} />
                  {isOpen && <span className="truncate font-medium text-[13.5px] leading-none tracking-tight">{item.name}</span>}
                </NavLink>
                {isOpen && item.canAdd && item.module && canAddItem(item.module) && (
                  <button
                    type="button"
                    title={`Add ${item.name}`}
                    aria-label={`Add ${item.name}`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      navigate(item.addPath || `${item.path}?new=1`);
                    }}
                    className="shrink-0 h-9 w-9 flex items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-500 hover:text-orange-600 hover:border-orange-200 hover:bg-orange-50 shadow-sm hover:shadow transition-all"
                  >
                    <Plus size={14} strokeWidth={2.5} />
                  </button>
                )}
              </div>
            ))}
          </nav>

          {/* Logout Section */}
          <div className="p-2 border-t border-stone-100">
            <Button 
              variant="ghost" 
              className={cn(
                "w-full flex items-center gap-3 text-stone-600 hover:text-red-600 hover:bg-red-50",
                !isOpen && "justify-center px-0"
              )}
              onClick={logout}
            >
              <LogOut size={20} />
              {isOpen && <span>Logout</span>}
            </Button>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
