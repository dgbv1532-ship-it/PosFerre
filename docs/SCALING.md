# Plan de Escalabilidad — FerretPOS

> Roadmap técnico organizado por fases. Cada fase es independiente y ejecutable.
> Priorizado por impacto en el negocio y complejidad técnica.

---

## Estado actual (MVP completado)

```
✅ POS offline-first con sincronización
✅ Inventario (CRUD productos + categorías)
✅ Caja (apertura, cierre, movimientos)
✅ Reportes básicos (ventas del día, stock bajo)
✅ Multi-usuario (admin/cajero)
✅ Multi-tenant SaaS (row-level isolation)
✅ Auth JWT con refresh token rotation
✅ PWA instalable
```

---

## Fase 1 — Solidificación (1-2 semanas)

**Objetivo:** Hacer el MVP robusto para los primeros 5-10 clientes piloto.

### 1.1 Tests
```
Prioridad: ALTA
Archivos a crear:
  apps/api/src/__tests__/
    auth.test.ts          ← Login, register, refresh, permisos
    sales.test.ts         ← Crear venta, verificar stock, cancelar
    tenant.test.ts        ← Verificar aislamiento entre tiendas
    cash.test.ts          ← Abrir, movimientos, cerrar, totales

Herramientas: Vitest + supertest (API) / Vitest + testing-library (frontend)
Cobertura mínima: auth 90%, sales 80%, tenant isolation 100%
```

### 1.2 Impresión de tickets
```
Prioridad: ALTA (los ferreteros lo piden siempre)
Archivos a crear:
  apps/web/src/lib/receipt.ts        ← Generar HTML de ticket
  apps/web/src/components/shared/ReceiptPreview.tsx

Estrategia:
  → Generar HTML con CSS @media print para impresora térmica 80mm
  → window.print() en iframe oculto
  → Compatible con impresoras USB/Bluetooth genéricas (no requiere drivers)
  → Template configurable por tienda (logo, nombre, dirección, mensaje)
```

### 1.3 Mejoras UX
```
Prioridad: MEDIA
  → Soporte para lector de código de barras USB (detección de input rápido)
  → Atajos de teclado en POS (F2=buscar, F5=cobrar, Esc=cancelar)
  → Sonido al agregar producto al carrito (feedback)
  → Animaciones de transición entre páginas
  → Dark mode (opcional, ahorra batería en tablets)
```

### 1.4 Moneda configurable
```
Prioridad: ALTA
Archivos a modificar:
  packages/shared/src/types.ts       ← Agregar currency a Store
  apps/api/prisma/schema.prisma      ← Agregar campo currency a stores
  apps/web/src/lib/utils.ts          ← formatCurrency() lee currency del store

Monedas: ARS, CLP, MXN, COP, PEN, USD
```

---

## Fase 2 — Producto vendible (2-4 semanas)

**Objetivo:** Features que los clientes piden para pagar.

### 2.1 Dashboard / Panel principal
```
Prioridad: ALTA
Archivos a crear:
  apps/web/src/pages/Dashboard.tsx

Contenido:
  → Ventas de hoy (monto + gráfico por hora)
  → Comparación vs ayer / semana pasada
  → Productos más vendidos (top 5)
  → Alertas de stock bajo (badge con contador)
  → Estado de caja (abierta/cerrada)
  → Margen de ganancia del día (si el admin cargó costos)
```

### 2.2 Reportes avanzados
```
Prioridad: ALTA
Archivos a crear:
  apps/web/src/pages/Reports.tsx     ← Expandir con tabs:
    - Ventas por período (gráfico de barras por día/semana/mes)
    - Ventas por categoría (torta/donut)
    - Ventas por cajero
    - Margen de ganancia (precio - costo)
    - Movimientos de caja por período
    - Historial de cierres de caja

Librería de gráficos: recharts (lightweight, React-native)
Exportar: CSV (generado client-side con Blob + download)
```

### 2.3 Gestión de precios
```
Prioridad: MEDIA
  → Actualización masiva de precios (porcentaje o monto fijo)
  → Historial de precios por producto
  → Lista de precios diferenciada (mayorista vs minorista) [fase posterior]
```

### 2.4 Cobro con Stripe / MercadoPago
```
Prioridad: ALTA (para monetizar el SaaS)
Archivos a crear:
  apps/api/src/routes/billing.ts     ← Webhooks de pago
  apps/web/src/pages/Billing.tsx     ← Página de plan + pago

Flujo:
  → Trial 14 días → al vencer, acceso solo lectura
  → Stripe Checkout para cobro (o MercadoPago en LATAM)
  → Webhook actualiza store.plan en BD
  → Middleware verifica plan activo en cada request
```

### 2.5 Import/Export CSV
```
Prioridad: MEDIA
  → Importar productos desde CSV/Excel (con mapeo de columnas)
  → Exportar inventario actual a CSV
  → Exportar ventas del período a CSV
  → Template CSV descargable de ejemplo
```

---

## Fase 3 — Crecimiento (1-2 meses)

