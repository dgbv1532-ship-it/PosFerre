import type { CashRegister } from '@pos/shared';

export const CURRENT_REGISTER_CACHE_KEY = 'ferretpos-current-register';
export const OFFLINE_REGISTER_KEY = 'ferretpos-offline-register';

interface CurrentRegisterCacheEntry {
  storeId: string;
  userId: string;
  register: CashRegister;
}

export interface OfflineRegisterEntry {
  localId: string;
  storeId: string;
  userId: string;
  openingAmount: number;
  notes: string | null;
  openedAt: string;
  pendingSync: boolean;
}

export function readCachedCurrentRegister(
  storeId?: string,
  userId?: string,
): CashRegister | null {
  if (!storeId || !userId) return null;

  const raw = localStorage.getItem(CURRENT_REGISTER_CACHE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as CurrentRegisterCacheEntry;
    if (parsed.storeId !== storeId || parsed.userId !== userId) return null;
    return parsed.register ?? null;
  } catch {
    return null;
  }
}

export function writeCachedCurrentRegister(
  register: CashRegister | null,
  storeId?: string,
  userId?: string,
) {
  if (!storeId || !userId || !register) {
    localStorage.removeItem(CURRENT_REGISTER_CACHE_KEY);
    return;
  }

  const entry: CurrentRegisterCacheEntry = { storeId, userId, register };
  localStorage.setItem(CURRENT_REGISTER_CACHE_KEY, JSON.stringify(entry));
}

export function readOfflineRegister(
  storeId?: string,
  userId?: string,
): OfflineRegisterEntry | null {
  if (!storeId || !userId) return null;

  const raw = localStorage.getItem(OFFLINE_REGISTER_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as OfflineRegisterEntry;
    if (parsed.storeId !== storeId || parsed.userId !== userId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeOfflineRegister(entry: OfflineRegisterEntry | null) {
  if (!entry) {
    localStorage.removeItem(OFFLINE_REGISTER_KEY);
    return;
  }

  localStorage.setItem(OFFLINE_REGISTER_KEY, JSON.stringify(entry));
}

export function clearOfflineRegister() {
  localStorage.removeItem(OFFLINE_REGISTER_KEY);
}

export function buildLocalCashRegister(
  entry: OfflineRegisterEntry,
  userName?: string,
): CashRegister {
  return {
    id: entry.localId,
    storeId: entry.storeId,
    userId: entry.userId,
    openedAt: entry.openedAt,
    closedAt: null,
    openingAmount: entry.openingAmount,
    closingAmount: null,
    expectedClosingAmount: null,
    closingDifference: null,
    notes: entry.notes,
    user: userName
      ? {
          id: entry.userId,
          name: userName,
          email: '',
        }
      : undefined,
  };
}
