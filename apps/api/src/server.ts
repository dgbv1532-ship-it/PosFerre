import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import authPlugin from './plugins/auth';
import tenantPlugin from './plugins/tenant';
import { authRoutes } from './routes/auth';
import { productRoutes } from './routes/products';
import { salesRoutes } from './routes/sales';
import { cashRoutes } from './routes/cash';
import { reportsRoutes } from './routes/reports';
import { userRoutes } from './routes/users';
import { customerRoutes } from './routes/customers';
import { syncRoutes } from './routes/sync';

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

async function buildServer() {
  const fastify = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
      transport:
        process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  });

  // Security
  await fastify.register(helmet, {
    contentSecurityPolicy: false, // PWA needs flexibility
  });

  await fastify.register(cors, {
    origin: (origin, callback) => {
      // Allow localhost on any port in development
      if (!origin || /^http:\/\/localhost(:\d+)?$/.test(origin) || origin === FRONTEND_URL) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'), false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await fastify.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
  });

  // Utilities
  await fastify.register(sensible);

  // Auth & tenant plugins
  await fastify.register(authPlugin);
  await fastify.register(tenantPlugin);

  // Health check
  fastify.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // Routes
  await fastify.register(authRoutes, { prefix: '/api/auth' });
  await fastify.register(productRoutes, { prefix: '/api' });
  await fastify.register(salesRoutes, { prefix: '/api' });
  await fastify.register(cashRoutes, { prefix: '/api' });
  await fastify.register(reportsRoutes, { prefix: '/api' });
  await fastify.register(userRoutes, { prefix: '/api' });
  await fastify.register(customerRoutes, { prefix: '/api' });
  await fastify.register(syncRoutes, { prefix: '/api' });

  // Global error handler
  fastify.setErrorHandler((error, _request, reply) => {
    fastify.log.error(error);

    if (error.name === 'ZodError') {
      return reply.code(400).send({
        error: 'Validation Error',
        message: 'Datos inválidos',
        details: JSON.parse(error.message),
      });
    }

    if (error.statusCode) {
      return reply.code(error.statusCode).send({
        error: error.name,
        message: error.message,
      });
    }

    return reply.code(500).send({
      error: 'Internal Server Error',
      message: 'Error interno del servidor',
    });
  });

  return fastify;
}

async function start() {
  try {
    const server = await buildServer();
    await server.listen({ port: PORT, host: HOST });
    console.log(`\n🚀 API running at http://localhost:${PORT}`);
    console.log(`📋 Health: http://localhost:${PORT}/health\n`);
  } catch (err) {
    console.error('❌ Server failed to start:', err);
    process.exit(1);
  }
}

start();
