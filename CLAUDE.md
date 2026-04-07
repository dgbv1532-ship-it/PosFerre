# CLAUDE.md — Contexto completo del proyecto FerretPOS

> Este archivo contiene TODO el contexto necesario para que cualquier IA
> (Claude, GPT, Copilot, etc.) entienda, modifique y escale este proyecto
> sin necesidad de preguntar nada. Léelo completo antes de hacer cambios.

---

## 1. ¿Qué es FerretPOS?

Sistema de **Punto de Venta (PDV/POS) offline-first** para ferreterías pequeñas en Latinoamérica.
Modelo de negocio: **SaaS multi-tenant** — un solo deploy sirve a múltiples ferreterías,
cada una aislada por `store_id` en la base de datos.

**Propuesta de valor:** Funciona sin internet. El dueño de una ferretería instala la PWA en una
tablet barata, carga sus productos, y puede vender inmediatamente. Si se cae el internet, sigue
funcionando. Al reconectar, sincroniza automáticamente.

---

## 2. Stack tecnológico

```
Frontend:       React 18 + Vite + TypeScript + TailwindCSS
PWA:            vite-plugin-pwa (Workbox) — cache de assets + API responses
Offline DB:     Dexie.js (wrapper sobre IndexedDB)
Estado:         Zustand (carrito POS) + TanStack React Query (server state)
Routing:        React Router v6
Backend:        Node.js + Fastify + TypeScript
ORM:            Prisma (PostgreSQL)
Auth:           JWT access token (15min) + refresh token (30 días) con rotación
Validación:     Zod (schemas compartidos entre frontend y backend)
Monorepo:       pnpm workspaces
```

---

## 3. Estructura de directorios

```
/
├── CLAUDE.md                       ← ESTE ARCHIVO (contexto para IA)
├── docs/
│   ├── ARCHITECTURE.md             ← Arquitectura técnica detallada
│   ├── SCALING.md                  ← Plan de escalabilidad por fases
│   └── DEPLOY-HETZNER.md          ← Guía de deploy en VPS Hetzner
│
├── apps/
│   ├── api/                        ← Backend (Fastify + Prisma)
│   │   ├── prisma/
│   │   │   ├── schema.prisma       ← Schema de BD (8 tablas + enums)
│   │   │   └── seed.ts             ← Datos demo (15 productos ferretería)
│   │   └── src/
│   │       ├── server.ts           ← Entry point, registra plugins y routes
│   │       ├── lib/prisma.ts       ← Singleton Prisma Client
│   │       ├── plugins/
│   │       │   ├── auth.ts         ← Plugin JWT (@fastify/jwt) + decorators
│   │       │   └── tenant.ts       ← Middleware multi-tenant (inyecta storeId)
│   │       └── routes/
│   │           ├── auth.ts         ← Login, register, refresh, logout, /me
│   │           ├── products.ts     ← CRUD productos + categorías + stock
│   │           ├── sales.ts        ← Crear venta, listar, cancelar
│   │           ├── cash.ts         ← Apertura/cierre caja, movimientos
│   │           ├── reports.ts      ← Ventas del día, stock bajo, por período
│   │           ├── users.ts        ← CRUD usuarios, cambio contraseña
│   │           ├── customers.ts    ← CRUD clientes
│   │           └── sync.ts         ← Endpoint de sincronización offline
│   │
│   └── web/                        ← Frontend PWA (React)
│       ├── vite.config.ts          ← Config Vite + PWA manifest + Workbox
│       ├── index.html
│       └── src/
│           ├── main.tsx            ← Entry: QueryClient + Toaster
│           ├── App.tsx             ← Router + rutas protegidas + sync on load
│           ├── index.css           ← Tailwind base + componentes custom (btn, input, card)
│           ├── db/
│           │   └── local.ts        ← Dexie schema (products, categories, syncQueue)
│           ├── lib/
│           │   ├── api.ts          ← Axios instance + interceptors (JWT refresh automático)
│           │   ├── sync.ts         ← Motor de sincronización (push queue + pull updates)
│           │   └── utils.ts        ← formatCurrency, formatDate, cn(), helpers
│           ├── store/
│           │   ├── auth.ts         ← Zustand: user, tokens, login/logout (persistido)
│           │   └── pos.ts          ← Zustand: carrito, descuento, pago, vuelto
│           ├── hooks/
│           │   ├── useOffline.ts   ← Detecta online/offline + trigger sync
│           │   ├── useProducts.ts  ← React Query hooks + búsqueda offline con Dexie
│           │   ├── useSales.ts     ← Crear venta (online o queue offline), reportes
│           │   └── useCash.ts      ← Caja: abrir, cerrar, movimientos
│           ├── components/
│           │   ├── layout/Layout.tsx    ← Sidebar desktop + bottom nav mobile + offline indicator
│           │   └── ui/{Spinner,Modal,EmptyState}.tsx
│           └── pages/
│               ├── Login.tsx       ← Login con credenciales demo
│               ├── Register.tsx    ← Onboarding nueva tienda (SaaS)
│               ├── POS.tsx         ← Pantalla principal: búsqueda + carrito + checkout modal
│               ├── Inventory.tsx   ← Listado productos + modal crear/editar
│               ├── CashRegister.tsx ← Apertura/cierre + movimientos + resumen
│               ├── Reports.tsx     ← Tabs: ventas del día + stock bajo
│               └── Settings.tsx    ← Tabs: usuarios + categorías + contraseña
│
├── packages/
│   └── shared/                     ← Package compartido frontend ↔ backend
│       └── src/
│           ├── types.ts            ← Interfaces TypeScript (Product, Sale, User, etc.)
│           ├── schemas.ts          ← Zod schemas (validación) + tipos inferidos
│           └── index.ts            ← Re-export todo
│
├── docker-compose.yml              ← PostgreSQL 16 para dev local
├── .env.example                    ← Variables de entorno documentadas
├── .github/workflows/ci.yml       ← CI: typecheck + build
└── railway.toml                    ← Config deploy Railway
```

