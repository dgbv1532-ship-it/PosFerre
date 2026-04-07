import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Calculator,
  Package,
  Receipt,
  ShoppingCart,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useDashboardReport } from '@/hooks/useSales';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { Spinner } from '@/components/ui/Spinner';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDB } from '@/db/local';

const PERIOD_OPTIONS = [7, 14, 30] as const;

export function DashboardPage() {
  const [days, setDays] = useState<number>(14);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const { data, isLoading, isError, error, refetch, isFetching } = useDashboardReport(days);
  const pendingSyncCount = useLiveQuery(async () => localDB.syncQueue.count(), [], 0);

  useEffect(() => {
    setLastSyncAt(localStorage.getItem('lastSyncAt'));
  }, []);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <p className="text-gray-700 font-medium mb-2">No se pudo cargar el panel.</p>
          <p className="text-sm text-gray-500 mb-3">
            {isError ? String((error as { message?: string })?.message ?? 'Error de carga') : 'Sin datos disponibles'}
          </p>
          <button onClick={() => refetch()} className="btn-primary btn-sm" disabled={isFetching}>
            {isFetching ? 'Reintentando...' : 'Reintentar'}
          </button>
        </div>
      </div>
    );
  }

  const trend = data.trend ?? [];
  const maxTrend = Math.max(...trend.map((row: { total: number }) => row.total), 1);

  return (
    <div className="h-full overflow-auto p-4">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Panel de Gestion</h1>
            <p className="text-sm text-gray-500">Resumen operativo y comercial de tu ferreteria</p>
          </div>

          <div className="flex bg-gray-100 rounded-lg p-1 gap-1 w-fit">
            {PERIOD_OPTIONS.map((option) => (
              <button
                key={option}
                onClick={() => setDays(option)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  days === option ? 'bg-white shadow text-gray-900' : 'text-gray-600'
                }`}
              >
                {option} dias
              </button>
            ))}
          </div>
        </div>

        {'fallbackMode' in data && (data as { fallbackMode?: boolean }).fallbackMode ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Panel en modo compatible: faltan endpoints nuevos en el backend activo. Mostrando datos por fallback.
          </div>
        ) : null}

        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 flex flex-wrap gap-x-4 gap-y-1">
          <span>Pendientes de sincronizacion: <b>{formatNumber(Number(pendingSyncCount ?? 0))}</b></span>
          <span>
            Ultima sincronizacion:{' '}
            <b>{lastSyncAt ? new Date(lastSyncAt).toLocaleString('es-PY') : 'Sin registros'}</b>
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard
            label="Ventas de hoy"
            value={formatNumber(data.metrics.todaySalesCount)}
            caption="transacciones"
            icon={ShoppingCart}
            color="blue"
          />
          <MetricCard
            label="Ingresos de hoy"
            value={formatCurrency(data.metrics.todayRevenue)}
            icon={Receipt}
            color="green"
          />
          <MetricCard
            label="Ticket promedio"
            value={formatCurrency(data.metrics.avgTicketToday)}
            icon={Calculator}
            color="indigo"
          />
          <MetricCard
            label="Stock bajo"
            value={formatNumber(data.metrics.lowStockCount)}
            caption="productos"
            icon={AlertTriangle}
            color="orange"
          />
          <MetricCard
            label="Ingresos 7 dias"
            value={formatCurrency(data.metrics.last7Revenue)}
            icon={Wallet}
            color="slate"
          />
          <MetricCard
            label="Ingresos 30 dias"
            value={formatCurrency(data.metrics.last30Revenue)}
            icon={Wallet}
            color="slate"
          />
          <MetricCard
            label="Cajas abiertas"
            value={formatNumber(data.metrics.openRegisters)}
            icon={Package}
            color="purple"
          />
          <QuickCard />
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          <div className="card p-4 lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700">Tendencia de ventas ({days} dias)</h2>
              <span className="text-xs text-gray-500">Monto por dia</span>
            </div>

            {trend.length === 0 ? (
              <div className="h-52 flex items-center justify-center text-sm text-gray-500">
                Sin ventas en el periodo seleccionado.
              </div>
            ) : (
              <div className="h-52 flex items-end gap-1.5">
                {trend.map((row: { day: string; total: number; count: number }) => {
                  const pct = Math.max(4, Math.round((row.total / maxTrend) * 100));
                  return (
                    <div key={row.day} className="flex-1 min-w-0 group">
                      <div className="relative h-44 flex items-end">
                        <div
                          className="w-full rounded-t-md bg-blue-500/80 group-hover:bg-blue-600 transition-colors"
                          style={{ height: `${pct}%` }}
                          title={`${row.day}: ${formatCurrency(row.total)} (${row.count} ventas)`}
                        />
                      </div>
                      <div className="text-[10px] text-gray-500 mt-1 text-center truncate">
                        {row.day.slice(5)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="card p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Top productos</h2>
            <div className="space-y-2">
              {data.topProducts?.length ? (
                data.topProducts.map((item: { productId: string; name: string; quantity: number; total: number }) => (
                  <div key={item.productId} className="rounded-lg bg-gray-50 px-3 py-2">
                    <div className="text-sm font-medium text-gray-900 truncate">{item.name}</div>
                    <div className="text-xs text-gray-500">
                      {formatNumber(item.quantity)} uds - {formatCurrency(item.total)}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-gray-500">Aun no hay ventas registradas.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  caption,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  caption?: string;
  icon: LucideIcon;
  color: 'blue' | 'green' | 'indigo' | 'orange' | 'purple' | 'slate';
}) {
  const styles: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-green-50 text-green-700',
    indigo: 'bg-indigo-50 text-indigo-700',
    orange: 'bg-orange-50 text-orange-700',
    purple: 'bg-purple-50 text-purple-700',
    slate: 'bg-slate-50 text-slate-700',
  };

  return (
    <div className="card p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-gray-500">{label}</div>
        <div className={`w-7 h-7 rounded-md flex items-center justify-center ${styles[color]}`}>
          <Icon size={14} />
        </div>
      </div>
      <div className="text-lg font-bold text-gray-900">{value}</div>
      {caption ? <div className="text-xs text-gray-400">{caption}</div> : null}
    </div>
  );
}

function QuickCard() {
  return (
    <div className="card p-3">
      <div className="text-xs text-gray-500 mb-2">Accesos rapidos</div>
      <div className="space-y-1.5">
        <QuickLink to="/pos" label="Nueva venta" />
        <QuickLink to="/inventory" label="Gestionar inventario" />
        <QuickLink to="/customers" label="Gestionar clientes" />
        <QuickLink to="/reports" label="Ver reportes" />
      </div>
    </div>
  );
}

function QuickLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
    >
      <span>{label}</span>
      <ArrowRight size={14} className="text-gray-400" />
    </Link>
  );
}
