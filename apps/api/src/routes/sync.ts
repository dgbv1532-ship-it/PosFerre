import { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { syncRequestSchema } from '@pos/shared';
import { z } from 'zod';

type TxClient = Prisma.TransactionClient;

export async function syncRoutes(fastify: FastifyInstance) {
  // POST /sync - Process offline queue and return server updates
  fastify.post('/sync', { preHandler: [fastify.authenticate] }, async (request) => {
    const body = syncRequestSchema.parse(request.body);
    const { deviceId, items } = body;
    const storeId = request.storeId;

    const synced: string[] = [];
    const failed: Array<{ localId: string; error: string }> = [];

    // Process each queued item with idempotency markers
    for (const item of items) {
      try {
        await prisma.$transaction(async (tx) => {
          await tx.syncEvent.create({
            data: {
              storeId,
              deviceId,
              localId: item.localId,
              entity: item.entity,
              operation: item.operation,
            },
          });

          if (item.entity === 'sale' && item.operation === 'create') {
            const payload = salePayloadSchema.parse(item.payload);
            await processSaleSync(tx, storeId, request.userId, payload, item.createdAt);
            return;
          }

          if (item.entity === 'product' && item.operation === 'update') {
            const payload = productUpdatePayloadSchema.parse(item.payload);
            await processProductUpdateSync(tx, storeId, payload);
            return;
          }

          if (item.entity === 'cash_movement' && item.operation === 'create') {
            const payload = cashMovementPayloadSchema.parse(item.payload);
            await processCashMovementSync(tx, storeId, payload);
          }
        });

        synced.push(item.localId);
      } catch (err) {
        if (isSyncEventAlreadyProcessed(err)) {
          synced.push(item.localId);
          continue;
        }

        failed.push({
          localId: item.localId,
          error: err instanceof Error ? err.message : 'Error desconocido',
        });
      }
    }

    // Return server updates: products and categories updated since last sync
    const lastSyncAt = request.headers['x-last-sync-at']
      ? new Date(request.headers['x-last-sync-at'] as string)
      : new Date(0);

    const [products, categories] = await prisma.$transaction([
      prisma.product.findMany({
        where: { storeId, updatedAt: { gt: lastSyncAt } },
        include: { category: true },
      }),
      prisma.category.findMany({
        where: { storeId, createdAt: { gt: lastSyncAt } },
      }),
    ]);

    return {
      data: {
        synced,
        failed,
        serverUpdates: { products, categories },
      },
    };
  });
}

// ============================================
// Sync processors
// ============================================

interface SaleItemPayload {
  productId: string;
  quantity: number;
  price: number;
  subtotal?: number;
}

interface SalePayload {
  registerId?: string | null;
  customerId?: string | null;
  items: SaleItemPayload[];
  discount: number;
  paymentMethod: 'cash' | 'card' | 'transfer';
  createdAt?: string;
}

interface ProductUpdatePayload {
  id: string;
  stock?: number;
  price?: number;
  updatedAt: string;
}

interface CashMovementPayload {
  registerId: string;
  type: 'in' | 'out';
  amount: number;
  description: string;
  createdAt: string;
}

const salePayloadSchema = z.object({
  registerId: z.string().uuid().nullable().optional(),
  customerId: z.string().uuid().nullable().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().positive(),
        price: z.number().min(0),
        subtotal: z.number().min(0).optional(),
      }),
    )
    .min(1),
  discount: z.number().min(0),
  paymentMethod: z.enum(['cash', 'card', 'transfer']),
  createdAt: z.string().datetime().optional(),
});

const productUpdatePayloadSchema = z.object({
  id: z.string().uuid(),
  stock: z.number().min(0).optional(),
  price: z.number().min(0).optional(),
  updatedAt: z.string().datetime(),
});

const cashMovementPayloadSchema = z.object({
  registerId: z.string().uuid(),
  type: z.enum(['in', 'out']),
  amount: z.number().positive(),
  description: z.string().min(1).max(200),
  createdAt: z.string().datetime(),
});

