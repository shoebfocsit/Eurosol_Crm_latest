import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, FileText, Package, ClipboardList, MessageSquare, PenTool, Globe, CalendarDays, Users2, Map, Truck, CreditCard, Wrench } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '@/lib/utils';

const MobileNav = () => {
  const { user, hasPermission, isSuperAdmin } = useAuth();
  const location = useLocation();

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN' || user?.isSuperAdmin || isSuperAdmin;
  const canSee = (module: any) => !!(isAdmin || hasPermission(module, 'read'));

  const menuItems = [
    { name: 'Dashboard', icon: LayoutDashboard, path: '/', show: true },
    { name: 'Leads', icon: Users, path: '/leads', show: canSee('leads') },
    { name: 'Quotations', icon: FileText, path: '/quotations', show: canSee('quotations') },
    { name: 'Surveys', icon: Map, path: '/survey', show: canSee('surveys') },
    { name: 'Installations', icon: Truck, path: '/installations', show: canSee('installations') },
    { name: 'Inventory', icon: Package, path: '/inventory', show: canSee('inventory') },
    { name: 'Payments', icon: CreditCard, path: '/payments', show: canSee('payments') },
    { name: 'Service', icon: Wrench, path: '/service', show: canSee('service_requests') },
    { name: 'Employees', icon: ClipboardList, path: '/employees', show: canSee('employees') },
    { name: 'Feedback', icon: MessageSquare, path: '/feedback', show: canSee('feedback') },
    { name: 'Blog', icon: PenTool, path: '/blog', show: canSee('blog') },
    { name: 'Tasks', icon: CalendarDays, path: '/tasks', show: isAdmin },
    { name: 'Customers', icon: Users2, path: '/customers', show: canSee('customers') },
    { name: 'Admin', icon: Globe, path: '/admin-panel', show: isAdmin },
  ];

  const filtered = menuItems.filter(item => item.show);
  const visibleItems = filtered.slice(0, 5);
  const isActive = (path: string) => location.pathname === path;

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-stone-200 lg:hidden safe-area-bottom">
        <div className="flex items-center justify-around h-16 px-1">
          {visibleItems.map(item => {
            const active = isActive(item.path);
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-lg transition-colors min-w-0 flex-1",
                  active ? "text-orange-600" : "text-stone-500 hover:text-stone-700"
                )}
              >
                <item.icon size={20} className={active ? "drop-shadow-sm" : ""} />
                <span className={cn("text-[10px] leading-tight font-medium truncate max-w-full", active ? "font-semibold" : "")}>{item.name}</span>
                {active && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-orange-600 rounded-full" />}
              </NavLink>
            );
          })}
          {filtered.length > 5 && (
            <button
              onClick={() => { const btn = document.querySelector('[data-sidebar-toggle]') as HTMLElement; if (btn) btn.click(); }}
              className="flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-lg min-w-0 flex-1 text-stone-500"
            >
              <div className="flex gap-0.5 items-center"><span className="w-1 h-1 rounded-full bg-stone-500" /><span className="w-1 h-1 rounded-full bg-stone-500" /><span className="w-1 h-1 rounded-full bg-stone-500" /></div>
              <span className="text-[10px] leading-tight font-medium">More</span>
            </button>
          )}
        </div>
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-orange-200 to-transparent" />
      </nav>
      <div className="h-16 lg:hidden" />
    </>
  );
};

export default MobileNav;
