export interface ReceiptItem {
  name: string;
  quantity: number;
  price: number;
  subtotal: number;
}

export interface ReceiptPayload {
  storeName: string;
  saleNumber: string;
  createdAt: string;
  paymentMethod: string;
  cashierName?: string;
  customerName?: string;
  items: ReceiptItem[];
  subtotal: number;
  discount: number;
  total: number;
  amountPaid?: number;
  change?: number;
  pendingSync?: boolean;
}

function money(value: number): string {
  return new Intl.NumberFormat('es-PY', {
    style: 'currency',
    currency: 'PYG',
    maximumFractionDigits: 0,
  }).format(value);
}

function paymentLabel(method: string): string {
  if (method === 'cash') return 'Efectivo';
  if (method === 'card') return 'Tarjeta';
  if (method === 'transfer') return 'Transferencia';
  return method;
}

export function buildReceiptHtml(data: ReceiptPayload): string {
  const rows = data.items
    .map(
      (item) => `
      <tr>
        <td class="name">${item.name}</td>
        <td class="qty">${item.quantity}</td>
        <td class="price">${money(item.subtotal)}</td>
      </tr>
    `,
    )
    .join('');

  return `
<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>Ticket ${data.saleNumber}</title>
    <style>
      @page { size: 80mm auto; margin: 4mm; }
      body { font-family: Arial, sans-serif; width: 72mm; margin: 0 auto; color: #111; font-size: 12px; }
      .center { text-align: center; }
      .title { font-size: 16px; font-weight: bold; margin-top: 4px; }
      .muted { color: #555; }
      .meta { margin-top: 8px; line-height: 1.4; }
      .divider { border-top: 1px dashed #999; margin: 8px 0; }
      table { width: 100%; border-collapse: collapse; }
      th, td { padding: 2px 0; vertical-align: top; }
      .name { width: 52%; }
      .qty { width: 12%; text-align: center; }
      .price { width: 36%; text-align: right; }
      .totals { margin-top: 6px; }
      .row { display: flex; justify-content: space-between; margin: 3px 0; }
      .total { font-weight: bold; font-size: 14px; }
      .warn { color: #b45309; font-weight: bold; }
      .footer { margin-top: 10px; text-align: center; font-size: 11px; color: #666; }
    </style>
  </head>
  <body>
    <div class="center">
      <div class="title">${data.storeName}</div>
      <div class="muted">Ticket #${data.saleNumber}</div>
    </div>

    <div class="meta">
      <div>Fecha: ${new Date(data.createdAt).toLocaleString('es-PY')}</div>
      <div>Pago: ${paymentLabel(data.paymentMethod)}</div>
      ${data.cashierName ? `<div>Cajero: ${data.cashierName}</div>` : ''}
      ${data.customerName ? `<div>Cliente: ${data.customerName}</div>` : ''}
    </div>

    <div class="divider"></div>

    <table>
      <thead>
        <tr>
          <th class="name">Producto</th>
          <th class="qty">Cant</th>
          <th class="price">Importe</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="divider"></div>

    <div class="totals">
      <div class="row"><span>Subtotal</span><span>${money(data.subtotal)}</span></div>
      <div class="row"><span>Descuento</span><span>${money(data.discount)}</span></div>
      <div class="row total"><span>TOTAL</span><span>${money(data.total)}</span></div>
      ${typeof data.amountPaid === 'number' ? `<div class="row"><span>Pagado</span><span>${money(data.amountPaid)}</span></div>` : ''}
      ${typeof data.change === 'number' ? `<div class="row"><span>Vuelto</span><span>${money(data.change)}</span></div>` : ''}
    </div>

    ${data.pendingSync ? `<div class="divider"></div><div class="warn">Venta pendiente de sincronizacion</div>` : ''}

    <div class="footer">Gracias por su compra</div>
  </body>
</html>
  `;
}

export function printReceipt(data: ReceiptPayload) {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    throw new Error('No se pudo iniciar impresion');
  }

  doc.open();
  doc.write(buildReceiptHtml(data));
  doc.close();

  iframe.onload = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => document.body.removeChild(iframe), 800);
  };
}
