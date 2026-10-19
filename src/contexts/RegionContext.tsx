import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { settingsApi } from '../services/api';
import { useAuth } from './AuthContext';

const STORAGE_KEY = 'crm_region';

interface RegionContextValue {
  regions: any[];
  /** 'all' | regionId */
  selectedRegion: string;
  selectedRegionName: string;
  setSelectedRegion: (id: string) => void;
  resolveRegionId: (region: any) => string;
  /**
   * True when no region is selected, or the given region matches.
   * keepUnknown=true keeps items with no region info (avoid hiding data
   * we cannot classify); strict pages (leads/installations) use false.
   */
  matchRegion: (region: any, keepUnknown?: boolean) => boolean;
}

const RegionContext = createContext<RegionContextValue>({
  regions: [],
  selectedRegion: 'all',
  selectedRegionName: 'All Regions',
  setSelectedRegion: () => {},
  resolveRegionId: () => '',
  matchRegion: () => true,
});

export function resolveRegionIdOf(region: any): string {
  if (!region) return '';
  if (typeof region === 'string') return region;
  return String(region.id || region._id || region.name || '');
}

export const RegionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedRegion, setSelectedRegionState] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || 'all';
    } catch {
      return 'all';
    }
  });

  // Region list source. The full catalogue lives behind GET /settings/regions,
  // which is ADMIN/settings-gated. Loading it for everyone caused BOTH failure
  // modes: a manager WITH settings:read saw every region (even ones they were
  // never assigned — over-access), while a manager WITHOUT settings:read got an
  // empty list and could not see the regions that were assigned to them.
  // Rule: admins/super-admins get the full list; everyone else gets ONLY the
  // regions assigned to their account (user.regions from GET /auth/me).
  let auth: ReturnType<typeof useAuth> | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    auth = useAuth();
  } catch {
    auth = null;
  }
  const isAdminLike = !!(auth?.user?.role === 'ADMIN' || auth?.user?.role === 'SUPER_ADMIN' || auth?.user?.isSuperAdmin || auth?.isSuperAdmin);
  const userRegions = auth?.user?.regions;

  const assignedRegions = useMemo(
    () =>
      Array.isArray(userRegions)
        ? userRegions
            .filter(Boolean)
            .map((r: any) => ({ ...r, id: r.id || r._id, name: r.name }))
            .filter((r: any) => r.id)
        : [],
    [userRegions]
  );

  const [adminRegions, setAdminRegions] = useState<any[]>([]);

  useEffect(() => {
    if (!isAdminLike) {
      setAdminRegions([]);
      return;
    }
    settingsApi
      .getRegions()
      .then((r) => {
        const raw = r.data.data?.regions || r.data.data || [];
        setAdminRegions(Array.isArray(raw) ? raw : []);
      })
      .catch(() => setAdminRegions([]));
  }, [isAdminLike]);

  const regions = useMemo(
    () => (isAdminLike ? adminRegions : assignedRegions),
    [isAdminLike, adminRegions, assignedRegions]
  );

  const setSelectedRegion = useCallback((id: string) => {
    setSelectedRegionState(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {}
  }, []);

  // A region picked by a previous (different) account is not valid for the
  // current user — e.g. admin selects "Nagpur" then a manager assigned only
  // "Indore" logs in on the same browser. Reset to "All Regions" instead of
  // leaving the UI stuck on a region the user cannot see.
  useEffect(() => {
    if (selectedRegion === 'all' || regions.length === 0) return;
    const exists = regions.some((r) => String(r.id || r._id) === String(selectedRegion));
    if (!exists) setSelectedRegion('all');
  }, [regions, selectedRegion, setSelectedRegion]);

  const resolveRegionId = useCallback((region: any) => resolveRegionIdOf(region), []);

  const matchRegion = useCallback(
    (region: any, keepUnknown = false) => {
      if (selectedRegion === 'all') return true;
      const id = resolveRegionIdOf(region);
      if (!id) return keepUnknown;
      const sel = regions.find((r) => String(r.id || r._id) === String(selectedRegion));
      const selName = sel ? String(sel.name || '') : '';
      return (
        id === String(selectedRegion) ||
        String(region?.name || '') === selName ||
        id === selName ||
        String(region || '') === selName
      );
    },
    [selectedRegion, regions]
  );

  const selectedRegionName =
    selectedRegion === 'all'
      ? 'All Regions'
      : regions.find((r) => String(r.id || r._id) === String(selectedRegion))?.name || 'Selected Region';

  return (
    <RegionContext.Provider
      value={{ regions, selectedRegion, selectedRegionName, setSelectedRegion, resolveRegionId, matchRegion }}
    >
      {children}
    </RegionContext.Provider>
  );
};

export const useRegion = () => useContext(RegionContext);
