import { useMemo, useState } from 'react';
import { Printer, RotateCcw, Search } from 'lucide-react';
import { useCancelSale, useSales } from '@/hooks/useSales';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { printReceipt } from '@/lib/receipt';
import type { Sale } from '@pos/shared';

function todayDateInput() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function toIsoDayRange(fromDate: string, toDate: string) {
  return {
    from: new Date(`${fromDate}T00:00:00`).toISOString(),
    to: new Date(`${toDate}T23:59:59`).toISOString(),
  };
}

export function SalesHistoryPage() {
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');
  const user = useAuthStore((s) => s.user);
  const [fromDate, setFromDate] = useState(todayDateInput());
  const [toDate, setToDate] = useState(todayDateInput());
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'transfer' | ''>('');
  const [page, setPage] = useState(1);

  const params = useMemo(() => {
    const range = toIsoDayRange(fromDate, toDate);
    return {
      ...range,
      paymentMethod: paymentMethod || undefined,
      page,
      limit: 20,
    };
  }, [fromDate, toDate, paymentMethod, page]);

  const { data, isLoading, isFetching } = useSales(params);
  const cancelSale = useCancelSale();

  const sales = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 20));

  const handlePrint = (sale: Sale) => {
    printReceipt({
      storeName: user?.storeName ?? 'FerretPOS',
      saleNumber: sale.id.slice(0, 8),
      createdAt: sale.createdAt,
      paymentMethod: sale.paymentMethod,
      cashierName: sale.user?.name,
      customerName: sale.customer?.name,
      items: (sale.items ?? []).map((item) => ({
        name: item.product?.name ?? 'Producto',
        quantity: Number(item.quantity),
        price: Number(item.price),
        subtotal: Number(item.subtotal),
      })),
      subtotal: (sale.items ?? []).reduce((acc, item) => acc + Number(item.subtotal), 0),
      discount: Number(sale.discount),
      total: Number(sale.total),
      amountPaid: sale.paymentMethod === 'cash' ? Number(sale.total) : undefined,
    });
  };

  return (
    <div className="h-full flex flex-col">
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold text-gray-900">Historial de ventas</h1>
          {isFetching ? <span className="text-xs text-gray-500">Actualizando...</span> : null}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <div>
            <label className="label">Desde</label>
            <input
              type="date"
              className="input py-1.5 text-sm"
              value={fromDate}
              max={toDate}
              onChange={(event) => {
                setFromDate(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <div>
            <label className="label">Hasta</label>
            <input
              type="date"
              className="input py-1.5 text-sm"
              value={toDate}
              min={fromDate}
              onChange={(event) => {
                setToDate(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <div>
            <label className="label">Metodo</label>
            <select
              className="input py-1.5 text-sm"
              value={paymentMethod}
              onChange={(event) => {
                setPaymentMethod(event.target.value as 'cash' | 'card' | 'transfer' | '');
                setPage(1);
              }}
            >
              <option value="">Todos</option>
              <option value="cash">Efectivo</option>
              <option value="card">Tarjeta</option>
              <option value="transfer">Transferencia</option>
            </select>
          </div>
          <div className="flex items-end">
            <div className="text-xs text-gray-500">
              {total} venta{total === 1 ? '' : 's'} encontradas
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : sales.length === 0 ? (
          <EmptyState
            icon={Search}
            title="Sin ventas en el periodo"
            description="Proba otro rango de fechas o metodo de pago."
          />
        ) : (
          <div className="space-y-2">
            {sales.map((sale) => (
              <div key={sale.id} className="card p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">Venta #{sale.id.slice(0, 8)}</div>
                    <div className="text-xs text-gray-500">
                      {formatDateTime(sale.createdAt)} · {sale.user?.name ?? 'Usuario'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-blue-700">{formatCurrency(Number(sale.total))}</div>
                    <div className="text-xs text-gray-500">{sale.paymentMethod}</div>
                  </div>
                </div>

                <div className="text-xs text-gray-600 mb-2">
                  Cliente: {sale.customer?.name ?? 'Consumidor final'} · Items: {(sale.items ?? []).length}
                </div>

                <div className="flex gap-2">
                  <button onClick={() => handlePrint(sale)} className="btn-secondary btn-sm">
                    <Printer size={14} /> Ticket
                  </button>

                  {isAdmin ? (
                    <button
                      onClick={() => cancelSale.mutate(sale.id)}
                      disabled={cancelSale.isPending}
                      className="btn-danger btn-sm"
                    >
                      <RotateCcw size={14} /> Anular
                    </button>
                  ) : null}

                  <div className="ml-auto text-xs text-gray-400 self-center">
                    {sale.status === 'completed' ? 'Completada' : sale.status}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {totalPages > 1 ? (
        <div className="bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="btn-secondary btn-sm"
          >
            Anterior
          </button>
          <span className="text-sm text-gray-600">Pag. {page} / {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="btn-secondary btn-sm"
          >
            Siguiente
          </button>
        </div>
      ) : null}
    </div>
  );
}
