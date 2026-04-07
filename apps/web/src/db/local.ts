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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

// ============================================
// Local DB operations
// ============================================

export async function upsertProducts(products: Product[]) {
  const storeIds = [...new Set(products.map((p) => p.storeId))];
  for (const storeId of storeIds) {
    await localDB.products
      .where('storeId')
      .equals(storeId)
      .filter((p) => !isUuid(p.id))
      .delete();
  }
  await localDB.products.bulkPut(products);
}

export async function upsertCategories(categories: Category[]) {
  const storeIds = [...new Set(categories.map((c) => c.storeId))];
  for (const storeId of storeIds) {
    await localDB.categories
      .where('storeId')
      .equals(storeId)
      .filter((c) => !isUuid(c.id))
      .delete();
  }
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
        isUuid(p.id) &&
        p.active &&
        (p.name.toLowerCase().includes(query) ||
          (p.barcode?.includes(query) ?? false)),
    )
    .limit(limit)
    .toArray();
}

export async function listCategoriesLocal(storeId: string): Promise<Category[]> {
  if (!storeId) return [];

  const rows = await localDB.categories.where('storeId').equals(storeId).toArray();
  return rows
    .filter((category) => isUuid(category.id))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function listProductsLocal(params: {
  storeId: string;
  search?: string;
  categoryId?: string;
  lowStock?: boolean;
  page?: number;
  limit?: number;
}): Promise<{ data: Product[]; total: number; page: number; limit: number }> {
  const {
    storeId,
    search,
    categoryId,
    lowStock = false,
    page = 1,
    limit = 50,
  } = params;

  if (!storeId) {
    return { data: [], total: 0, page, limit };
  }

  const query = search?.trim().toLowerCase() ?? '';

  const allRows = await localDB.products.where('storeId').equals(storeId).toArray();
  const filtered = allRows.filter((product) => {
    if (!isUuid(product.id)) return false;
    if (!product.active) return false;

    if (categoryId && product.categoryId !== categoryId) return false;

    if (query) {
      const matchesName = product.name.toLowerCase().includes(query);
      const matchesBarcode = product.barcode?.includes(query) ?? false;
      if (!matchesName && !matchesBarcode) return false;
    }

    if (lowStock && Number(product.stock) > Number(product.minStock)) return false;

    return true;
  });

  filtered.sort((a, b) => a.name.localeCompare(b.name));

  const total = filtered.length;
  const start = Math.max(0, (page - 1) * limit);
  const end = start + limit;

  return {
    data: filtered.slice(start, end),
    total,
    page,
    limit,
  };
}

export async function getProductByBarcode(
  barcode: string,
  storeId: string,
): Promise<Product | undefined> {
  const rows = await localDB.products
    .where('[storeId+barcode]')
    .equals([storeId, barcode])
    .toArray();

  return rows.find((p) => isUuid(p.id)) ?? rows[0];
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
