import { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { prisma } from '../lib/prisma';

declare module 'fastify' {
  interface FastifyRequest {
    storeId: string;
    userId: string;
    userRole: 'admin' | 'cashier';
  }
}

async function tenantPlugin(fastify: FastifyInstance) {
  // Hook that runs after JWT verification to inject tenant context
  fastify.addHook('preHandler', async (request: FastifyRequest) => {
    if (request.user) {
      request.storeId = request.user.storeId;
      request.userId = request.user.userId;
      request.userRole = request.user.role;
    }
  });
}

export default fp(tenantPlugin);

// Helper: verify resource belongs to current store
export async function verifyStoreMembership(
  storeId: string,
  resourceStoreId: string,
): Promise<void> {
  if (resourceStoreId !== storeId) {
    throw new Error('Recurso no encontrado');
  }
}
