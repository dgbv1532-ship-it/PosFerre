# Arquitectura Técnica — FerretPOS

## Diagrama general

```
┌──────────────────────────────────────────────────────────┐
│                     CLIENTE (PWA)                         │
│                                                          │
│  ┌─────────┐  ┌──────────┐  ┌────────────┐              │
│  │ React   │  │ Zustand   │  │ React      │              │
│  │ Pages   │←→│ Stores    │←→│ Query      │              │
│  │ (UI)    │  │ (carrito) │  │ (server)   │              │
│  └─────────┘  └──────────┘  └─────┬──────┘              │
│                                    │                      │
│  ┌─────────────────────────────────┼───────────────────┐ │
│  │              CAPA OFFLINE       │                    │ │
│  │  ┌──────────┐  ┌───────────┐  ┌▼──────────┐       │ │
│  │  │ Dexie.js │  │ Sync      │  │ Axios     │       │ │
│  │  │ IndexedDB│←→│ Engine    │←→│ + JWT     │       │ │
│  │  │ (local)  │  │ (queue)   │  │ intercept │       │ │
│  │  └──────────┘  └───────────┘  └─────┬─────┘       │ │
│  └─────────────────────────────────────┼──────────────┘ │
│                                         │                 │
│  ┌──────────────────┐                   │                 │
│  │ Service Worker   │  cache assets     │                 │
│  │ (Workbox)        │  + API fallback   │                 │
│  └──────────────────┘                   │                 │
└─────────────────────────────────────────┼─────────────────┘
                                          │ HTTPS
                                          ▼
┌──────────────────────────────────────────────────────────┐
│                     SERVIDOR                              │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Nginx (reverse proxy + SSL + static files)         │  │
│  └───────────────────────┬────────────────────────────┘  │
│                           │                               │
│  ┌────────────────────────▼───────────────────────────┐  │
│  │ Fastify API (Node.js)                              │  │
│  │                                                    │  │
│  │  ┌──────────┐ ┌──────────┐ ┌────────────────────┐ │  │
│  │  │ Auth     │ │ Tenant   │ │ Rate Limit         │ │  │
│  │  │ Plugin   │ │ Plugin   │ │ + Helmet + CORS    │ │  │
│  │  │ (JWT)    │ │ (isolate)│ │                    │ │  │
│  │  └────┬─────┘ └────┬─────┘ └────────────────────┘ │  │
│  │       │             │                               │  │
│  │  ┌────▼─────────────▼──────────────────────────┐   │  │
│  │  │ Routes                                      │   │  │
│  │  │  auth · products · sales · cash · reports   │   │  │
│  │  │  users · customers · sync                   │   │  │
│  │  └────────────────────┬────────────────────────┘   │  │
│  │                        │                            │  │
│  │  ┌─────────────────────▼───────────────────────┐   │  │
│  │  │ Prisma ORM                                  │   │  │
│  │  │ (queries parametrizadas + migraciones)      │   │  │
│  │  └─────────────────────┬───────────────────────┘   │  │
│  └────────────────────────┼───────────────────────────┘  │
│                            │                              │
│  ┌─────────────────────────▼──────────────────────────┐  │
│  │ PostgreSQL 16                                      │  │
│  │                                                    │  │
│  │  stores ← users ← refresh_tokens                  │  │
│  │       ↑← categories ← products                    │  │
│  │       ↑← customers                                │  │
│  │       ↑← cash_registers ← cash_movements          │  │
│  │                         ← sales ← sale_items       │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

---

## Flujo de una venta (online)

```
1. Cajero busca producto
   POS.tsx → useProductSearch() → GET /api/products?search=martillo
                                  → filtrado por store_id automáticamente

2. Agrega al carrito
   POS.tsx → usePOSStore.addToCart(product)
   → Zustand actualiza estado local (sin network)

3. Toca "Cobrar"
   → CheckoutModal se abre
   → Selecciona método de pago
   → Si efectivo: ingresa monto → calcula vuelto

4. Confirma venta
   POS.tsx → useCreateSale.mutate(data)
   → POST /api/sales
   → Backend en TRANSACCIÓN:
     a) Crea registro en sales
     b) Crea registros en sale_items
     c) Decrementa stock de cada producto
   → Respuesta 201 con venta creada

5. UI se limpia
   → clearCart()
   → Toast "Venta registrada"
   → React Query invalida queries de products y sales
```

## Flujo de una venta (offline)

```
1-3. Igual que online (todo local)

