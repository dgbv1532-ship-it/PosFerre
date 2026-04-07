import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { createUserSchema, updateUserSchema, changePasswordSchema } from '@pos/shared';

export async function userRoutes(fastify: FastifyInstance) {
  // GET /users - List store users (admin only)
  fastify.get('/users', { preHandler: [fastify.authorizeAdmin] }, async (request) => {
    const users = await prisma.user.findMany({
      where: { storeId: request.storeId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
      },
      orderBy: { name: 'asc' },
    });
    return { data: users };
  });

  // POST /users - Create user (admin only)
  fastify.post('/users', { preHandler: [fastify.authorizeAdmin] }, async (request, reply) => {
    const body = createUserSchema.parse(request.body);

    const existing = await prisma.user.findFirst({
      where: { storeId: request.storeId, email: body.email },
    });
    if (existing) {
      return reply.code(409).send({
        error: 'Conflict',
        message: 'Ya existe un usuario con ese email en esta tienda',
      });
    }

    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = await prisma.user.create({
      data: {
        storeId: request.storeId,
        email: body.email,
        passwordHash,
        name: body.name,
        role: body.role ?? 'cashier',
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
      },
    });

    return reply.code(201).send({ data: user });
  });

  // PUT /users/:id - Update user (admin only)
  fastify.put('/users/:id', { preHandler: [fastify.authorizeAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateUserSchema.parse(request.body);

    const user = await prisma.user.findFirst({
      where: { id, storeId: request.storeId },
    });
    if (!user) return reply.code(404).send({ error: 'Not Found', message: 'Usuario no encontrado' });

    const updated = await prisma.user.update({
      where: { id },
      data: body,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
      },
    });

    return { data: updated };
  });

  // POST /users/change-password - Change own password
  fastify.post('/users/change-password', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = changePasswordSchema.parse(request.body);

    const user = await prisma.user.findUnique({ where: { id: request.userId } });
    if (!user) return reply.code(404).send({ error: 'Not Found', message: 'Usuario no encontrado' });

    const valid = await bcrypt.compare(body.currentPassword, user.passwordHash);
    if (!valid) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Contraseña actual incorrecta',
      });
    }

    const passwordHash = await bcrypt.hash(body.newPassword, 12);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

    // Invalidate all refresh tokens
    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });

    return { data: { success: true } };
  });
}
