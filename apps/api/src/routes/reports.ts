import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { z } from 'zod';

const dateRangeSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

const dashboardQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(90).default(14),
});

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function resolveRange(from?: string, to?: string) {
  const today = new Date();
  return {
    from: from ? new Date(from) : startOfDay(today),
    to: to ? new Date(to) : endOfDay(today),
  };
}

export async function reportsRoutes(fastify: FastifyInstance) {
  // GET /reports/daily - Sales summary in range
  fastify.get('/reports/daily', { preHandler: [fastify.authorizeAdmin] }, async (request) => {
    const query = dateRangeSchema.parse(request.query);
    const { from, to } = resolveRange(query.from, query.to);

    const sales = await prisma.sale.findMany({
      where: {
        storeId: request.storeId,
        status: 'completed',
        createdAt: { gte: from, lte: to },
      },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true } },
          },
        },
      },
    });

    const byPaymentMethod = { cash: 0, card: 0, transfer: 0 };
    let totalRevenue = 0;
    let totalDiscount = 0;

    for (const sale of sales) {
      totalRevenue += Number(sale.total);
      totalDiscount += Number(sale.discount);
      byPaymentMethod[sale.paymentMethod as keyof typeof byPaymentMethod] += Number(sale.total);
    }

    const productMap = new Map<string, { name: string; quantity: number; revenue: number }>();
    for (const sale of sales) {
      for (const item of sale.items) {
        const key = item.productId;
        const existing = productMap.get(key) ?? { name: item.product.name, quantity: 0, revenue: 0 };
        productMap.set(key, {
          name: existing.name,
          quantity: existing.quantity + Number(item.quantity),
          revenue: existing.revenue + Number(item.subtotal),
        });
      }
    }

    const topProducts = Array.from(productMap.entries())
      .map(([productId, data]) => ({ productId, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    return {
      data: {
        from: from.toISOString(),
        to: to.toISOString(),
        totalSales: sales.length,
        totalRevenue,
        totalDiscount,
        byPaymentMethod,
        topProducts,
      },
    };
  });

  // GET /reports/low-stock
  fastify.get('/reports/low-stock', { preHandler: [fastify.authorizeAdmin] }, async (request) => {
    const products = await prisma.$queryRaw<
      Array<{
        id: string;
        name: string;
        stock: string;
        min_stock: string;
        category_name: string | null;
      }>
    >`
      SELECT p.id, p.name, p.stock::text, p.min_stock::text, c.name as category_name
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.store_id = ${request.storeId}
        AND p.active = true
        AND p.stock <= p.min_stock
      ORDER BY (p.stock - p.min_stock) ASC
      LIMIT 50
    `;

    return {
      data: products.map((p) => ({
        productId: p.id,
        name: p.name,
        stock: Number(p.stock),
        minStock: Number(p.min_stock),
        category: p.category_name,
      })),
    };
  });

  // GET /reports/sales-by-period - Sales grouped by day
  fastify.get('/reports/sales-by-period', { preHandler: [fastify.authorizeAdmin] }, async (request) => {
    const query = z.object({
      from: z.string().datetime(),
      to: z.string().datetime(),
    }).parse(request.query);

    const rows = await prisma.$queryRaw<
      Array<{ day: Date; count: string; total: string }>
    >`
      SELECT
        DATE_TRUNC('day', created_at) as day,
        COUNT(*)::text as count,
        SUM(total)::text as total
      FROM sales
      WHERE store_id = ${request.storeId}
        AND status = 'completed'
        AND created_at >= ${new Date(query.from)}
        AND created_at <= ${new Date(query.to)}
      GROUP BY DATE_TRUNC('day', created_at)
      ORDER BY day ASC
    `;

    return {
      data: rows.map((r) => ({
        day: r.day.toISOString().split('T')[0],
        count: Number(r.count),
        total: Number(r.total),
      })),
    };
  });

  // GET /reports/dashboard - Operational dashboard metrics
  fastify.get('/reports/dashboard', { preHandler: [fastify.authorizeAdmin] }, async (request) => {
    const { days } = dashboardQuerySchema.parse(request.query);

    const now = new Date();
    const todayFrom = startOfDay(now);
    const last7From = startOfDay(new Date(now));
    last7From.setDate(last7From.getDate() - 6);

    const last30From = startOfDay(new Date(now));
    last30From.setDate(last30From.getDate() - 29);

    const trendFrom = startOfDay(new Date(now));
    trendFrom.setDate(trendFrom.getDate() - (days - 1));

    const [
      todayAgg,
      last7Agg,
      last30Agg,
      lowStockCount,
      openRegisters,
      trendRows,
      topItems,
    ] = await prisma.$transaction([
      prisma.sale.aggregate({
        where: {
          storeId: request.storeId,
          status: 'completed',
          createdAt: { gte: todayFrom, lte: now },
        },
        _count: { _all: true },
        _sum: { total: true },
        _avg: { total: true },
      }),
      prisma.sale.aggregate({
        where: {
          storeId: request.storeId,
          status: 'completed',
          createdAt: { gte: last7From, lte: now },
        },
        _sum: { total: true },
      }),
      prisma.sale.aggregate({
        where: {
          storeId: request.storeId,
          status: 'completed',
          createdAt: { gte: last30From, lte: now },
        },
        _sum: { total: true },
      }),
      prisma.product.count({
        where: {
          storeId: request.storeId,
          active: true,
          stock: { lte: prisma.product.fields.minStock },
        },
      }),
      prisma.cashRegister.count({
        where: {
          storeId: request.storeId,
          closedAt: null,
        },
      }),
      prisma.$queryRaw<Array<{ day: Date; count: string; total: string }>>`
        SELECT
          DATE_TRUNC('day', created_at) as day,
          COUNT(*)::text as count,
          SUM(total)::text as total
        FROM sales
        WHERE store_id = ${request.storeId}
          AND status = 'completed'
          AND created_at >= ${trendFrom}
          AND created_at <= ${now}
        GROUP BY DATE_TRUNC('day', created_at)
        ORDER BY day ASC
      `,
      prisma.saleItem.groupBy({
        by: ['productId'],
        where: {
          sale: {
            storeId: request.storeId,
            status: 'completed',
            createdAt: { gte: trendFrom, lte: now },
          },
        },
        _sum: {
          quantity: true,
          subtotal: true,
        },
        orderBy: {
          _sum: { subtotal: 'desc' },
        },
        take: 5,
      }),
    ]);

    const topProductIds = topItems.map((item) => item.productId);
    const products = topProductIds.length
      ? await prisma.product.findMany({
          where: { id: { in: topProductIds }, storeId: request.storeId },
          select: { id: true, name: true },
        })
      : [];

    const productMap = new Map(products.map((p) => [p.id, p.name]));

    return {
      data: {
        period: {
          from: trendFrom.toISOString(),
          to: now.toISOString(),
          days,
        },
        metrics: {
          todaySalesCount: todayAgg._count._all,
          todayRevenue: Number(todayAgg._sum.total ?? 0),
          avgTicketToday: Number(todayAgg._avg.total ?? 0),
          last7Revenue: Number(last7Agg._sum.total ?? 0),
          last30Revenue: Number(last30Agg._sum.total ?? 0),
          lowStockCount,
          openRegisters,
        },
        trend: trendRows.map((row) => ({
          day: row.day.toISOString().split('T')[0],
          count: Number(row.count),
          total: Number(row.total),
        })),
        topProducts: topItems.map((item) => ({
          productId: item.productId,
          name: productMap.get(item.productId) ?? 'Producto',
          quantity: Number(item._sum?.quantity ?? 0),
          total: Number(item._sum?.subtotal ?? 0),
        })),
      },
    };
  });
}