4. Confirma venta
   → useCreateSale detecta !navigator.onLine
   → Genera ID local con generateId()
   → Guarda en IndexedDB via addToSyncQueue()
   → Toast "Venta guardada offline — se sincronizará al reconectar"

5. Al reconectar
   → window 'online' event → syncWithServer()
   → POST /api/sync con items de la cola
   → Servidor procesa cada venta en transacción
   → Responde con: synced[], failed[], serverUpdates{products, categories}
   → Cliente limpia cola y actualiza IndexedDB
```

---

## Multi-tenancy — Cómo funciona el aislamiento

```
Request entrante:
  Authorization: Bearer eyJ...
                        │
                        ▼
  Auth Plugin (auth.ts):
    jwt.verify() → extrae { userId, storeId, role }
                        │
                        ▼
  Tenant Plugin (tenant.ts):
    request.storeId = user.storeId
    request.userId  = user.userId
    request.userRole = user.role
                        │
                        ▼
  Route handler:
    prisma.product.findMany({
      where: { storeId: request.storeId, ... }
    })                  ↑
                        │
              SIEMPRE incluye storeId
              Una tienda NUNCA ve datos de otra
```

---

## Schema de base de datos — Relaciones

```sql
stores (tenant raíz)
  │
  ├── users (email único POR tienda, no global)
  │     └── refresh_tokens (para JWT rotation)
  │
  ├── categories (nombre único POR tienda)
  │     └── products (FK opcional a category)
  │
  ├── customers (nombre, teléfono, email)
  │
  ├── cash_registers (turnos de caja)
  │     ├── cash_movements (ingresos/egresos manuales)
  │     └── sales (ventas hechas durante este turno)
  │           └── sale_items (líneas de la venta)
  │                 └── FK a products
  │
  └── (futuro: suppliers, purchase_orders, etc.)
```

**Índices clave:**
- `products`: `[storeId, active]`, `[storeId, name]`, `[storeId, barcode]` UNIQUE
- `sales`: `[storeId, createdAt]`, `[storeId, status]`
- `users`: `[storeId, email]` UNIQUE

---

## Service Worker — Estrategia de cache

```
vite-plugin-pwa genera automáticamente un Service Worker con Workbox:

Assets estáticos (JS, CSS, HTML, iconos):
  → CacheFirst — se sirven del cache siempre, se actualizan en background

API /products:
  → NetworkFirst (timeout 5s) — intenta red, si falla usa cache

API /categories:
  → NetworkFirst (timeout 5s) — igual

Otras APIs:
  → NetworkOnly — no se cachean (ventas, auth, etc.)

PWA Manifest:
  → name: "FerretPOS - Sistema de Ventas"
  → display: "standalone" (sin barra de navegador)
  → orientation: "any" (tablet horizontal o vertical)
```

---

## Auth — Flujo de tokens

```
Login:
  POST /api/auth/login { email, password }
  → bcrypt.compare(password, user.passwordHash)
  → Genera accessToken (JWT, 15min, contiene userId+storeId+role)
  → Genera refreshToken (random hex 64 bytes, guardado en BD, 30 días)
  → Responde { user, accessToken, refreshToken }
  → Frontend guarda en Zustand (persistido en localStorage)

Request autenticado:
  → Axios interceptor agrega "Authorization: Bearer {accessToken}"
  → Si 401 → interceptor intenta refresh automáticamente:
    POST /api/auth/refresh { refreshToken }
    → Rota: borra token viejo, crea uno nuevo
    → Reintenta el request original
    → Si refresh falla → logout() → redirige a /login

Logout:
  → POST /api/auth/logout { refreshToken }
  → Borra token de BD
  → Limpia Zustand + localStorage
```

---

## Patrón de un endpoint API típico

```typescript
// apps/api/src/routes/[recurso].ts

fastify.get('/products',
  { preHandler: [fastify.authenticate] },  // verifica JWT
  async (request) => {
    // request.storeId ya está disponible (inyectado por tenant plugin)
    const query = productQuerySchema.parse(request.query); // Zod validation

    const products = await prisma.product.findMany({
      where: { storeId: request.storeId, active: true },
      // ^ SIEMPRE filtrar por storeId
    });

    return { data: products, total, page, limit };
  }
);

// Endpoints de escritura que requieren admin:
fastify.post('/products',
  { preHandler: [fastify.authorizeAdmin] },  // verifica JWT + role === 'admin'
  async (request, reply) => { ... }
);
```

---

## Patrón de un hook de frontend típico

```typescript
// apps/web/src/hooks/use[Recurso].ts