**Objetivo:** Features para ferreterías medianas y cadenas.

### 3.1 Multi-sucursal
```
Prioridad: ALTA (Plan "Multi")
Schema cambios:
  → Agregar tabla branches (sucursales dentro de un store)
  → Productos: stock por sucursal (tabla product_stock_by_branch)
  → Ventas: campo branch_id
  → Usuarios: asignados a sucursal(es)
  → Reportes: filtro por sucursal + consolidado

Esto justifica el plan Multi a $45/mes.
```

### 3.2 Proveedores y órdenes de compra
```
Prioridad: MEDIA
Tablas nuevas:
  suppliers        ← Nombre, contacto, productos que provee
  purchase_orders  ← Orden de compra a proveedor
  purchase_items   ← Items de la orden

Flujo:
  → Reporte de stock bajo genera sugerencia de compra
  → Admin crea orden de compra
  → Al recibir mercadería, confirma → stock se actualiza
```

### 3.3 Cuentas corrientes (fiado)
```
Prioridad: ALTA en ferreterías (muchos clientes compran "a cuenta")
Tablas nuevas:
  customer_accounts    ← Saldo actual del cliente
  account_movements    ← Cargo (venta) o abono (pago)

Flujo:
  → Al vender, opción "Cuenta corriente" como método de pago
  → Se carga al saldo del cliente
  → Cliente viene a pagar → se registra abono
  → Reporte de cuentas por cobrar
```

### 3.4 Notificaciones
```
Prioridad: BAJA
  → Push notifications (PWA) para alertas de stock
  → Email diario automático con resumen de ventas (node-cron + nodemailer)
  → WhatsApp Business API para enviar ticket al cliente (evalurar costo)
```

### 3.5 Mejoras offline
```
Prioridad: MEDIA
  → UUID v7 para primary keys (generables client-side, time-sortable)
  → Delta-based stock sync (enviar +/- en lugar de valor absoluto)
  → Sync log en servidor (tabla sync_log) para pulls incrementales eficientes
  → Soft deletes con deleted_at para propagar eliminaciones a clientes offline
  → Background Sync API del Service Worker (retries automáticos)
```

---

## Fase 4 — Escala técnica (cuando hay 50+ clientes)

**Objetivo:** Infraestructura para crecimiento sostenible.

### 4.1 Base de datos
```
Actual: 1 PostgreSQL con todas las tiendas
Problema: A 100+ tiendas, las queries se vuelven lentas

Opciones:
  A) Particionar tablas grandes por store_id (PostgreSQL partitions)
     → Transparente para la app, Prisma lo soporta
     → Aplica a: products, sales, sale_items

  B) Base de datos por cliente (schema separation)
     → Prisma no lo soporta bien → evaluar Drizzle ORM
     → Mayor aislamiento pero más complejidad operativa

  C) Read replicas
     → 1 primary para escrituras + 1 replica para reportes
     → Prisma soporta read replicas nativo

Recomendación: Empezar con (A) particiones, pasar a (C) si hay carga de reportes.
```

### 4.2 Cache
```
  → Redis (Upstash serverless, $0 hasta 10k req/día)
  → Cachear: categorías, configuración de tienda, datos de usuario
  → Invalidar cache en escrituras
  → Rate limiting basado en Redis (en vez de memoria)
```

### 4.3 CDN y static hosting
```
Actual: Nginx sirve frontend + proxy API
Mejora:
  → Frontend en Cloudflare Pages (CDN global, $0)
  → API sigue en Hetzner
  → Imágenes de productos en Cloudflare R2 ($0 hasta 10GB)
  → Resultado: carga instantánea global para el frontend
```

### 4.4 Monitoreo
```
Herramientas gratuitas/baratas:
  → Uptime: UptimeRobot (gratis, 50 monitors)
  → Errores: Sentry free tier (5k events/mes)
  → Logs: PM2 logs + logrotate (ya incluido)
  → Métricas: Prometheus + Grafana en el mismo VPS (si hay RAM)
  → Alertas: Telegram bot para notificaciones críticas (gratis)
```

### 4.5 CI/CD mejorado
```
Actual: GitHub Actions básico (typecheck + build)
Mejora:
  → Tests automatizados en CI
  → Deploy automático al hacer push a main
  → Preview deploys en PRs
  → Database migrations automáticas en deploy

Script de deploy:
  ssh root@server "cd /opt/ferretpos && git pull && pnpm install && pnpm build && pm2 restart all"
```

---

## Fase 5 — Diferenciación (3-6 meses)

**Objetivo:** Features que nos separan de la competencia.

### 5.1 App móvil nativa (opcional)
```
Opción A: La PWA ya funciona bien en móviles
Opción B: React Native / Expo (reutilizar lógica)
Opción C: Capacitor (wrapper de la PWA como app nativa)

Recomendación: Capacitor es lo más rápido. Mismo código, publicable en Play Store.
```

