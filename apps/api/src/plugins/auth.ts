import { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      userId: string;
      storeId: string;
      role: 'admin' | 'cashier';
    };
    user: {
      userId: string;
      storeId: string;
      role: 'admin' | 'cashier';
    };
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>;
    authorizeAdmin: (request: FastifyRequest) => Promise<void>;
  }
}

async function authPlugin(fastify: FastifyInstance) {
  const accessSecret = process.env.JWT_ACCESS_SECRET;
  if (!accessSecret) {
    throw new Error('JWT_ACCESS_SECRET is required');
  }

  await fastify.register(jwt, {
    secret: accessSecret,
    sign: {
      expiresIn: '15m',
    },
  });

  fastify.decorate('authenticate', async function (request: FastifyRequest) {
    await request.jwtVerify();
    request.storeId = request.user.storeId;
    request.userId = request.user.userId;
    request.userRole = request.user.role;
  });

  fastify.decorate('authorizeAdmin', async function (request: FastifyRequest) {
    await request.jwtVerify();
    request.storeId = request.user.storeId;
    request.userId = request.user.userId;
    request.userRole = request.user.role;
    if (request.user.role !== 'admin') {
      throw fastify.httpErrors.forbidden('Se requiere rol de administrador');
    }
  });
}

export default fp(authPlugin);
