import { useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, Download, ShoppingCart, TrendingUp } from 'lucide-react';
import { useDailyReport, useLowStockReport, useSalesByPeriod } from '@/hooks/useSales';
import { downloadCsv, formatCurrency, formatNumber, paymentLabel } from '@/lib/utils';
import { Spinner } from '@/components/ui/Spinner';

function toDateInputValue(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function buildRange(fromDate: string, toDate: string) {
  return {
    from: new Date(`${fromDate}T00:00:00`).toISOString(),
    to: new Date(`${toDate}T23:59:59`).toISOString(),
  };
}

export function ReportsPage() {
  const [tab, setTab] = useState<'daily' | 'stock'>('daily');
  const [fromDate, setFromDate] = useState(toDateInputValue());
  const [toDate, setToDate] = useState(toDateInputValue());

  const range = useMemo(() => buildRange(fromDate, toDate), [fromDate, toDate]);

  const { data: daily, isLoading: loadingDaily } = useDailyReport(range.from, range.to);
  const { data: trend, isLoading: loadingTrend } = useSalesByPeriod(range.from, range.to);
  const { data: lowStock, isLoading: loadingStock } = useLowStockReport();

  const exportDailyCsv = () => {
    if (!daily) return;

    downloadCsv(`reporte-ventas-${fromDate}_a_${toDate}.csv`, [
      {
        desde: fromDate,
        hasta: toDate,
        ventas: daily.totalSales,
        ingresos: daily.totalRevenue,
        descuentos: daily.totalDiscount,
        efectivo: daily.byPaymentMethod.cash,
        tarjeta: daily.byPaymentMethod.card,
        transferencia: daily.byPaymentMethod.transfer,
      },
    ]);
  };

  const exportTopProductsCsv = () => {
    if (!daily?.topProducts?.length) return;

    downloadCsv(
      `top-productos-${fromDate}_a_${toDate}.csv`,
      daily.topProducts.map((item: { name: string; quantity: number; revenue: number }) => ({
        producto: item.name,
        cantidad: item.quantity,
        facturacion: item.revenue,
      })),
    );
  };

  const exportLowStockCsv = () => {
    if (!lowStock?.length) return;

    downloadCsv(
      `stock-bajo-${toDate}.csv`,
      lowStock.map((item: { name: string; category?: string; stock: number; minStock: number }) => ({
        producto: item.name,
        categoria: item.category ?? 'Sin categoria',
        stock_actual: item.stock,
        stock_minimo: item.minStock,
      })),
    );
  };

  return (
    <div className="h-full overflow-auto p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h1 className="text-lg font-bold text-gray-900">Reportes</h1>

          {tab === 'daily' ? (
            <div className="flex gap-2">
              <button onClick={exportDailyCsv} className="btn-secondary btn-sm" disabled={!daily}>
                <Download size={14} /> Resumen CSV
              </button>
              <button
                onClick={exportTopProductsCsv}
                className="btn-secondary btn-sm"
                disabled={!daily?.topProducts?.length}
              >
                <Download size={14} /> Top productos CSV
              </button>
            </div>
          ) : (
            <button
              onClick={exportLowStockCsv}
              className="btn-secondary btn-sm"
              disabled={!lowStock?.length}
            >
              <Download size={14} /> Exportar CSV
            </button>
          )}
        </div>

        <div className="card p-3 mb-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="label">Desde</label>
            <input
              type="date"
              className="input"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              max={toDate}
            />
          </div>
          <div>
            <label className="label">Hasta</label>
            <input
              type="date"
              className="input"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              min={fromDate}
            />
          </div>
          <div className="flex items-end">
            <div className="text-xs text-gray-500 pb-2">
              Periodo activo: {fromDate} a {toDate}
            </div>
          </div>
        </div>

        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg mb-6">
          <button
            onClick={() => setTab('daily')}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
              tab === 'daily' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600'
            }`}
          >
            Ventas
          </button>
          <button
            onClick={() => setTab('stock')}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
              tab === 'stock' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600'
            }`}
          >
            Stock bajo
          </button>
        </div>

        {tab === 'daily' && (
          loadingDaily || loadingTrend ? (
            <div className="flex justify-center py-12">
              <Spinner size="lg" />
            </div>
          ) : daily ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="card p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <ShoppingCart size={16} className="text-blue-600" />
                    <span className="text-xs text-gray-500">Ventas</span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900">{daily.totalSales}</div>
                  <div className="text-xs text-gray-400">operaciones</div>
                </div>

                <div className="card p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <BarChart3 size={16} className="text-green-600" />
                    <span className="text-xs text-gray-500">Facturacion</span>
                  </div>
                  <div className="text-2xl font-bold text-green-600">
                    {formatCurrency(daily.totalRevenue)}
                  </div>
                  <div className="text-xs text-gray-400">descuentos: {formatCurrency(daily.totalDiscount)}</div>
                </div>
              </div>

              <div className="card p-4">
                <div className="text-sm font-semibold text-gray-700 mb-3">Metodo de pago</div>
                <div className="space-y-2">
                  {Object.entries(daily.byPaymentMethod).map(([method, amount]) => {
                    const value = amount as number;
                    const pct = daily.totalRevenue > 0 ? (value / daily.totalRevenue) * 100 : 0;
                    return (
                      <div key={method}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-600">{paymentLabel(method)}</span>
                          <span className="font-medium">{formatCurrency(value)}</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full">
                          <div className="h-1.5 bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="card p-4">
                <div className="text-sm font-semibold text-gray-700 mb-3">Tendencia diaria</div>
                {trend?.length ? (
                  <div className="space-y-1.5">
                    {trend.map((row) => (
                      <div key={row.day} className="flex items-center justify-between text-sm bg-gray-50 rounded px-3 py-2">
                        <span className="text-gray-600">{row.day}</span>
                        <span className="text-gray-900 font-medium">
                          {formatNumber(row.count)} ventas - {formatCurrency(row.total)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">No hay datos para el periodo.</div>
                )}
              </div>

              {daily.topProducts?.length > 0 && (
                <div className="card">
                  <div className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-700">
                    Top productos
                  </div>
                  <div className="divide-y divide-gray-50">
                    {daily.topProducts.map((item: { productId: string; name: string; quantity: number; revenue: number }) => (
                      <div key={item.productId} className="px-4 py-2.5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm text-gray-800 truncate">{item.name}</div>
                          <div className="text-xs text-gray-400">{formatNumber(item.quantity)} unidades</div>
                        </div>
                        <div className="text-sm font-semibold text-gray-900">{formatCurrency(item.revenue)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {daily.totalSales === 0 && (
                <div className="text-center py-8 text-gray-400">
                  <BarChart3 size={36} className="mx-auto mb-2 text-gray-200" />
                  <p>Sin ventas en este periodo</p>
                </div>
              )}
            </div>
          ) : null
        )}

        {tab === 'stock' && (
          loadingStock ? (
            <div className="flex justify-center py-12">
              <Spinner size="lg" />
            </div>
          ) : (
            <div>
              {!lowStock?.length ? (
                <div className="text-center py-12 text-gray-400">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <TrendingUp size={20} className="text-green-600" />
                  </div>
                  <p className="text-gray-600 font-medium">No hay alertas de stock</p>
                  <p className="text-sm mt-1">Todo el inventario esta por encima del minimo.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-orange-600 mb-3">
                    <AlertTriangle size={16} />
                    <span className="text-sm font-medium">{lowStock.length} productos en alerta</span>
                  </div>
                  {lowStock.map((item: { productId: string; name: string; stock: number; minStock: number; category?: string }) => (
                    <div key={item.productId} className="card p-3 flex items-center gap-3">
                      <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <AlertTriangle size={14} className="text-orange-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">{item.name}</div>
                        <div className="text-xs text-gray-400">{item.category || 'Sin categoria'}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-orange-600">{formatNumber(item.stock)}</div>
                        <div className="text-xs text-gray-400">min: {item.minStock}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
}
