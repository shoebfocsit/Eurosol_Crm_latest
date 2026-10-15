import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Permission, PermissionModule } from '../types';
import { authApi, employeesApi } from '../services/api';
import { safeStorage } from '../lib/storage';
import { registerUnauthorizedCallback } from '../lib/unauthorized';

interface AuthContextType {
  user: User | null;
  permissions: Permission[];
  isSuperAdmin: boolean;
  hasPermission: (module: PermissionModule, action: 'create' | 'read' | 'update' | 'delete') => boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
  permissionsLoaded: boolean;
}

const defaultPermissions: Permission[] = [];

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const actionMap = { create: 'canCreate', read: 'canRead', update: 'canUpdate', delete: 'canDelete' } as const;

export const AUTH_STORAGE_KEYS = {
  token: 'solar_crm_token',
  user: 'solar_crm_user',
  refreshToken: 'solar_crm_refresh_token',
  portalToken: 'portal_token',
  portalRefreshToken: 'portal_refresh_token',
  portalUser: 'portal_user',
} as const;

const getStoredUser = (): User | null => {
  try {
    const raw = safeStorage.getItem(AUTH_STORAGE_KEYS.user);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>(defaultPermissions);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  // Permissions load in the background (a slow/403 permissions endpoint must not
  // block the whole app). Permission-gated routes wait on THIS flag instead.
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);

  const setPermissionsFromData = (data: any) => {
    if (Array.isArray(data)) { setPermissions(data); return true; }
    if (Array.isArray(data?.permissions)) { setPermissions(data.permissions); return true; }
    if (Array.isArray(data?.data?.permissions)) { setPermissions(data.data.permissions); return true; }
    if (Array.isArray(data?.data?.data?.permissions)) { setPermissions(data.data.data.permissions); return true; }
    return false;
  };

  const clearUserState = React.useCallback(() => {
    setUser(null);
    setPermissions([]);
    setIsSuperAdmin(false);
    setPermissionsLoaded(true);
  }, []);

  // Keep the in-memory auth state in sync when a 401/logout is signalled from
  // outside the context (e.g. the Axios response interceptor discovered an
  // invalid/expired token while handling a request).
  useEffect(() => {
    registerUnauthorizedCallback(clearUserState);
  }, [clearUserState]);

  const fetchPermissions = async (userId: string) => {
    try {
      const res = await employeesApi.getPermissions(userId);
      const d = res.data.data || res.data;
      setPermissionsFromData(d);
      if (d?.isSuperAdmin !== undefined) setIsSuperAdmin(!!d.isSuperAdmin);
    } catch (e) {
      console.warn('fetchPermissions failed (non‑admin user?)', e);
    } finally {
      setPermissionsLoaded(true);
    }
  };

  // Load user from API on mount if token exists
  useEffect(() => {
    const checkAuth = async () => {
      const token = safeStorage.getItem(AUTH_STORAGE_KEYS.token);
      if (token) {
        try {
          const response = await authApi.getMe();
          const userData = response.data.data || response.data;
          setUser(userData);
          setIsSuperAdmin(!!userData.isSuperAdmin);
          if (!setPermissionsFromData(userData) && userData.id) fetchPermissions(userData.id);
          else setPermissionsLoaded(true);
        } catch (error: any) {
          console.warn('Failed to fetch user profile', error);
          // A 401 here means the stored session is invalid/expired. Clear BOTH
          // storage and in-memory state so protected routes stop firing requests
          // with a now-removed token (previously `user` stayed set, which left
          // isAuthenticated true and caused 401/403 cascades on every page).
          safeStorage.removeItem(AUTH_STORAGE_KEYS.token);
          safeStorage.removeItem(AUTH_STORAGE_KEYS.refreshToken);
          safeStorage.removeItem(AUTH_STORAGE_KEYS.user);
          clearUserState();
        }
      }
      setIsLoading(false);
    };

    checkAuth();
  }, [clearUserState]);

  const hasPermission = (module: PermissionModule, action: 'create' | 'read' | 'update' | 'delete'): boolean => {
    if (isSuperAdmin || user?.isSuperAdmin) return true;
    if (user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN') return true;
    const perm = permissions.find(p => p.module === module);
    if (!perm) return false;
    return !!perm[actionMap[action]];
  };

  const login = async (email: string, password: string): Promise<{ success: boolean; message?: string }> => {
    try {
      const response = await authApi.login({ email, password });
      const data = response.data;
      const accessToken = data.accessToken || data.access_token || data.token || data.data?.accessToken || data.data?.access_token || data.data?.token;
      const refreshToken = data.refreshToken || data.refresh_token || data.data?.refreshToken || data.data?.refresh_token;
      let userData = data.user || data.data?.user || data.data;
      if (userData && userData.success !== undefined && userData.data) {
        userData = userData.data;
      }
      if (!accessToken) {
        return { success: false, message: 'Authentication failed: No token received' };
      }
      setUser(userData);
      setIsSuperAdmin(!!userData.isSuperAdmin);
      safeStorage.setItem(AUTH_STORAGE_KEYS.token, accessToken);
      safeStorage.setItem(AUTH_STORAGE_KEYS.user, JSON.stringify(userData));
      if (refreshToken) safeStorage.setItem(AUTH_STORAGE_KEYS.refreshToken, refreshToken);
      else safeStorage.removeItem(AUTH_STORAGE_KEYS.refreshToken);
      if (!setPermissionsFromData(userData) && userData.id) fetchPermissions(userData.id);
      else setPermissionsLoaded(true);
      return { success: true };
    } catch (error: any) {
      const message = error.response?.data?.message || error.message || 'Invalid email or password';
      return { success: false, message };
    }
  };

  const logout = () => {
    try {
      void authApi.logout()?.catch(() => undefined);
    } catch {}
    clearUserState();
    safeStorage.removeItem(AUTH_STORAGE_KEYS.token);
    safeStorage.removeItem(AUTH_STORAGE_KEYS.refreshToken);
    safeStorage.removeItem(AUTH_STORAGE_KEYS.user);
    safeStorage.removeItem(AUTH_STORAGE_KEYS.portalToken);
    safeStorage.removeItem(AUTH_STORAGE_KEYS.portalRefreshToken);
    safeStorage.removeItem(AUTH_STORAGE_KEYS.portalUser);
  };

  return (
    <AuthContext.Provider value={{ user, permissions, isSuperAdmin, hasPermission, login, logout, isAuthenticated: !!user, isLoading, permissionsLoaded }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