---

## 4. Base de datos — Schema

```
stores              ← Tenants (ferreterías). Cada una tiene su plan SaaS.
  └── users         ← Usuarios de la tienda (admin o cashier)
      └── refresh_tokens  ← JWT refresh tokens (rotación)
  └── categories    ← Categorías de productos (Herramientas, Electricidad, etc.)
  └── products      ← Productos con precio, costo, stock, stock mínimo, barcode
  └── customers     ← Clientes (opcional)
  └── cash_registers ← Turnos de caja (apertura → cierre)
      └── cash_movements ← Ingresos/egresos manuales en la caja
      └── sales     ← Ventas (total, descuento, método de pago, estado)
          └── sale_items ← Items de cada venta (producto, cantidad, precio, subtotal)
```

**Multi-tenancy:** TODAS las tablas tienen `store_id`. El middleware `tenant.ts` lo
inyecta automáticamente desde el JWT. Nunca se hace una query sin filtrar por `store_id`.

**Tipos monetarios:** `Decimal(10,2)` para dinero, `Decimal(10,3)` para cantidades (metros, kilos).

**Soft delete:** Productos se desactivan (`active = false`), no se borran.

---

## 5. Flujo offline — Cómo funciona la sincronización

```
ONLINE:
  Usuario → API → PostgreSQL → respuesta → UI
  (simultáneamente se cachea en IndexedDB para lectura offline)

OFFLINE:
  Usuario → IndexedDB (lectura) → UI
  Escrituras → IndexedDB sync_queue (cola de pendientes)

RECONEXIÓN:
  1. Evento 'online' detectado por useOffline hook
  2. syncWithServer() se ejecuta automáticamente
  3. POST /api/sync envía items de la cola
  4. Servidor procesa cada item (ventas, movimientos, etc.)
  5. Servidor responde con: items sincronizados + productos actualizados
  6. Cliente limpia cola + actualiza IndexedDB con datos del servidor
  7. localStorage guarda timestamp de última sincronización
```