async function processSaleSync(
  tx: TxClient,
  storeId: string,
  userId: string,
  payload: SalePayload,
  queuedCreatedAt: string,
) {
  const saleCreatedAt = payload.createdAt ?? queuedCreatedAt;
  const saleDate = new Date(saleCreatedAt);
  const resolvedRegisterId = await resolveRegisterForOfflineSale(
    tx,
    storeId,
    userId,
    saleDate,
    payload.registerId ?? null,
  );

  if (!resolvedRegisterId) {
    throw new Error('No se encontro caja para asociar la venta offline');
  }

  const itemsWithSubtotal = payload.items.map((item) => ({
    ...item,
    subtotal: item.subtotal ?? item.price * item.quantity,
  }));

  const quantityByProduct = new Map<string, number>();
  for (const item of itemsWithSubtotal) {
    const currentQuantity = quantityByProduct.get(item.productId) ?? 0;
    quantityByProduct.set(item.productId, currentQuantity + item.quantity);
  }

  const productIds = [...quantityByProduct.keys()];
  const products = await tx.product.findMany({
    where: { id: { in: productIds }, storeId, active: true },
  });

  if (products.length !== productIds.length) {
    throw new Error('Uno o mas productos no encontrados');
  }

  for (const [productId, requestedQuantity] of quantityByProduct.entries()) {
    const product = products.find((entry) => entry.id === productId);
    if (!product) {
      throw new Error('Uno o mas productos no encontrados');
    }

    if (Number(product.stock) < requestedQuantity) {
      throw new Error(`Stock insuficiente para: ${product.name}`);
    }
  }

  const subtotal = itemsWithSubtotal.reduce((sum, item) => sum + item.subtotal, 0);
  const total = Math.max(0, subtotal - (payload.discount ?? 0));

  await tx.sale.create({
    data: {
      storeId,
      userId,
      registerId: resolvedRegisterId,
      customerId: payload.customerId ?? null,
      total,
      discount: payload.discount ?? 0,
      paymentMethod: payload.paymentMethod,
      status: 'completed',
      syncedAt: new Date(),
      createdAt: saleDate,
      items: {
        create: itemsWithSubtotal.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          price: item.price,
          subtotal: item.subtotal,
        })),
      },
    },
  });

  for (const [productId, quantity] of quantityByProduct.entries()) {
    await tx.product.update({
      where: { id: productId },
      data: { stock: { decrement: quantity } },
    });
  }
}

async function processProductUpdateSync(
  tx: TxClient,
  storeId: string,
  payload: ProductUpdatePayload,
) {
  const product = await tx.product.findFirst({
    where: { id: payload.id, storeId },
  });
  if (!product) throw new Error('Producto no encontrado');

  // Server wins on stock conflicts - only apply if client's version is newer
  const clientUpdatedAt = new Date(payload.updatedAt);
  if (clientUpdatedAt > product.updatedAt) {
    const data: Record<string, unknown> = {};
    if (payload.stock !== undefined) data.stock = payload.stock;
    if (payload.price !== undefined) data.price = payload.price;
    if (Object.keys(data).length > 0) {
      await tx.product.update({ where: { id: payload.id }, data });
    }
  }
}

async function processCashMovementSync(
  tx: TxClient,
  storeId: string,
  payload: CashMovementPayload,
) {
  const register = await tx.cashRegister.findFirst({
    where: { id: payload.registerId, storeId },
  });
  if (!register) throw new Error('Caja no encontrada');

  await tx.cashMovement.create({
    data: {
      registerId: payload.registerId,
      type: payload.type,
      amount: payload.amount,
      description: payload.description,
      createdAt: new Date(payload.createdAt),
    },
  });
}

async function resolveRegisterForOfflineSale(
  tx: TxClient,
  storeId: string,
  userId: string,
  saleDate: Date,
  requestedRegisterId: string | null,
): Promise<string | null> {
  if (requestedRegisterId) {
    const register = await tx.cashRegister.findFirst({
      where: { id: requestedRegisterId, storeId },
      select: { id: true },
    });
    if (!register) {
      throw new Error('Caja no valida');
    }

    return register.id;
  }

  const registerAtDate = await tx.cashRegister.findFirst({
    where: {
      storeId,
      userId,
      openedAt: { lte: saleDate },
      OR: [{ closedAt: null }, { closedAt: { gte: saleDate } }],
    },
    orderBy: { openedAt: 'desc' },
    select: { id: true },
  });

  if (registerAtDate) {
    return registerAtDate.id;
  }

  const activeRegister = await tx.cashRegister.findFirst({
    where: { storeId, userId, closedAt: null },
    orderBy: { openedAt: 'desc' },
    select: { id: true },
  });

  return activeRegister?.id ?? null;
}

function isSyncEventAlreadyProcessed(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  if (error.code !== 'P2002') {
    return false;
  }

  const target = Array.isArray(error.meta?.target)
    ? error.meta?.target.join(',')
    : String(error.meta?.target ?? '');

  if (!target) {
    return true;
  }

  return target.includes('sync_events') || target.includes('store_id') || target.includes('local_id');
}
