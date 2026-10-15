import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
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
  const [regions, setRegions] = useState<any[]>([]);
  const [selectedRegion, setSelectedRegionState] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || 'all';
    } catch {
      return 'all';
    }
  });

  // /settings/regions backend par admin/settings-gated hai — bina permission
  // request bheja hi nahi jayega (doomed 403 se console spam khatam).
  let canReadRegions = false;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const auth = useAuth();
    const u = auth.user;
    canReadRegions = !!(u?.role === 'ADMIN' || u?.role === 'SUPER_ADMIN' || u?.isSuperAdmin || auth.isSuperAdmin || auth.hasPermission('settings', 'read'));
  } catch {
    canReadRegions = false;
  }

  useEffect(() => {
    if (!canReadRegions) {
      setRegions([]);
      return;
    }
    settingsApi
      .getRegions()
      .then((r) => {
        const raw = r.data.data?.regions || r.data.data || [];
        setRegions(Array.isArray(raw) ? raw : []);
      })
      .catch(() => setRegions([]));
  }, [canReadRegions]);

  const setSelectedRegion = useCallback((id: string) => {
    setSelectedRegionState(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {}
  }, []);

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