**Resolución de conflictos:**
- **Ventas:** append-only, nunca se sobreescriben
- **Productos:** last-write-wins por `updated_at` (servidor gana en empate)
- **Stock:** el servidor es la fuente de verdad final

---

## 6. Seguridad

- **JWT:** access token 15min + refresh token 30 días con rotación
- **Passwords:** bcrypt rounds=12
- **Tenant isolation:** middleware verifica `store_id` del JWT en CADA request
- **Rate limiting:** 200 req/min general, 5 intentos login/min por IP
- **Validación:** Zod en todos los endpoints (schemas compartidos con frontend)
- **SQL injection:** imposible con Prisma (queries parametrizadas)
- **Headers:** Helmet.js (X-Frame-Options, HSTS, etc.)
- **CORS:** whitelist explícita de orígenes permitidos
- **Refresh tokens:** almacenados en BD, rotados en cada uso, eliminados en logout

---

## 7. API — Endpoints principales

```
Auth:
  POST /api/auth/register          ← Crear tienda nueva + admin
  POST /api/auth/login             ← Login → JWT tokens
  POST /api/auth/refresh           ← Renovar access token
  POST /api/auth/logout            ← Invalidar refresh token
  GET  /api/auth/me                ← Datos del usuario actual + tienda

Productos:
  GET    /api/products             ← Listar (paginado, búsqueda, filtro categoría)
  GET    /api/products/:id         ← Detalle
  POST   /api/products             ← Crear (admin)
  PUT    /api/products/:id         ← Actualizar (admin)
  PATCH  /api/products/:id/stock   ← Ajustar stock +/- (admin)
  DELETE /api/products/:id         ← Soft delete (admin)
  GET    /api/products/low-stock   ← Productos bajo mínimo

Categorías:
  GET    /api/categories           ← Listar
  POST   /api/categories           ← Crear (admin)
  PUT    /api/categories/:id       ← Actualizar (admin)
  DELETE /api/categories/:id       ← Eliminar (admin)

Ventas:
  GET    /api/sales                ← Listar (filtro por fecha, método pago, usuario)
  GET    /api/sales/:id            ← Detalle con items
  POST   /api/sales                ← Crear venta (reduce stock en transacción)
  POST   /api/sales/:id/cancel     ← Cancelar (admin, restaura stock)

Caja:
  GET    /api/cash/current         ← Caja activa del usuario actual
  GET    /api/cash/registers       ← Historial de cajas
  GET    /api/cash/registers/:id   ← Detalle con resumen calculado
  POST   /api/cash/open            ← Abrir caja con monto inicial
  POST   /api/cash/close           ← Cerrar caja con conteo
  POST   /api/cash/movements       ← Registrar ingreso/egreso manual

Reportes:
  GET    /api/reports/daily        ← Resumen del día (ventas, top productos, por método pago)
  GET    /api/reports/low-stock    ← Productos bajo stock mínimo
  GET    /api/reports/sales-by-period ← Ventas agrupadas por día

Usuarios (admin):
  GET    /api/users                ← Listar usuarios de la tienda
  POST   /api/users                ← Crear usuario
  PUT    /api/users/:id            ← Actualizar (rol, estado)
  POST   /api/users/change-password ← Cambiar contraseña propia

Clientes:
  GET    /api/customers            ← Listar (con búsqueda)
  POST   /api/customers            ← Crear
  PUT    /api/customers/:id        ← Actualizar

Sync:
  POST   /api/sync                 ← Sincronizar cola offline → servidor
```

---

## 8. Roles y permisos

