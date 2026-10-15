function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const memory = new Map<string, string>();

export const safeStorage = {
  getItem(key: string): string | null {
    const storage = getStorage();
    if (storage) {
      try {
        return storage.getItem(key);
      } catch {}
    }
    return memory.get(key) ?? null;
  },
  setItem(key: string, value: string): void {
    const storage = getStorage();
    if (storage) {
      try {
        storage.setItem(key, value);
        return;
      } catch {}
    }
    memory.set(key, value);
  },
  removeItem(key: string): void {
    memory.delete(key);
    try {
      getStorage()?.removeItem(key);
    } catch {}
  },
  clear(): void {
    memory.clear();
    try {
      getStorage()?.clear();
    } catch {}
  },
};
