import { api, getApiError } from './api';
import {
  getPendingSyncItems,
  markSyncComplete,
  incrementSyncRetry,
  upsertProducts,
  upsertCategories,
} from '@/db/local';
import { useAuthStore } from '@/store/auth';
import {
  clearOfflineRegister,
  readOfflineRegister,
  writeCachedCurrentRegister,
} from './offlineCash';
import { generateId } from './utils';
import axios from 'axios';

let isSyncing = false;

export async function syncWithServer(): Promise<{
  success: boolean;
  synced: number;
  failed: number;
  error?: string;
}> {
  if (isSyncing) return { success: true, synced: 0, failed: 0 };
  if (!navigator.onLine) return { success: false, synced: 0, failed: 0, error: 'Sin conexión' };

  isSyncing = true;

  try {
    await ensureOfflineRegisterIsSynced();

    const pendingItems = await getPendingSyncItems();

    const deviceId = getOrCreateDeviceId();

    const response = await api.post('/sync', {
      deviceId,
      items: pendingItems.map((item) => ({
        localId: item.localId,
        entity: item.entity,
        operation: item.operation,
        payload: item.payload,
        createdAt: item.createdAt,
      })),
    });

    const { synced, failed, serverUpdates } = response.data.data;

    // Update local DB with server data
    if (serverUpdates.products?.length > 0) {
      await upsertProducts(serverUpdates.products);
    }
    if (serverUpdates.categories?.length > 0) {
      await upsertCategories(serverUpdates.categories);
    }

    // Clean successfully synced items
    if (synced.length > 0) {
      await markSyncComplete(synced);
    }

    // Increment retry count for failed items
    for (const failedItem of failed) {
      await incrementSyncRetry(failedItem.localId);
    }

    // Update last sync timestamp
    localStorage.setItem('lastSyncAt', new Date().toISOString());

    return {
      success: true,
      synced: synced.length,
      failed: failed.length,
    };
  } catch (error) {
    return {
      success: false,
      synced: 0,
      failed: 0,
      error: getApiError(error),
    };
  } finally {
    isSyncing = false;
  }
}

export async function initialSync() {
  if (!navigator.onLine) return;

  try {
    await ensureOfflineRegisterIsSynced();

    const [productsRes, categoriesRes] = await Promise.all([
      api.get('/products?limit=1000'),
      api.get('/categories'),
    ]);

    await upsertProducts(productsRes.data.data);
    await upsertCategories(categoriesRes.data.data);
    localStorage.setItem('lastSyncAt', new Date().toISOString());
  } catch (error) {
    console.warn('Initial sync failed:', getApiError(error));
  }
}

function getOrCreateDeviceId(): string {
  let deviceId = localStorage.getItem('deviceId');
  if (!deviceId) {
    deviceId = `device-${generateId()}`;
    localStorage.setItem('deviceId', deviceId);
  }
  return deviceId;
}

async function ensureOfflineRegisterIsSynced() {
  const user = useAuthStore.getState().user;
  if (!user?.storeId || !user.id) return;

  const offlineRegister = readOfflineRegister(user.storeId, user.id);
  if (!offlineRegister?.pendingSync) return;

  try {
    const currentRes = await api.get('/cash/current');
    const current = currentRes.data.data;
    if (current) {
      writeCachedCurrentRegister(current, user.storeId, user.id);
      clearOfflineRegister();
      return;
    }

    const openRes = await api.post('/cash/open', {
      openingAmount: offlineRegister.openingAmount,
      notes: offlineRegister.notes ?? undefined,
    });
    const opened = openRes.data.data;
    writeCachedCurrentRegister(opened, user.storeId, user.id);
    clearOfflineRegister();
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 409) {
      const currentRes = await api.get('/cash/current');
      const current = currentRes.data.data;
      if (current) {
        writeCachedCurrentRegister(current, user.storeId, user.id);
        clearOfflineRegister();
      }
      return;
    }

    throw error;
  }
}

// Listen for online event to auto-sync
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('🌐 Back online — syncing...');
    syncWithServer();
  });
}