| Acción | Admin | Cajero |
|--------|:-----:|:------:|
| POS (vender) | ✅ | ✅ |
| Ver inventario | ✅ | ✅ |
| Crear/editar productos | ✅ | ❌ |
| Abrir/cerrar caja | ✅ | ✅ |
| Ver reportes | ✅ | ❌ |
| Gestionar usuarios | ✅ | ❌ |
| Gestionar categorías | ✅ | ❌ |
| Cancelar ventas | ✅ | ❌ |

---

## 9. Convenciones de código

- **Lenguaje:** TypeScript estricto en todo el proyecto
- **Validación:** Zod schemas en `packages/shared/src/schemas.ts` — se usan tanto en API como frontend
- **Tipos:** Interfaces en `packages/shared/src/types.ts` — son la fuente de verdad
- **API responses:** Siempre `{ data: T }` o `{ data: T[], total, page, limit }`
- **Errores API:** `{ error: string, message: string }` con HTTP status apropiado
- **Multi-tenant:** Toda query DEBE incluir `storeId` del request. Usar `request.storeId` en routes
- **Moneda:** Usar `formatCurrency()` de `lib/utils.ts` (formato AR$ por defecto, configurable)
- **CSS:** TailwindCSS con clases utilitarias definidas en `index.css` (btn, input, card, badge)
- **Estado:** Zustand para estado local (carrito), React Query para estado del servidor
- **Offline:** Toda escritura debe contemplar modo offline (ver `useSales.ts` como ejemplo)

---

## 10. Cómo agregar una nueva feature (guía para IA)

### Ejemplo: agregar módulo "Proveedores"

```
1. Schema BD:
   → Agregar modelo `Supplier` en apps/api/prisma/schema.prisma
   → Relación: store_id FK, products many-to-many si aplica
   → pnpm db:migrate

2. Schemas compartidos:
   → Agregar tipos en packages/shared/src/types.ts
   → Agregar Zod schemas en packages/shared/src/schemas.ts

3. Backend route:
   → Crear apps/api/src/routes/suppliers.ts
   → GET, POST, PUT, DELETE con preHandler [fastify.authenticate] o [fastify.authorizeAdmin]
   → SIEMPRE filtrar por request.storeId
   → Registrar en server.ts: fastify.register(supplierRoutes, { prefix: '/api' })

4. Frontend hook:
   → Crear apps/web/src/hooks/useSuppliers.ts
   → useQuery para listar, useMutation para crear/editar/borrar
   → Invalidar queries on success

5. Frontend página:
   → Crear apps/web/src/pages/Suppliers.tsx
   → Agregar ruta en App.tsx dentro de las rutas protegidas
   → Agregar item en Layout.tsx navItems (con icono de lucide-react)

6. Offline (si aplica):
   → Agregar tabla en apps/web/src/db/local.ts
   → Actualizar sync engine si necesita sincronización bidireccional
```

---

## 11. Modelo de negocio SaaS

| Plan | Precio/mes | Usuarios | Productos | Sucursales |
|------|-----------|----------|-----------|------------|
| Básico | $15 USD | 1 | 500 | 1 |
| Pro | $25 USD | 3 | Ilimitado | 1 |
| Multi | $45 USD | 10 | Ilimitado | 3 |

- Trial: 14 días gratis sin tarjeta
- Cobro: Stripe (internacional) o MercadoPago (LATAM)
- Costo real infraestructura por cliente: ~$0.50-2/mes
- Margen bruto: >90%
- Break-even: ~5 clientes en plan básico cubren un VPS Hetzner

---

## 12. Datos de demo incluidos

El seed (`prisma/seed.ts`) crea:
- 1 tienda: "Ferretería Demo" (plan Pro, trial 14 días)
- 2 usuarios: admin@demo.com (admin123) y cajero@demo.com (cajero123)
- 5 categorías: Herramientas, Electricidad, Plomería, Pinturas, Tornillería
- 15 productos reales de ferretería con precios, costos, stock y barcode
- 2 productos con stock bajo mínimo (para probar alertas)

---

## 13. Actualizaciones recientes (2026-03-30)