export function useProducts(params) {
  return useQuery({
    queryKey: ['products', params],
    queryFn: async () => {
      const res = await api.get('/products', { params });
      return res.data;  // { data: Product[], total, page, limit }
    },
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post('/products', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      toast.success('Producto creado');
    },
    onError: (err) => toast.error(getApiError(err)),
  });
}
```

---

## Actualizaciones recientes (2026-03-30)

### Dashboard operativo (admin)

- Nuevo endpoint: `GET /api/reports/dashboard`
- Entrega en una sola respuesta:
  - metricas de hoy
  - ingresos 7/30 dias
  - stock bajo
  - cajas abiertas
  - tendencia diaria
  - top productos

### Clientes en flujo de venta

Flujo actualizado en POS:

```text
1. Cajero agrega productos al carrito
2. En Checkout selecciona cliente (opcional)
3. Frontend envia `customerId` en POST /api/sales
4. Venta queda asociada al cliente para trazabilidad
```

### Entrada de stock (compras simples)

Sin crear aun modulo de ordenes de compra, se habilito ajuste rapido:

```text
Inventario -> Ajustar stock -> Entrada
  -> PATCH /api/products/:id/stock { quantity: +N, reason }
```

Tambien permite salida manual con `quantity: -N` para mermas/correcciones.

### Endurecimiento tecnico

- Reportes protegidos con `authorizeAdmin`.
- Login con rate limit por ruta (5/min).
- Sync offline con validacion Zod por tipo de payload.
- Dexie v2 con indices:
  - `[storeId+barcode]` en productos
  - `retries` en `syncQueue`

### Alta rapida de cliente en POS (2026-03-30)

Se incorporo creacion inline de cliente en `CheckoutModal`:

```text
Checkout -> Cliente (opcional)
  -> Buscar cliente existente
  -> o crear cliente rapido (nombre/telefono/email)
  -> seleccionar automaticamente
  -> POST /api/sales con customerId
```

Esto evita romper el flujo de cobro al tener que navegar a otra pantalla.

### Dashboard compatible con backend mixto (2026-03-30)

Para evitar panel vacio cuando el backend activo no tiene aun `/reports/dashboard`:

- Frontend aplica fallback por composicion de endpoints existentes.
- Se mantiene misma estructura visual de KPIs.
- Se agrega bloque de estado offline:
  - pendientes en `syncQueue`
  - timestamp de ultima sync.

### Caja y ventas asociadas (2026-03-30)

Ajuste clave de integridad operativa:

```text
POST /api/sales
  if registerId viene en payload -> validar store_id
  else -> usar caja abierta del usuario (si existe)
```

En sincronizacion offline (`POST /api/sync`):

```text
sale sin registerId
  -> resolver caja por fecha de venta y usuario
     opened_at <= sale.createdAt <= closed_at | closed_at = null
```

Esto asegura que resumen y arqueo de caja reflejen ventas reales.

### Historico de ventas

Se agrego pagina `SalesHistory.tsx`:

- filtros por fecha y metodo de pago
- paginacion
- anulacion de venta (admin)
- impresion de ticket por venta

### Ticket termico

Nuevo modulo `apps/web/src/lib/receipt.ts`:

- genera HTML de ticket (80mm)
- imprime via iframe oculto (`print()`)
- soporta:
  - venta online
  - venta offline marcada como pendiente de sync

### Integridad caja-venta (2026-03-30)

Se aplico una regla de consistencia para que caja refleje resultados reales:

```text
POST /api/sales
  -> requiere caja abierta del usuario
  -> registerId valido solo si pertenece a caja abierta del usuario actual
```

Cambios operativos:

- El POS no permite confirmar venta sin caja abierta.
- El payload offline de venta guarda `createdAt` y `subtotal` por item.
- El backend de sync normaliza payloads legacy y resuelve caja por:
  1) `registerId`
  2) rango horario de la venta
  3) caja abierta actual del usuario (fallback)
- Si no se puede asociar caja, la venta no se sincroniza para evitar descuadre silencioso.

Efecto:

- Se elimina la causa principal de ventas "huerfanas" (sin caja), que distorsionaban arqueo y cierre.

### Cierre de caja auditable (2026-03-30)

Se incorporo persistencia de auditoria en el cierre de caja:

- `expected_closing_amount`: efectivo esperado al momento del cierre.
- `closing_amount`: efectivo contado por cajero.
- `closing_difference`: diferencia (`contado - esperado`).

La formula de esperado se calcula del lado servidor:

```text
apertura + ventas_efectivo + ingresos_manuales - egresos_manuales
```

Esto reduce disputas operativas porque el valor auditado no depende del cliente web.