### 5.2 Integraciones fiscales
```
País por país:
  → Argentina: Factura electrónica AFIP (ARCA)
  → Chile: SII boleta electrónica
  → México: CFDI (SAT)
  → Colombia: DIAN facturación electrónica

Esto requiere un módulo por país. Empezar por el mercado principal.
Es un diferenciador ENORME porque la competencia generalmente no lo tiene.
```

### 5.3 Inventario inteligente
```
  → Predicción de demanda (simple: promedio móvil de ventas)
  → Sugerencia automática de reposición
  → Alertas proactivas: "El producto X se agota en ~3 días"
  → ABC analysis (clasificar productos por rotación)
```

### 5.4 Landing page + marketing
```
Archivos:
  → Página web pública: ferretpos.com (beneficios, precios, testimonios)
  → Blog con SEO: "cómo manejar una ferretería", "control de inventario"
  → Video demo de 2 minutos
  → WhatsApp de soporte

Stack landing: Astro o Next.js estático → Cloudflare Pages ($0)
```

### 5.5 API pública
```
  → API REST documentada para que clientes integren
  → Webhooks (nueva venta, stock bajo, cierre de caja)
  → Casos de uso: integración con contabilidad, ERPs, e-commerce
  → Monetizable como plan Enterprise
```

---

## Estimación de costos por fase de crecimiento

| Clientes | Infra mensual | Stack |
|----------|--------------|-------|
| 1-10 | **$4.50** | Hetzner CX22 (todo en 1 VPS) |
| 10-50 | **$8-15** | Hetzner CX32 + backup storage |
| 50-200 | **$25-40** | CX42 + read replica + Redis |
| 200-500 | **$60-100** | 2 servers (API + DB separados) + CDN |
| 500+ | **$150+** | Cluster, load balancer, múltiples regiones |

**El ingreso con 50 clientes en plan básico: $750/mes.**
**El costo de infra con 50 clientes: ~$15/mes.**
**Margen: 98%.**

---

## Resumen de prioridades

```
AHORA (Fase 1):
  → Tests de integración
  → Impresión de tickets
  → Moneda configurable

PRÓXIMO (Fase 2):
  → Dashboard
  → Cobro Stripe/MercadoPago
  → Reportes avanzados
  → Import/Export CSV

DESPUÉS (Fase 3):
  → Cuentas corrientes (fiado)
  → Multi-sucursal
  → Proveedores

FUTURO (Fase 4-5):
  → Escala técnica (particiones, cache, CDN)
  → Facturación electrónica
  → API pública
```

---

## Estado real implementado (2026-03-30)

Se completaron parcialmente items que estaban planificados para Fase 2:

- Dashboard basico operativo (admin)
  - KPIs clave + tendencia + top productos
- Reportes con rango de fechas y exportacion CSV
- Modulo de clientes ya conectado al checkout (customerId en venta)

Tambien se agrego mejora operativa de bajo costo para pequenos clientes:

- Entrada/salida de stock manual en Inventario
  - suficiente para registrar compras simples sin introducir complejidad de ordenes de compra

### Implicancia para roadmap

- Mantener en Fase 3 el modulo completo de compras/proveedores
- Mantener en Fase 3 cuentas corrientes/fiado
- Priorizar ahora:
  - tests de integracion
  - impresion de tickets
  - consolidar UX de flujo de caja + clientes

### Mejora UX agregada (2026-03-30)

- Alta rapida de clientes desde checkout POS.
- Impacto: mejor conversion operativa en mostrador (menos abandono por falta de cliente cargado).

- Dashboard con fallback automatico en frontend para convivir con backends desactualizados (sin romper operacion).
- Indicadores de salud operativa agregados: pendientes offline y ultima sync.

### Entregado (2026-03-30)

- Historico de ventas utilizable para operacion diaria (filtros + paginacion + anulacion + ticket).
- Asociacion automatica de ventas a caja abierta para evitar desfasajes de arqueo.
- Impresion de ticket termico base en web (80mm).

### Recomendacion de siguiente fase

1. Consolidar impresion profesional:
   - reimpresion desde historial
   - configuracion por tienda (logo, mensaje, datos fiscales)
2. Iniciar capa fiscal desacoplada:
   - cola de documentos fiscales
   - worker por pais/proveedor
   - estado de emision visible por venta
3. Evaluar bridge de autoimpresion silenciosa (sin dialogo del navegador) para cajas de alto volumen.

### Ajuste operativo aplicado (2026-03-30)

Se adelanto una mejora de "solidificacion" para reducir errores de caja en clientes pequenos:

- Politica: no se permite venta sin caja abierta.
- POS valida caja abierta antes de confirmar.
- Venta online/offline siempre intenta quedar asociada a una sesion de caja valida.
- Sync offline endurecido para evitar registrar ventas sin caja asociada.
- Cierre de caja auditable persistido (esperado/contado/diferencia) para reducir incidencias de arqueo.

Impacto esperado:

- Menos diferencias entre efectivo real y efectivo esperado.
- Mejor trazabilidad por turno/cajero.
- Menor costo de soporte por incidencias de arqueo.
