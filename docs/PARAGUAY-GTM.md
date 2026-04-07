# Paraguay GTM + Product Strategy (FerretPOS)

Fecha: 2026-03-30

## 1) Diagnostico del producto actual

Fortalezas ya implementadas:
- POS offline-first (clave para continuidad operativa).
- Inventario, caja, clientes, historial de ventas y ticket.
- Multiusuario por roles (admin/cajero) y multitienda.
- Asociacion de venta-caja endurecida (evita descuadre).

Brechas para convertirlo en producto "que se paga":
- No hay modulo completo de compras/proveedores.
- No hay cuentas corrientes (fiado) ni cobranza.
- No hay capa fiscal SIFEN integrada (solo operativa interna).
- No existe motor de suscripcion/billing realmente aplicado en el backend.

## 2) Hipotesis de mercado Paraguay (con evidencia)

- Las Mipymes son el mercado dominante:
  - MIC reporta que representan 98% del ecosistema empresarial y 70% del empleo formal.
- Pagos digitales estan acelerando:
  - BCP (13/03/2026) eleva SPI a Gs 10.000.000 por operacion y destaca QR Hub/NFC.
  - BCP (28/07/2025) reporta fuerte crecimiento de SPI y QR; 61% de adultos con cuenta (Global Findex 2025 citado por BCP).
- Facturacion electronica avanza por oleadas:
  - Decreto 872/2023 regula SIFEN y establece designacion gradual de facturadores electronicos.
  - Resolucion DNIT 41/2025 obliga adhesion a SIFEN para contratos con el Estado desde 02/01/2026.
- Existe alternativa gratuita oficial:
  - DNIT impulsa e-Kuatia'i para pequenos contribuyentes (mas de 10.000 usuarios reportados en 11/2025).
  - Implicancia: cobrar solo "facturacion" tiene techo; hay que vender "gestion completa + productividad".

## 3) Posicionamiento recomendado

No vender "software de facturas". Vender:

1. Control de caja real por turno.
2. Control de inventario para no perder ventas por quiebre.
3. Cobro rapido (efectivo, tarjeta, transferencia/QR) con menos friccion.
4. Preparado para SIFEN sin cambiar de sistema en 6-12 meses.

Mensaje comercial sugerido:
- "Te ayudamos a vender mas y perder menos, aunque se caiga internet."

## 4) Producto minimo vendible (PY) en 90 dias

Fase A (0-30 dias): "Operacion confiable"
- Cierre de caja auditable (esperado vs contado vs diferencia guardado).
- Reporte diario simple para duenho (ventas, margen aproximado, caja).
- Alertas de stock critico con sugerencia de reposicion.

Fase B (31-60 dias): "Valor financiero directo"
- Modulo compras/proveedores (orden simple + ingreso de mercaderia).
- Cuentas corrientes (fiado) + cobranzas.
- Estado de resultados operativo basico (venta, costo, margen).

Fase C (61-90 dias): "Escalamiento comercial"
- Capa fiscal desacoplada (adapter SIFEN con colas y reintentos).
- Cobro QR interoperable orientado a comercio pequeno.
- Panel de salud del negocio (top productos, rotacion, caja semanal).

## 5) Pricing sugerido (Gs) y monetizacion

Referencia de mercado:
- Se observan ofertas de facturacion desde Gs 79.000/mes (solo facturacion).
- Tambien hay plataformas verticales con tickets mucho mas altos (ej. Gs 1.200.000 + IVA en nichos B2B).

Propuesta inicial:
- Plan Inicio: Gs 149.000/mes
  - 1 caja, 1-2 usuarios, inventario + caja + POS + clientes.
- Plan Crece: Gs 299.000/mes
  - hasta 3 cajas, compras/proveedores, cuentas corrientes, reportes avanzados.
- Plan Pro: Gs 499.000/mes
  - multisucursal basico, API, integraciones, soporte prioritario.

Politica comercial:
- Setup simple sin costo (acelera cierre).
- Onboarding pago opcional (migracion y capacitacion) como upsell.
- Descuento anual 15-20% para reducir churn.

## 6) Refactor tecnico recomendado para sostener negocio

1. Dominio "suscripcion":
- Agregar `subscriptionStatus`, `plan`, `currentPeriodEnd`, `graceUntil`.
- Middleware de acceso por plan (write/read-only por estado).

2. Dominio "fiscal":
- Crear modulo `fiscal_documents` independiente de `sales`.
- Flujo asincrono por colas (emitir, reintentar, reconciliar).

3. Dominio "caja":
- Persistir snapshot de cierre:
  - `expectedClosing`, `countedClosing`, `difference`, `closedBy`.

4. Dominio "compras":
- `suppliers`, `purchase_orders`, `purchase_items`, `inventory_movements`.

5. Observabilidad minima SaaS:
- eventos de negocio: `sale_created`, `cash_closed`, `stockout_detected`, `trial_expired`.
- dashboard interno de churn risk y activacion.

## 7) KPI para saber si el negocio funciona

- Activacion D7: tienda que registra >= 20 ventas en 7 dias.
- Retencion M2: tiendas activas despues de 60 dias.
- Tiempo a primer valor: minutos desde alta hasta primera venta.
- Frecuencia de cierre de caja: cierres/semana por tienda.
- Churn mensual y causa principal (precio, soporte, falta de funcionalidad).

## 8) Riesgos y mitigacion

- Riesgo: competir solo por precio contra herramientas de facturacion.
  - Mitigacion: foco en control operativo completo (caja + stock + cobranza).
- Riesgo: complejidad fiscal temprana.
  - Mitigacion: arquitectura desacoplada por adapter y despliegue gradual por segmento.
- Riesgo: adopcion lenta por baja digitalizacion operativa.
  - Mitigacion: onboarding guiado + plantillas + soporte por WhatsApp.

## 9) Fuentes usadas

- MIC (Mipymes y empleo):
  - https://www.mic.gov.py/mipymes-el-motor-silencioso-que-mueve-el-empleo-en-paraguay/
- BCP (SIPAP/SPI y limite a Gs 10 millones):
  - https://www.bcp.gov.py/web/institucional/w/bcp-actualiza-el-reglamento-del-sipap-y-eleva-el-limite-de-las-transferencias-instantaneas-a-g-10-millones
- BCP (Ley de Pagos, SPI/QR, inclusion financiera):
  - https://www.bcp.gov.py/en/web/institucional/w/bm-destaca-importancia-de-ley-de-pagos-para-digitalizacion-e-inclusion-financiera
- DNIT (obligatoriedad SIFEN en contrataciones publicas desde 02/01/2026):
  - https://www.dnit.gov.py/documents/20123/1374136/Resoluci%C3%B3n%2BGeneral%2BDNIT%2BN%C2%B0%2B41-25.pdf/c017ec3b-3a5c-19a7-478a-2ba96bf06edf?t=1767111734830
- DNIT (Decreto 872/2023 - implementacion gradual y marco tecnico):
  - https://www.dnit.gov.py/documents/20123/1259326/DECRETO_872.pdf/10a38d31-769f-388d-103f-6f5de177730d?t=1731348014754
- DNIT (e-Kuatia'i gratuito y adopcion):
  - https://www.dnit.gov.py/web/e-kuatia/w/la-dnit-fomenta-el-uso-masivo-del-sistema-gratuito-de-facturaci%C3%B3n-electr%C3%B3nica-e-kuatia-i-

