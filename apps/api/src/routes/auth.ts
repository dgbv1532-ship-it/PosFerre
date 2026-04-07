import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { prisma } from '../lib/prisma';
import {
  loginSchema,
  registerStoreSchema,
  refreshTokenSchema,
} from '@pos/shared';

export async function authRoutes(fastify: FastifyInstance) {
  // POST /auth/register - Register new store + admin user
  fastify.post('/register', async (request, reply) => {
    const body = registerStoreSchema.parse(request.body);

    // Check if email already exists globally
    const existingUser = await prisma.user.findFirst({
      where: { email: body.email },
    });
    if (existingUser) {
      return reply.code(409).send({
        error: 'Conflict',
        message: 'Este email ya esta registrado',
      });
    }

    const passwordHash = await bcrypt.hash(body.password, 12);

    const store = await prisma.store.create({
      data: {
        name: body.storeName,
        plan: 'basic',
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        users: {
          create: {
            email: body.email,
            passwordHash,
            name: body.adminName,
            role: 'admin',
          },
        },
      },
      include: { users: true },
    });

    const user = store.users[0];
    const tokens = await generateTokens(fastify, user.id, store.id, 'admin');

    return reply.code(201).send({
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          storeId: store.id,
          storeName: store.name,
        },
        ...tokens,
      },
    });
  });

  // POST /auth/login
  fastify.post(
    '/login',
    {
      config: {
        rateLimit: { max: 5, timeWindow: '1 minute' },
      },
    },
    async (request, reply) => {
      const body = loginSchema.parse(request.body);

      const candidates = await prisma.user.findMany({
        where: { email: body.email, active: true },
        include: { store: true },
      });

      const matchingUsers: typeof candidates = [];
      for (const candidate of candidates) {
        if (await bcrypt.compare(body.password, candidate.passwordHash)) {
          matchingUsers.push(candidate);
        }
      }

      if (matchingUsers.length === 0) {
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'Credenciales invalidas',
        });
      }

      if (matchingUsers.length > 1) {
        return reply.code(409).send({
          error: 'Conflict',
          message: 'Credenciales ambiguas. Contacta soporte para seleccionar tienda.',
        });
      }

      const user = matchingUsers[0];

      const tokens = await generateTokens(
        fastify,
        user.id,
        user.storeId,
        user.role as 'admin' | 'cashier',
      );

      return reply.send({
        data: {
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            storeId: user.storeId,
            storeName: user.store.name,
          },
          ...tokens,
        },
      });
    },
  );

  // POST /auth/refresh
  fastify.post('/refresh', async (request, reply) => {
    const { refreshToken } = refreshTokenSchema.parse(request.body);
    const refreshTokenHash = hashRefreshToken(refreshToken);

    const stored = await prisma.refreshToken.findUnique({
      where: { token: refreshTokenHash },
      include: { user: true },
    });

    if (!stored || stored.expiresAt < new Date()) {
      if (stored) {
        await prisma.refreshToken.delete({ where: { id: stored.id } });
      }
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Refresh token invalido o expirado',
      });
    }

    if (!stored.user.active) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Usuario desactivado',
      });
    }

    // Rotate: delete old, create new
    await prisma.refreshToken.delete({ where: { id: stored.id } });
    const tokens = await generateTokens(
      fastify,
      stored.user.id,
      stored.user.storeId,
      stored.user.role as 'admin' | 'cashier',
    );

    return reply.send({ data: tokens });
  });

  // POST /auth/logout
  fastify.post(
    '/logout',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { refreshToken } = refreshTokenSchema.parse(request.body);
      await prisma.refreshToken.deleteMany({ where: { token: hashRefreshToken(refreshToken) } });
      return reply.send({ data: { success: true } });
    },
  );

  // GET /auth/me
  fastify.get(
    '/me',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const user = await prisma.user.findUnique({
        where: { id: request.user.userId },
        include: { store: true },
      });

      if (!user) {
        return reply.code(404).send({ error: 'Not Found', message: 'Usuario no encontrado' });
      }

      return reply.send({
        data: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          storeId: user.storeId,
          storeName: user.store.name,
          plan: user.store.plan,
          trialEndsAt: user.store.trialEndsAt,
        },
      });
    },
  );
}

async function generateTokens(
  fastify: FastifyInstance,
  userId: string,
  storeId: string,
  role: 'admin' | 'cashier',
) {
  const accessToken = fastify.jwt.sign({ userId, storeId, role });

  const refreshTokenValue = crypto.randomBytes(64).toString('hex');
  const refreshTokenHash = hashRefreshToken(refreshTokenValue);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  await prisma.refreshToken.create({
    data: {
      userId,
      token: refreshTokenHash,
      expiresAt,
    },
  });

  // Clean up expired tokens for this user
  await prisma.refreshToken.deleteMany({
    where: {
      userId,
      expiresAt: { lt: new Date() },
    },
  });

  return {
    accessToken,
    refreshToken: refreshTokenValue,
  };
}

function hashRefreshToken(refreshToken: string): string {
  const refreshSecret = process.env.JWT_REFRESH_SECRET;
  if (!refreshSecret) {
    throw new Error('JWT_REFRESH_SECRET is required');
  }

  return crypto
    .createHash('sha256')
    .update(`${refreshToken}.${refreshSecret}`)
    .digest('hex');
}
