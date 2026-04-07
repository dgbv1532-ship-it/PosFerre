import Dexie, { Table } from 'dexie';
import type { Product, Category, CashRegister } from '@pos/shared';

// Offline sync queue item
export interface SyncQueueEntry {
  id?: number; // auto-increment
  localId: string;
  entity: 'sale' | 'product' | 'cash_movement';
  operation: 'create' | 'update' | 'delete';
  payload: Record<string, unknown>;
  createdAt: string;
  retries: number;
}

export class LocalDB extends Dexie {
  products!: Table<Product & { localUpdatedAt?: number }>;
  categories!: Table<Category>;
  syncQueue!: Table<SyncQueueEntry>;
  cashRegisters!: Table<CashRegister & { localId?: string }>;

  constructor() {
    super('FerretPOS');

    this.version(1).stores({
      products: 'id, storeId, categoryId, name, barcode, active, updatedAt',
      categories: 'id, storeId, name',
      syncQueue: '++id, localId, entity, operation, createdAt',
      cashRegisters: 'id, storeId, userId, closedAt',
    });

    this.version(2)
      .stores({
        products: 'id, storeId, [storeId+barcode], categoryId, name, barcode, active, updatedAt',
        categories: 'id, storeId, name',
        syncQueue: '++id, localId, entity, operation, createdAt, retries',
        cashRegisters: 'id, storeId, userId, closedAt',
      })
      .upgrade(async (tx) => {
        await tx.table('syncQueue').toCollection().modify((entry: SyncQueueEntry) => {
          if (typeof entry.retries !== 'number') {
            entry.retries = 0;
          }
        });
      });
  }
}

export const localDB = new LocalDB();

// ============================================
// Local DB operations
// ============================================

export async function upsertProducts(products: Product[]) {
  await localDB.products.bulkPut(products);
}

export async function upsertCategories(categories: Category[]) {
  await localDB.categories.bulkPut(categories);
}

export async function searchProductsLocal(
  search: string,
  storeId: string,
  limit = 20,
): Promise<Product[]> {
  const query = search.toLowerCase();
  return localDB.products
    .where('storeId')
    .equals(storeId)
    .filter(
      (p) =>
        p.active &&
        (p.name.toLowerCase().includes(query) ||
          (p.barcode?.includes(query) ?? false)),
    )
    .limit(limit)
    .toArray();
}

export async function getProductByBarcode(
  barcode: string,
  storeId: string,
): Promise<Product | undefined> {
  return localDB.products
    .where('[storeId+barcode]')
    .equals([storeId, barcode])
    .first();
}

// ============================================
// Sync Queue
// ============================================

export async function addToSyncQueue(
  entry: Omit<SyncQueueEntry, 'id' | 'retries'>,
) {
  await localDB.syncQueue.add({ ...entry, retries: 0 });
}

export async function getPendingSyncItems(): Promise<SyncQueueEntry[]> {
  return localDB.syncQueue.where('retries').belowOrEqual(3).toArray();
}

export async function markSyncComplete(localIds: string[]) {
  await localDB.syncQueue.where('localId').anyOf(localIds).delete();
}

export async function incrementSyncRetry(localId: string) {
  await localDB.syncQueue.where('localId').equals(localId).modify((item) => {
    item.retries += 1;
  });
}