### 13.1 Gestion real en produccion

- Dashboard admin implementado:
  - Backend: `GET /api/reports/dashboard` con metricas de hoy, 7/30 dias, stock bajo, cajas abiertas, tendencia por dia y top productos.
  - Frontend: nueva pagina `Dashboard.tsx` con tarjetas KPI, tendencia y accesos rapidos.
- Modulo de clientes activo en la venta:
  - Ya no es solo CRUD: ahora se puede seleccionar cliente en el checkout POS.
  - `customerId` se envia al crear la venta (`POST /api/sales`), quedando asociado al comprobante.
- Entrada/salida de stock simple (sin complicar flujo):
  - Se agrego ajuste rapido en Inventario para registrar compras (entrada) o correcciones (salida).
  - Usa endpoint existente `PATCH /api/products/:id/stock`, con cantidad positiva/negativa y motivo opcional.

### 13.2 Seguridad y consistencia

- Reportes restringidos a admin en backend (`/reports/daily`, `/reports/low-stock`, `/reports/sales-by-period`, `/reports/dashboard`).
- Rate limit de login corregido (5/min) directamente en la ruta `/api/auth/login`.
- Sync offline tipado y validado: payloads de `sale`, `product update` y `cash movement` se parsean con Zod antes de procesar.
- Dexie offline corregido:
  - Indice compuesto `[storeId+barcode]` para busqueda por codigo.
  - Indice `retries` para cola `syncQueue` y migracion de datos a v2.

### 13.3 UX y operacion diaria

- POS con atajos: `F2` buscar, `F5` cobrar, `Esc` cerrar/limpiar, `Enter` agrega primer resultado.
- Reportes con rango de fechas y exportacion CSV (resumen, top productos, stock bajo).
- Navegacion actualizada:
  - `Panel` para admin.
  - `Clientes` disponible en menu principal.
  - Redireccion post-login por rol (`admin -> /dashboard`, `cashier -> /pos`).

### 13.4 Limite actual (intencional)

- No existe aun modulo completo de compras/proveedores (orden de compra, recepcion, costos automaticos).
- Se dejo implementado el flujo simple y suficiente para pequenos clientes:
  - registrar compra = entrada de stock manual rapida.

### 13.5 Mejora adicional: alta rapida de cliente en checkout

- En `POS.tsx`, dentro de `CheckoutModal`, se agrego formulario rapido para crear cliente sin salir de la venta.
- Flujo:
  1. Buscar cliente existente
  2. Si no existe, tocar `+ Crear cliente rapido`
  3. Guardar cliente
  4. Queda seleccionado automaticamente y se envia como `customerId` al crear la venta
- Objetivo: reducir friccion en mostrador para negocios pequenos.

### 13.6 Dashboard resiliente + estado de sincronizacion

- `useDashboardReport()` ahora intenta primero `GET /api/reports/dashboard`.
- Si el backend activo aun no tiene esa ruta (404), aplica **fallback automatico** combinando:
  - `GET /api/reports/daily`
  - `GET /api/reports/sales-by-period`
  - `GET /api/reports/low-stock`
  - `GET /api/cash/current`
- En el Dashboard se agrego bloque de control operativo con:
  - pendientes de sincronizacion (cola offline Dexie)
  - ultima sincronizacion (`lastSyncAt`)
- Resultado: el panel deja de quedar vacio aun cuando el backend no fue reiniciado o esta en una version previa.

### 13.7 Caja + ventas + ticket (2026-03-30)

- Problema corregido: ventas sin `registerId` no impactaban en la sesion de caja.
- Solucion backend en `sales.ts`:
  - si POS no envia `registerId`, se autovincula a la caja abierta del usuario.
  - si POS envia `registerId`, se valida pertenencia a la tienda.
- Solucion sync offline en `sync.ts`:
  - si no hay `registerId`, intenta resolver la caja por fecha de venta (`openedAt <= createdAt <= closedAt/null`).

