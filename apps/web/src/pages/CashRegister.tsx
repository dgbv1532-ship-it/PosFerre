import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Plus,
  Minus,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import {
  useCurrentRegister,
  useOpenCashRegister,
  useCloseCashRegister,
  useAddCashMovement,
  useRegisterDetail,
} from '@/hooks/useCash';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';

export function CashRegisterPage() {
  const { data: register, isLoading } = useCurrentRegister();
  const openRegister = useOpenCashRegister();
  const closeRegister = useCloseCashRegister();
  const addMovement = useAddCashMovement();
  const [showOpen, setShowOpen] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [showMovement, setShowMovement] = useState<'in' | 'out' | null>(null);
  const { data: registerDetail } = useRegisterDetail(register?.id ?? null);

  if (isLoading) {
    return <div className="flex justify-center py-12"><Spinner size="lg" /></div>;
  }

  const summary = registerDetail?.summary;

  return (
    <div className="h-full overflow-auto p-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-bold text-gray-900">Caja</h1>
          <Link to="/sales-history" className="btn-secondary btn-sm">
            Ver historial
          </Link>
        </div>

        {!register ? (
          /* No register open */
          <div className="card p-8 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <DollarSign size={28} className="text-gray-400" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Caja cerrada</h2>
            <p className="text-sm text-gray-500 mb-6">
              Abre la caja para empezar a registrar ventas
            </p>
            <button onClick={() => setShowOpen(true)} className="btn-primary px-8">
              Abrir caja
            </button>
          </div>
        ) : (
          /* Register open */
          <>
            {/* Status banner */}
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4 flex items-center gap-3">
              <CheckCircle size={20} className="text-green-600" />
              <div>
                <div className="text-sm font-medium text-green-800">Caja abierta</div>
                <div className="text-xs text-green-600">
                  Desde {formatDateTime(register.openedAt)}
                </div>
              </div>
            </div>

            {/* Summary cards */}
            {summary && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <StatCard label="Ventas" value={formatCurrency(summary.totalSales)} sub={`${summary.salesCount} operaciones`} />
                <StatCard label="Efectivo" value={formatCurrency(summary.cashSales)} color="green" />
                <StatCard label="Tarjeta" value={formatCurrency(summary.cardSales)} color="blue" />
                <StatCard label="Transfer." value={formatCurrency(summary.transferSales)} color="purple" />
              </div>
            )}

            {summary ? (
              <div className="card p-4 mb-4">
                <div className="text-sm font-semibold text-gray-700 mb-2">Calculo de efectivo esperado</div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center justify-between text-gray-600">
                    <span>Apertura</span>
                    <span>{formatCurrency(Number(register.openingAmount))}</span>
                  </div>
                  <div className="flex items-center justify-between text-green-700">
                    <span>+ Ventas en efectivo</span>
                    <span>{formatCurrency(summary.cashSales)}</span>
                  </div>
                  <div className="flex items-center justify-between text-green-700">
                    <span>+ Ingresos manuales</span>
                    <span>{formatCurrency(summary.totalMovementsIn)}</span>
                  </div>
                  <div className="flex items-center justify-between text-red-700">
                    <span>- Egresos manuales</span>
                    <span>{formatCurrency(summary.totalMovementsOut)}</span>
                  </div>
                </div>
                <div className="mt-3 border-t border-gray-100 pt-3 flex items-center justify-between">
                  <span className="text-sm text-gray-600">Efectivo esperado</span>
                  <span className="text-lg font-bold text-gray-900">{formatCurrency(summary.expectedCash)}</span>
                </div>
              </div>
            ) : null}

            {/* Quick actions */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <button
                onClick={() => setShowMovement('in')}
                className="card p-4 flex items-center gap-3 text-green-700 hover:bg-green-50 transition-colors"
              >
                <div className="w-9 h-9 bg-green-100 rounded-lg flex items-center justify-center">
                  <TrendingUp size={18} className="text-green-600" />
                </div>
                <span className="font-medium">Ingreso manual</span>
              </button>
              <button
                onClick={() => setShowMovement('out')}
                className="card p-4 flex items-center gap-3 text-red-700 hover:bg-red-50 transition-colors"
              >
                <div className="w-9 h-9 bg-red-100 rounded-lg flex items-center justify-center">
                  <TrendingDown size={18} className="text-red-600" />
                </div>
                <span className="font-medium">Egreso manual</span>
              </button>
            </div>

            {/* Movements history */}
            {registerDetail?.cashMovements?.length > 0 && (
              <div className="card mb-4">
                <div className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-700">
                  Movimientos
                </div>
                <div className="divide-y divide-gray-50">
                  {registerDetail.cashMovements.slice(-10).map((m: { id: string; type: string; description: string; createdAt: string; amount: string | number }) => (
                    <div key={m.id} className="px-4 py-2.5 flex items-center gap-3">
                      {m.type === 'in' ? (
                        <Plus size={14} className="text-green-600" />
                      ) : (
                        <Minus size={14} className="text-red-600" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-800 truncate">{m.description}</div>
                        <div className="text-xs text-gray-400">{formatDateTime(m.createdAt)}</div>
                      </div>
                      <div className={`text-sm font-semibold ${m.type === 'in' ? 'text-green-600' : 'text-red-600'}`}>
                        {m.type === 'in' ? '+' : '-'}{formatCurrency(Number(m.amount))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sales in current register */}
            {registerDetail?.sales?.length > 0 && (
              <div className="card mb-4">
                <div className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-700">
                  Ventas registradas en esta caja
                </div>
                <div className="divide-y divide-gray-50">
                  {registerDetail.sales.slice(-10).reverse().map((sale: {
                    id: string;
                    total: string | number;
                    paymentMethod: string;
                    createdAt: string;
                  }) => (
                    <div key={sale.id} className="px-4 py-2.5 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-800 truncate">Venta #{sale.id.slice(0, 8)}</div>
                        <div className="text-xs text-gray-400">
                          {formatDateTime(sale.createdAt)} · {sale.paymentMethod}
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-gray-900">
                        {formatCurrency(Number(sale.total))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Close register */}
            {summary && (
              <div className="card p-4">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm text-gray-600">Efectivo esperado en caja</span>
                  <span className="font-bold text-gray-900">{formatCurrency(summary.expectedCash)}</span>
                </div>
                <button
                  onClick={() => setShowClose(true)}
                  className="btn-danger w-full"
                >
                  <XCircle size={16} /> Cerrar caja
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Open modal */}
      <Modal open={showOpen} onClose={() => setShowOpen(false)} title="Abrir caja" size="sm">
        <OpenCashForm
          onConfirm={async (data) => {
            await openRegister.mutateAsync(data);
            setShowOpen(false);
          }}
          isLoading={openRegister.isPending}
        />
      </Modal>

      {/* Close modal */}
      <Modal open={showClose} onClose={() => setShowClose(false)} title="Cerrar caja" size="sm">
        <CloseCashForm
          expectedCash={summary?.expectedCash ?? 0}
          onConfirm={async (data) => {
            await closeRegister.mutateAsync(data);
            setShowClose(false);
          }}
          isLoading={closeRegister.isPending}
        />
      </Modal>

      {/* Movement modal */}
      <Modal
        open={showMovement !== null}
        onClose={() => setShowMovement(null)}
        title={showMovement === 'in' ? 'Registrar ingreso' : 'Registrar egreso'}
        size="sm"
      >
        {showMovement && (
          <CashMovementForm
            type={showMovement}
            onConfirm={async (data) => {
              await addMovement.mutateAsync({ type: showMovement, ...data });
              setShowMovement(null);
            }}
            isLoading={addMovement.isPending}
          />
        )}
      </Modal>
    </div>
  );
}

function StatCard({ label, value, sub, color = 'gray' }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  const colors: Record<string, string> = {
    gray: 'text-gray-900', green: 'text-green-600', blue: 'text-blue-600', purple: 'text-purple-600',
  };
  return (
    <div className="card p-3">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-base font-bold ${colors[color]}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function OpenCashForm({ onConfirm, isLoading }: {
  onConfirm: (d: { openingAmount: number; notes?: string }) => void;
  isLoading: boolean;
}) {
  const [amount, setAmount] = useState(0);
  const [notes, setNotes] = useState('');
  return (
    <div className="space-y-4">
      <div>
        <label className="label">Monto inicial en caja ($)</label>
        <input
          type="number"
          min="0"
          step="0.01"
          className="input text-lg"
          value={amount || ''}
          onChange={(e) => setAmount(Number(e.target.value))}
          placeholder="0"
          autoFocus
        />
      </div>
      <div>
        <label className="label">Notas (opcional)</label>
        <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej: Turno mañana" />
      </div>
      <button
        onClick={() => onConfirm({ openingAmount: amount, notes: notes || undefined })}
        disabled={isLoading}
        className="btn-success w-full"
      >
        {isLoading ? <Spinner size="sm" /> : 'Abrir caja'}
      </button>
    </div>
  );
}

function CloseCashForm({ expectedCash, onConfirm, isLoading }: {
  expectedCash: number;
  onConfirm: (d: { closingAmount: number; notes?: string }) => void;
  isLoading: boolean;
}) {
  const [amount, setAmount] = useState(expectedCash);
  const [notes, setNotes] = useState('');
  const diff = amount - expectedCash;

  return (
    <div className="space-y-4">
      <div className="p-3 bg-gray-50 rounded-xl text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600">Efectivo esperado</span>
          <span className="font-semibold">{formatCurrency(expectedCash)}</span>
        </div>
      </div>
      <div>
        <label className="label">Efectivo contado ($)</label>
        <input
          type="number"
          min="0"
          step="0.01"
          className="input text-lg"
          value={amount || ''}
          onChange={(e) => setAmount(Number(e.target.value))}
          autoFocus
        />
      </div>
      {diff !== 0 && (
        <div className={`p-3 rounded-xl text-sm ${diff >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {diff >= 0 ? 'Sobrante' : 'Faltante'}: {formatCurrency(Math.abs(diff))}
        </div>
      )}
      <div>
        <label className="label">Notas (opcional)</label>
        <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <button
        onClick={() => onConfirm({ closingAmount: amount, notes: notes || undefined })}
        disabled={isLoading}
        className="btn-danger w-full"
      >
        {isLoading ? <Spinner size="sm" /> : 'Confirmar cierre de caja'}
      </button>
    </div>
  );
}

function CashMovementForm({ type, onConfirm, isLoading }: {
  type: 'in' | 'out';
  onConfirm: (d: { amount: number; description: string }) => void;
  isLoading: boolean;
}) {
  const [amount, setAmount] = useState(0);
  const [description, setDescription] = useState('');

  return (
    <div className="space-y-4">
      <div>
        <label className="label">Monto ($)</label>
        <input
          type="number"
          min="0.01"
          step="0.01"
          className="input text-lg"
          value={amount || ''}
          onChange={(e) => setAmount(Number(e.target.value))}
          autoFocus
        />
      </div>
      <div>
        <label className="label">Descripción *</label>
        <input
          className="input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={type === 'in' ? 'Ej: Depósito efectivo' : 'Ej: Compra de insumos'}
          required
        />
      </div>
      <button
        onClick={() => onConfirm({ amount, description })}
        disabled={isLoading || amount <= 0 || !description}
        className={type === 'in' ? 'btn-success w-full' : 'btn-danger w-full'}
      >
        {isLoading ? <Spinner size="sm" /> : `Registrar ${type === 'in' ? 'ingreso' : 'egreso'}`}
      </button>
    </div>
  );
}
