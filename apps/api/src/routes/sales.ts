import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { createSaleSchema, salesQuerySchema } from '@pos/shared';
import { Decimal } from '@prisma/client/runtime/library';

export async function salesRoutes(fastify: FastifyInstance) {
  async function resolveRegisterId(
    storeId: string,
    userId: string,
    requestedRegisterId?: string | null,
  ): Promise<string> {
    if (requestedRegisterId) {
      const requested = await prisma.cashRegister.findFirst({
        where: {
          id: requestedRegisterId,
          storeId,
          userId,
          closedAt: null,
        },
        select: { id: true },
      });
      if (!requested) {
        throw fastify.httpErrors.badRequest(
          'La venta debe vincularse a una caja abierta del usuario actual',
        );
      }
      return requested.id;
    }

    const activeRegister = await prisma.cashRegister.findFirst({
      where: {
        storeId,
        userId,
        closedAt: null,
      },
      select: { id: true },
    });

    if (!activeRegister) {
      throw fastify.httpErrors.conflict('Debes abrir caja antes de registrar una venta');
    }

    return activeRegister.id;
  }

  // GET /sales
  fastify.get('/sales', { preHandler: [fastify.authenticate] }, async (request) => {
    const query = salesQuerySchema.parse(request.query);
    const skip = (query.page - 1) * query.limit;

    const where: Record<string, unknown> = {
      storeId: request.storeId,
      status: 'completed',
    };

    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) (where.createdAt as Record<string, unknown>).gte = new Date(query.from);
      if (query.to) (where.createdAt as Record<string, unknown>).lte = new Date(query.to);
    }
    if (query.paymentMethod) where.paymentMethod = query.paymentMethod;
    if (query.userId) where.userId = query.userId;

    const [sales, total] = await prisma.$transaction([
      prisma.sale.findMany({
        where,
        include: {
          items: { include: { product: { select: { id: true, name: true, barcode: true, unit: true } } } },
          user: { select: { id: true, name: true } },
          customer: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
      }),
      prisma.sale.count({ where }),
    ]);

    return { data: sales, total, page: query.page, limit: query.limit };
  });

  // GET /sales/:id
  fastify.get('/sales/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const sale = await prisma.sale.findFirst({
      where: { id, storeId: request.storeId },
      include: {
        items: { include: { product: true } },
        user: { select: { id: true, name: true } },
        customer: true,
      },
    });
    if (!sale) return reply.code(404).send({ error: 'Not Found', message: 'Venta no encontrada' });
    return { data: sale };
  });

  // POST /sales - Create new sale
  fastify.post('/sales', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = createSaleSchema.parse(request.body);
    const resolvedRegisterId = await resolveRegisterId(
      request.storeId,
      request.userId,
      body.registerId ?? null,
    );

    // Load products and validate stock
    const productIds = body.items.map((i) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, storeId: request.storeId, active: true },
    });

    if (products.length !== productIds.length) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Uno o más productos no encontrados o inactivos',
      });
    }

    // Validate stock availability
    for (const item of body.items) {
      const product = products.find((p) => p.id === item.productId)!;
      if (new Decimal(product.stock).lt(item.quantity)) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: `Stock insuficiente para: ${product.name} (disponible: ${product.stock})`,
        });
      }
    }

    // Calculate totals
    const itemsWithPrice = body.items.map((item) => {
      const product = products.find((p) => p.id === item.productId)!;
      const price = item.price > 0 ? item.price : Number(product.price);
      const subtotal = price * item.quantity;
      return { ...item, price, subtotal };
    });

    const subtotalSum = itemsWithPrice.reduce((sum, i) => sum + i.subtotal, 0);
    const discount = body.discount ?? 0;
    const total = Math.max(0, subtotalSum - discount);

    // Create sale + update stock in transaction
    const sale = await prisma.$transaction(async (tx) => {
      const newSale = await tx.sale.create({
        data: {
          storeId: request.storeId,
          registerId: resolvedRegisterId,
          userId: request.userId,
          customerId: body.customerId ?? null,
          total,
          discount,
          paymentMethod: body.paymentMethod,
          status: 'completed',
          items: {
            create: itemsWithPrice.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              price: item.price,
              subtotal: item.subtotal,
            })),
          },
        },
        include: {
          items: { include: { product: { select: { id: true, name: true, unit: true } } } },
          user: { select: { id: true, name: true } },
        },
      });

      // Decrement stock for each product
      for (const item of body.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        });
      }

      return newSale;
    });

    return reply.code(201).send({ data: sale });
  });

  // POST /sales/:id/cancel
  fastify.post('/sales/:id/cancel', { preHandler: [fastify.authorizeAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const sale = await prisma.sale.findFirst({
      where: { id, storeId: request.storeId },
      include: { items: true },
    });

    if (!sale) return reply.code(404).send({ error: 'Not Found', message: 'Venta no encontrada' });
    if (sale.status === 'cancelled') {
      return reply.code(400).send({ error: 'Bad Request', message: 'La venta ya está cancelada' });
    }

    // Revert stock + cancel in transaction
    await prisma.$transaction(async (tx) => {
      await tx.sale.update({ where: { id }, data: { status: 'cancelled' } });
      for (const item of sale.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }
    });

    return { data: { success: true } };
  });
}