- UX caja:
  - `CashRegister.tsx` ahora muestra tambien ultimas ventas registradas en esa caja.

- Historico de ventas:
  - nueva pagina `SalesHistory.tsx` con filtros por fecha/metodo, paginacion, anulacion (admin), e impresion de ticket.
  - ruta: `/sales-history`.

- Impresion de ticket:
  - nuevo helper `lib/receipt.ts` (HTML 80mm + `window.print()` por iframe oculto).
  - POS agrega opcion `Imprimir ticket al confirmar` (persistida en `localStorage`).
  - soporta venta online y ticket offline con marca `pendiente de sincronizacion`.

### 13.8 Vision futura: facturacion electronica + autoimpresor

- Facturacion electronica (por pais) se recomienda como modulo desacoplado:
  - `fiscal_documents` (estado, CAE/folio, XML/PDF, proveedor fiscal)
  - worker asincrono por pais/proveedor (AFIP/SII/SAT/DIAN)
  - venta primero se registra en POS, documento fiscal se emite en segundo paso (reintentos + cola)

- Autoimpresor:
  - corto plazo: navegadores con dialogo `print` + template termico 80mm
  - mediano plazo: bridge local (Electron/agent local) para impresion silenciosa por impresora predeterminada
  - agregar tabla `print_jobs` para reimpresion y trazabilidad

### 13.9 Caja consistente con ventas reales (2026-03-30)

- Se endurecio el flujo de ventas para evitar descuadres de caja:
  - `POST /api/sales` ahora exige caja abierta del usuario.
  - Si viene `registerId`, debe corresponder a una caja abierta del mismo usuario y tienda.
  - Si no existe caja abierta, responde conflicto y no registra venta.

- POS actualizado para operar con esa regla:
  - Checkout bloquea confirmacion si no hay caja abierta.
  - Muestra aviso claro: "Debes abrir caja para confirmar ventas".
  - Envia `registerId` explicito en cada venta para trazabilidad.

- Sincronizacion offline mas robusta:
  - payload offline de venta ahora guarda `createdAt` y `subtotal` por item.
  - backend `/api/sync` acepta payload legacy (sin subtotal/createdAt) y lo normaliza.
  - resolucion de caja offline: por `registerId`, por fecha de venta, y como fallback caja abierta actual del usuario.
  - si no puede asociar caja, la venta queda fallida en sync (no se registra inconsistente).

- UX caja mejorada:
  - refresco de caja cada 10s (`current` y `detail`) para reflejar cambios operativos.
  - detalle de formula de arqueo visible:
    `apertura + ventas efectivo + ingresos - egresos = efectivo esperado`.

### 13.10 Estrategia Paraguay (producto + negocio)

- Se agrego documento de contexto estrategico:
  - `docs/PARAGUAY-GTM.md`
- Incluye:
  - diagnostico de lo ya implementado para vender a pequenos comercios
  - hipotesis de mercado Paraguay con fuentes oficiales (MIC, BCP, DNIT)
  - propuesta de pricing en guaranies y empaquetado por plan
  - roadmap 90 dias para pasar de MVP a producto comercial robusto
  - refactors estructurales sugeridos: suscripcion, fiscal, caja auditable y compras/proveedores

### 13.11 Cierre de caja auditable (2026-03-30)

- Se agrego persistencia de auditoria en `cash_registers`:
  - `expected_closing_amount`
  - `closing_difference`
- Migracion:
  - `apps/api/prisma/migrations/20260331001000_cash_close_audit/migration.sql`

- En `POST /api/cash/close`:
  - el backend calcula el esperado con formula oficial:
    `apertura + ventas efectivo + ingresos - egresos`
  - guarda `closingAmount` (contado), `expectedClosingAmount` y `closingDifference`.
  - evita depender del calculo del frontend para auditoria.

- UX operativa:
  - al cerrar caja, toast informa resultado:
    - sin diferencia
    - sobrante/faltante con monto.
