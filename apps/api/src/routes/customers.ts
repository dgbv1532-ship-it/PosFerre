import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { createCustomerSchema, updateCustomerSchema } from '@pos/shared';

export async function customerRoutes(fastify: FastifyInstance) {
  fastify.get('/customers', { preHandler: [fastify.authenticate] }, async (request) => {
    const { search } = request.query as { search?: string };

    const customers = await prisma.customer.findMany({
      where: {
        storeId: request.storeId,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search } },
                { email: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
      take: 50,
    });
    return { data: customers };
  });

  fastify.post('/customers', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = createCustomerSchema.parse(request.body);
    const customer = await prisma.customer.create({
      data: { storeId: request.storeId, ...body },
    });
    return reply.code(201).send({ data: customer });
  });

  fastify.put('/customers/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateCustomerSchema.parse(request.body);

    const customer = await prisma.customer.findFirst({ where: { id, storeId: request.storeId } });
    if (!customer) return reply.code(404).send({ error: 'Not Found', message: 'Cliente no encontrado' });

    const updated = await prisma.customer.update({ where: { id }, data: body });
    return { data: updated };
  });
}
