import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import {
  createProductSchema,
  updateProductSchema,
  adjustStockSchema,
  productQuerySchema,
  createCategorySchema,
  updateCategorySchema,
} from '@pos/shared';

export async function productRoutes(fastify: FastifyInstance) {
  // ============================================
  // Categories
  // ============================================

  fastify.get('/categories', { preHandler: [fastify.authenticate] }, async (request) => {
    const categories = await prisma.category.findMany({
      where: { storeId: request.storeId },
      orderBy: { name: 'asc' },
    });
    return { data: categories };
  });

  fastify.post('/categories', { preHandler: [fastify.authorizeAdmin] }, async (request, reply) => {
    const body = createCategorySchema.parse(request.body);
    const category = await prisma.category.create({
      data: { storeId: request.storeId, name: body.name },
    });
    return reply.code(201).send({ data: category });
  });

  fastify.put('/categories/:id', { preHandler: [fastify.authorizeAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateCategorySchema.parse(request.body);

    const category = await prisma.category.findFirst({
      where: { id, storeId: request.storeId },
    });
    if (!category) return reply.code(404).send({ error: 'Not Found', message: 'Categoría no encontrada' });

    const updated = await prisma.category.update({
      where: { id },
      data: body,
    });
    return { data: updated };
  });

  fastify.delete('/categories/:id', { preHandler: [fastify.authorizeAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const category = await prisma.category.findFirst({
      where: { id, storeId: request.storeId },
    });
    if (!category) return reply.code(404).send({ error: 'Not Found', message: 'Categoría no encontrada' });

    await prisma.category.delete({ where: { id } });
    return { data: { success: true } };
  });

  // ============================================
  // Products
  // ============================================

  fastify.get('/products', { preHandler: [fastify.authenticate] }, async (request) => {
    const query = productQuerySchema.parse(request.query);
    const skip = (query.page - 1) * query.limit;

    const where: Record<string, unknown> = {
      storeId: request.storeId,
      active: query.active,
    };

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { barcode: { contains: query.search } },
      ];
    }

    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.lowStock) {
      where.stock = { lte: prisma.product.fields.minStock };
    }

    const [products, total] = await prisma.$transaction([
      prisma.product.findMany({
        where,
        include: { category: true },
        orderBy: { name: 'asc' },
        skip,
        take: query.limit,
      }),
      prisma.product.count({ where }),
    ]);

    return {
      data: products,
      total,
      page: query.page,
      limit: query.limit,
    };
  });

  fastify.get('/products/low-stock', { preHandler: [fastify.authenticate] }, async (request) => {
    const products = await prisma.$queryRaw`
      SELECT p.*, c.name as category_name
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.store_id = ${request.storeId}
        AND p.active = true
        AND p.stock <= p.min_stock
      ORDER BY (p.stock - p.min_stock) ASC
      LIMIT 50
    `;
    return { data: products };
  });

  fastify.get('/products/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const product = await prisma.product.findFirst({
      where: { id, storeId: request.storeId },
      include: { category: true },
    });
    if (!product) return reply.code(404).send({ error: 'Not Found', message: 'Producto no encontrado' });
    return { data: product };
  });

  fastify.post('/products', { preHandler: [fastify.authorizeAdmin] }, async (request, reply) => {
    const body = createProductSchema.parse(request.body);

    if (body.barcode) {
      const existing = await prisma.product.findFirst({
        where: { storeId: request.storeId, barcode: body.barcode },
      });
      if (existing) {
        return reply.code(409).send({
          error: 'Conflict',
          message: `El código de barras ${body.barcode} ya existe`,
        });
      }
    }

    const product = await prisma.product.create({
      data: {
        storeId: request.storeId,
        name: body.name,
        barcode: body.barcode ?? null,
        categoryId: body.categoryId ?? null,
        price: body.price,
        cost: body.cost ?? 0,
        stock: body.stock ?? 0,
        minStock: body.minStock ?? 5,
        unit: body.unit ?? 'unidad',
        imageUrl: body.imageUrl ?? null,
        active: body.active ?? true,
      },
      include: { category: true },
    });

    return reply.code(201).send({ data: product });
  });

  fastify.put('/products/:id', { preHandler: [fastify.authorizeAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateProductSchema.parse(request.body);

    const product = await prisma.product.findFirst({
      where: { id, storeId: request.storeId },
    });
    if (!product) return reply.code(404).send({ error: 'Not Found', message: 'Producto no encontrado' });

    if (body.barcode && body.barcode !== product.barcode) {
      const existing = await prisma.product.findFirst({
        where: { storeId: request.storeId, barcode: body.barcode, id: { not: id } },
      });
      if (existing) {
        return reply.code(409).send({
          error: 'Conflict',
          message: `El código de barras ${body.barcode} ya existe`,
        });
      }
    }

    const updated = await prisma.product.update({
      where: { id },
      data: body,
      include: { category: true },
    });

    return { data: updated };
  });

  fastify.patch('/products/:id/stock', { preHandler: [fastify.authorizeAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = adjustStockSchema.parse(request.body);

    const product = await prisma.product.findFirst({
      where: { id, storeId: request.storeId },
    });
    if (!product) return reply.code(404).send({ error: 'Not Found', message: 'Producto no encontrado' });

    const updated = await prisma.product.update({
      where: { id },
      data: { stock: { increment: body.quantity } },
    });

    return { data: updated };
  });

  fastify.delete('/products/:id', { preHandler: [fastify.authorizeAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const product = await prisma.product.findFirst({
      where: { id, storeId: request.storeId },
    });
    if (!product) return reply.code(404).send({ error: 'Not Found', message: 'Producto no encontrado' });

    // Soft delete
    await prisma.product.update({ where: { id }, data: { active: false } });
    return { data: { success: true } };
  });
}
