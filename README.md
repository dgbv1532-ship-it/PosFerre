# FerretPOS — Sistema PDV Offline para Ferreterías

Sistema de Punto de Venta (PDV) **offline-first** diseñado para pequeñas ferreterías. Funciona sin internet y sincroniza automáticamente al reconectar. Modelo SaaS multi-tenant.

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + Vite + TailwindCSS (PWA) |
| Offline | Dexie.js (IndexedDB) + Workbox Service Worker |
| Backend | Node.js + Fastify + Prisma ORM |
| Base de datos | PostgreSQL |
| Auth | JWT (access 15min + refresh 30 días) |
| Deploy | Railway.app (API + DB) + Vercel/Cloudflare (Web) |

## Features MVP

- **Punto de Venta**: búsqueda rápida por nombre/código, carrito, descuentos, cobro multi-método
- **Inventario**: CRUD productos, categorías, alertas stock mínimo
- **Caja**: apertura/cierre de turno, ingresos/egresos manuales, resumen
- **Reportes**: ventas del día, top productos, stock bajo
- **Multi-usuario**: roles Admin y Cajero con permisos
- **Offline**: ventas y movimientos guardados localmente y sincronizados al reconectar
- **PWA**: instalable en móvil/tablet como app nativa

## Estructura

```
/
├── apps/
│   ├── api/          # Backend Fastify + Prisma
│   │   └── prisma/   # Schema BD + migraciones + seed
│   └── web/          # Frontend React PWA
├── packages/
│   └── shared/       # Types + Zod schemas compartidos
├── docker-compose.yml
└── .env.example
```

## Setup Local

### Requisitos
- Node.js >= 18 | pnpm >= 8 | Docker

### Pasos
```bash
# 1. Instalar dependencias
pnpm install

# 2. Variables de entorno
cp .env.example apps/api/.env
# Editar apps/api/.env

# 3. Iniciar PostgreSQL
docker-compose up -d

# 4. Migraciones y datos demo
pnpm db:migrate
pnpm db:seed

# 5. Desarrollo
pnpm dev
# API: http://localhost:3001
# Web: http://localhost:5173
```

## Credenciales Demo

| Usuario | Email | Contraseña |
|---------|-------|-----------|
| Admin | admin@demo.com | admin123 |
| Cajero | cajero@demo.com | cajero123 |

## Modelo SaaS

| Plan | Precio | Usuarios | Productos |
|------|--------|----------|-----------|
| Básico | $15/mes | 1 | 500 |
| Pro | $25/mes | 3 | Ilimitado |
| Multi | $45/mes | 10 | Ilimitado |

- 14 días de prueba gratis sin tarjeta
- Costo infraestructura: ~$5-10/mes base en Railway

## Deploy

```bash
# Railway (API + DB)
railway up

# Variables requeridas en producción:
# DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, FRONTEND_URL, NODE_ENV=production
```

## Seguridad

- HTTPS obligatorio (Cloudflare)
- JWT refresh token rotation
- Rate limiting: 200 req/min, 5 intentos login/min
- Bcrypt rounds=12
- Row-level isolation por store_id (multi-tenant)
- Zod validation en todos los endpoints