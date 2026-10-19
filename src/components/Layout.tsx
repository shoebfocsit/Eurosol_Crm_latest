import React, { useState, useEffect } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import MobileNav from './MobileNav';

const Layout: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  // Bumped when the tab is brought back into focus so the current page keeps
  // its route but refetches its data (same page, fresh data).
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let hiddenAt = 0;
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        return;
      }
      const awayFor = hiddenAt ? Date.now() - hiddenAt : 0;
      hiddenAt = 0;
      // Ignore quick tab flips (under 30s) to avoid needless refetches.
      if (awayFor < 30000) return;
      // Never yank data out from under an in-progress edit or open modal.
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
      if (document.querySelector('[role="dialog"]')) return;
      setRefreshKey((k) => k + 1);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-orange-200 border-t-orange-600 rounded-full animate-spin" />
          <p className="text-stone-500 font-medium animate-pulse">Verifying session...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-stone-50 pb-safe">
      <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
      
      <div className={`transition-all duration-300 ${isSidebarOpen ? 'lg:pl-64' : 'lg:pl-20'}`}>
        <Navbar toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} />
        
        <main className="p-3 md:p-6 lg:p-8 pb-20 lg:pb-8">
          <div key={refreshKey}>
            <Outlet />
          </div>
        </main>
      </div>

      <MobileNav />
    </div>
  );
};

export default Layout;
