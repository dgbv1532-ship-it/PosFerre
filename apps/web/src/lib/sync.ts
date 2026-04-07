import { api, getApiError } from './api';
import {
  getPendingSyncItems,
  markSyncComplete,
  incrementSyncRetry,
  upsertProducts,
  upsertCategories,
} from '@/db/local';
import { generateId } from './utils';

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

// Listen for online event to auto-sync
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('🌐 Back online — syncing...');
    syncWithServer();
  });
}
