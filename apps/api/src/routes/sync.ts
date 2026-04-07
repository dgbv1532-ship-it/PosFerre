import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { syncRequestSchema } from '@pos/shared';
import { z } from 'zod';

export async function syncRoutes(fastify: FastifyInstance) {
  // POST /sync - Process offline queue and return server updates
  fastify.post('/sync', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = syncRequestSchema.parse(request.body);
    const { deviceId, items } = body;
    const storeId = request.storeId;

    const synced: string[] = [];
    const failed: Array<{ localId: string; error: string }> = [];

    // Process each queued item
    for (const item of items) {
      try {
        if (item.entity === 'sale' && item.operation === 'create') {
          const payload = salePayloadSchema.parse(item.payload);
          await processSaleSync(storeId, request.userId, payload, item.createdAt);
          synced.push(item.localId);
        } else if (item.entity === 'product' && item.operation === 'update') {
          const payload = productUpdatePayloadSchema.parse(item.payload);
          await processProductUpdateSync(storeId, payload);
          synced.push(item.localId);
        } else if (item.entity === 'cash_movement' && item.operation === 'create') {
          const payload = cashMovementPayloadSchema.parse(item.payload);
          await processCashMovementSync(storeId, payload);
          synced.push(item.localId);
        } else {
          synced.push(item.localId); // Unknown ops: acknowledge silently
        }
      } catch (err) {
        failed.push({
          localId: item.localId,
          error: err instanceof Error ? err.message : 'Error desconocido',
        });
      }
    }

    // Return server updates: products and categories updated since last sync
    // Client should send last_sync_at as header or param
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
  localId?: string;
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
  localId: z.string().optional(),
  registerId: z.string().uuid().nullable().optional(),
  customerId: z.string().uuid().nullable().optional(),
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().positive(),
    price: z.number().min(0),
    subtotal: z.number().min(0).optional(),
  })).min(1),
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
  storeId: string,
  userId: string,
  payload: SalePayload,
  queuedCreatedAt: string,
) {
  const saleCreatedAt = payload.createdAt ?? queuedCreatedAt;
  const saleDate = new Date(saleCreatedAt);
  let resolvedRegisterId: string | null = payload.registerId ?? null;

  if (resolvedRegisterId) {
    const register = await prisma.cashRegister.findFirst({
      where: { id: resolvedRegisterId, storeId },
      select: { id: true },
    });
    if (!register) {
      throw new Error('Caja no valida');
    }
  } else {
    const registerAtDate = await prisma.cashRegister.findFirst({
      where: {
        storeId,
        userId,
        openedAt: { lte: saleDate },
        OR: [
          { closedAt: null },
          { closedAt: { gte: saleDate } },
        ],
      },
      orderBy: { openedAt: 'desc' },
      select: { id: true },
    });
    resolvedRegisterId = registerAtDate?.id ?? null;
  }

  if (!resolvedRegisterId) {
    const activeRegister = await prisma.cashRegister.findFirst({
      where: { storeId, userId, closedAt: null },
      orderBy: { openedAt: 'desc' },
      select: { id: true },
    });
    resolvedRegisterId = activeRegister?.id ?? null;
  }

  if (!resolvedRegisterId) {
    throw new Error('No se encontro caja para asociar la venta offline');
  }

  const itemsWithSubtotal = payload.items.map((item) => ({
    ...item,
    subtotal: item.subtotal ?? item.price * item.quantity,
  }));

  const productIds = payload.items.map((i) => i.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, storeId, active: true },
  });

  if (products.length !== productIds.length) {
    throw new Error('Uno o más productos no encontrados');
  }

  await prisma.$transaction(async (tx) => {
    await tx.sale.create({
      data: {
        storeId,
        userId,
        registerId: resolvedRegisterId,
        customerId: payload.customerId ?? null,
        total:
          itemsWithSubtotal.reduce((sum, item) => sum + item.subtotal, 0) - (payload.discount ?? 0),
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

    for (const item of payload.items) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: item.quantity } },
      });
    }
  });
}

async function processProductUpdateSync(storeId: string, payload: ProductUpdatePayload) {
  const product = await prisma.product.findFirst({
    where: { id: payload.id, storeId },
  });
  if (!product) throw new Error('Producto no encontrado');

  // Server wins on stock conflicts — only apply if client's version is newer
  const clientUpdatedAt = new Date(payload.updatedAt);
  if (clientUpdatedAt > product.updatedAt) {
    const data: Record<string, unknown> = {};
    if (payload.stock !== undefined) data.stock = payload.stock;
    if (payload.price !== undefined) data.price = payload.price;
    if (Object.keys(data).length > 0) {
      await prisma.product.update({ where: { id: payload.id }, data });
    }
  }
}

async function processCashMovementSync(storeId: string, payload: CashMovementPayload) {
  const register = await prisma.cashRegister.findFirst({
    where: { id: payload.registerId, storeId },
  });
  if (!register) throw new Error('Caja no encontrada');

  await prisma.cashMovement.create({
    data: {
      registerId: payload.registerId,
      type: payload.type,
      amount: payload.amount,
      description: payload.description,
      createdAt: new Date(payload.createdAt),
    },
  });
}
