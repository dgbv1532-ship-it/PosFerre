import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import {
  openCashRegisterSchema,
  closeCashRegisterSchema,
  cashMovementSchema,
} from '@pos/shared';

function calculateCashSummary(input: {
  openingAmount: number;
  sales: Array<{ total: number; paymentMethod: 'cash' | 'card' | 'transfer' }>;
  cashMovements: Array<{ type: 'in' | 'out'; amount: number }>;
}) {
  const totalSales = input.sales.reduce((sum, sale) => sum + sale.total, 0);
  const cashSales = input.sales
    .filter((sale) => sale.paymentMethod === 'cash')
    .reduce((sum, sale) => sum + sale.total, 0);
  const cardSales = input.sales
    .filter((sale) => sale.paymentMethod === 'card')
    .reduce((sum, sale) => sum + sale.total, 0);
  const transferSales = input.sales
    .filter((sale) => sale.paymentMethod === 'transfer')
    .reduce((sum, sale) => sum + sale.total, 0);
  const totalMovementsIn = input.cashMovements
    .filter((movement) => movement.type === 'in')
    .reduce((sum, movement) => sum + movement.amount, 0);
  const totalMovementsOut = input.cashMovements
    .filter((movement) => movement.type === 'out')
    .reduce((sum, movement) => sum + movement.amount, 0);
  const expectedCash =
    input.openingAmount + cashSales + totalMovementsIn - totalMovementsOut;

  return {
    totalSales,
    cashSales,
    cardSales,
    transferSales,
    totalMovementsIn,
    totalMovementsOut,
    expectedCash,
    salesCount: input.sales.length,
  };
}

export async function cashRoutes(fastify: FastifyInstance) {
  // GET /cash/current - Get active register for current user
  fastify.get('/cash/current', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const register = await prisma.cashRegister.findFirst({
      where: {
        storeId: request.storeId,
        userId: request.userId,
        closedAt: null,
      },
      include: {
        cashMovements: { orderBy: { createdAt: 'desc' } },
        user: { select: { id: true, name: true } },
      },
    });
    return { data: register };
  });

  // GET /cash/registers - List registers (admin)
  fastify.get('/cash/registers', { preHandler: [fastify.authorizeAdmin] }, async (request) => {
    const registers = await prisma.cashRegister.findMany({
      where: { storeId: request.storeId },
      include: {
        user: { select: { id: true, name: true } },
        _count: { select: { sales: true } },
      },
      orderBy: { openedAt: 'desc' },
      take: 50,
    });
    return { data: registers };
  });

  // GET /cash/registers/:id
  fastify.get('/cash/registers/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const register = await prisma.cashRegister.findFirst({
      where: { id, storeId: request.storeId },
      include: {
        cashMovements: { orderBy: { createdAt: 'asc' } },
        user: { select: { id: true, name: true } },
        sales: {
          where: { status: 'completed' },
          select: {
            id: true,
            total: true,
            discount: true,
            paymentMethod: true,
            createdAt: true,
          },
        },
      },
    });
    if (!register) return reply.code(404).send({ error: 'Not Found', message: 'Caja no encontrada' });
    if (request.userRole !== 'admin' && register.userId !== request.userId) {
      return reply.code(403).send({ error: 'Forbidden', message: 'No autorizado para ver esta caja' });
    }

    const summary = calculateCashSummary({
      openingAmount: Number(register.openingAmount),
      sales: register.sales.map((sale) => ({
        total: Number(sale.total),
        paymentMethod: sale.paymentMethod,
      })),
      cashMovements: register.cashMovements.map((movement) => ({
        type: movement.type,
        amount: Number(movement.amount),
      })),
    });

    return {
      data: {
        ...register,
        summary: {
          ...summary,
          expectedAtClose:
            register.expectedClosingAmount !== null
              ? Number(register.expectedClosingAmount)
              : null,
          countedAtClose:
            register.closingAmount !== null ? Number(register.closingAmount) : null,
          closingDifference:
            register.closingDifference !== null
              ? Number(register.closingDifference)
              : null,
        },
      },
    };
  });

  // POST /cash/open - Open cash register
  fastify.post('/cash/open', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = openCashRegisterSchema.parse(request.body);

    // Check if there's already an open register for this user
    const existing = await prisma.cashRegister.findFirst({
      where: { storeId: request.storeId, userId: request.userId, closedAt: null },
    });
    if (existing) {
      return reply.code(409).send({
        error: 'Conflict',
        message: 'Ya tienes una caja abierta. Ciérrala antes de abrir una nueva.',
      });
    }

    const register = await prisma.cashRegister.create({
      data: {
        storeId: request.storeId,
        userId: request.userId,
        openingAmount: body.openingAmount,
        notes: body.notes ?? null,
      },
      include: {
        user: { select: { id: true, name: true } },
      },
    });

    return reply.code(201).send({ data: register });
  });

  // POST /cash/close - Close active register
  fastify.post('/cash/close', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = closeCashRegisterSchema.parse(request.body);

    const register = await prisma.cashRegister.findFirst({
      where: { storeId: request.storeId, userId: request.userId, closedAt: null },
      include: {
        cashMovements: {
          select: { type: true, amount: true },
        },
        sales: {
          where: { status: 'completed' },
          select: { total: true, paymentMethod: true },
        },
      },
    });

    if (!register) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'No tienes una caja abierta',
      });
    }

    const summary = calculateCashSummary({
      openingAmount: Number(register.openingAmount),
      sales: register.sales.map((sale) => ({
        total: Number(sale.total),
        paymentMethod: sale.paymentMethod,
      })),
      cashMovements: register.cashMovements.map((movement) => ({
        type: movement.type,
        amount: Number(movement.amount),
      })),
    });

    const expectedClosingAmount = summary.expectedCash;
    const closingDifference = body.closingAmount - expectedClosingAmount;

    const updated = await prisma.cashRegister.update({
      where: { id: register.id },
      data: {
        closedAt: new Date(),
        closingAmount: body.closingAmount,
        expectedClosingAmount,
        closingDifference,
        notes: body.notes ?? register.notes,
      },
    });

    return { data: updated };
  });

  // POST /cash/movements - Add cash movement
  fastify.post('/cash/movements', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = cashMovementSchema.parse(request.body);

    const register = await prisma.cashRegister.findFirst({
      where: { storeId: request.storeId, userId: request.userId, closedAt: null },
    });

    if (!register) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'No tienes una caja abierta',
      });
    }

    const movement = await prisma.cashMovement.create({
      data: {
        registerId: register.id,
        type: body.type,
        amount: body.amount,
        description: body.description,
      },
    });

    return reply.code(201).send({ data: movement });
  });
}
