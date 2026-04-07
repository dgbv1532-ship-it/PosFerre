import { useState } from 'react';
import { Search, Plus, Edit2, Trash2, Package, AlertTriangle, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { useProducts, useCategories, useCreateProduct, useUpdateProduct, useDeleteProduct, useAdjustProductStock } from '@/hooks/useProducts';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import type { Product } from '@pos/shared';
import { useAuthStore } from '@/store/auth';

export function InventoryPage() {
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [stockProduct, setStockProduct] = useState<Product | null>(null);

  const { data, isLoading } = useProducts({
    search: search || undefined,
    categoryId: categoryFilter || undefined,
    page,
    limit: 30,
  });

  const { data: categories } = useCategories();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const adjustStock = useAdjustProductStock();

  const products = data?.data ?? [];
  const total = data?.total ?? 0;

  const handleEdit = (product: Product) => {
    setEditProduct(product);
    setShowModal(true);
  };

  const handleDelete = async (product: Product) => {
    if (!confirm(`¿Eliminar "${product.name}"?`)) return;
    await deleteProduct.mutateAsync(product.id);
  };

  const handleAdjustStock = async (data: { quantity: number; reason?: string }) => {
    if (!stockProduct) return;
    await adjustStock.mutateAsync({ id: stockProduct.id, ...data });
    setStockProduct(null);
  };

  const handleSave = async (formData: Record<string, unknown>) => {
    if (editProduct) {
      await updateProduct.mutateAsync({ id: editProduct.id, data: formData });
    } else {
      await createProduct.mutateAsync(formData);
    }
    setShowModal(false);
    setEditProduct(null);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold text-gray-900">Inventario</h1>
          {isAdmin && (
            <button
              onClick={() => { setEditProduct(null); setShowModal(true); }}
              className="btn-primary btn-sm"
            >
              <Plus size={16} /> Agregar
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="input pl-8 py-1.5 text-sm"
              placeholder="Buscar productos..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <select
            className="input py-1.5 text-sm w-36"
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
          >
            <option value="">Todas</option>
            {categories?.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Product list */}
      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner size="lg" /></div>
        ) : products.length === 0 ? (
          <EmptyState
            icon={Package}
            title="Sin productos"
            description={search ? 'Intenta con otro término' : 'Agrega tu primer producto'}
            action={
              isAdmin ? (
                <button onClick={() => setShowModal(true)} className="btn-primary btn-sm">
                  <Plus size={14} /> Agregar producto
                </button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="text-xs text-gray-500 mb-3">{total} productos</div>
            <div className="space-y-2">
              {products.map((product) => (
                <div key={product.id} className="card p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {product.name}
                      </span>
                      {Number(product.stock) <= Number(product.minStock) && (
                        <AlertTriangle size={14} className="text-orange-500 flex-shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-gray-500">{product.barcode ?? '—'}</span>
                      {product.category && (
                        <span className="badge-gray text-xs">{(product as Product & { category: { name: string } }).category.name}</span>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-sm font-bold text-blue-600">
                      {formatCurrency(Number(product.price))}
                    </div>
                    <div className={`text-xs ${Number(product.stock) <= Number(product.minStock) ? 'text-orange-600 font-medium' : 'text-gray-500'}`}>
                      Stock: {formatNumber(Number(product.stock))}
                    </div>
                  </div>

                  {isAdmin && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => setStockProduct(product)}
                        className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                        title="Entrada/Salida de stock"
                      >
                        {Number(product.stock) <= Number(product.minStock) ? (
                          <ArrowUpCircle size={15} />
                        ) : (
                          <ArrowDownCircle size={15} />
                        )}
                      </button>
                      <button
                        onClick={() => handleEdit(product)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        onClick={() => handleDelete(product)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Pagination */}
            {total > 30 && (
              <div className="flex justify-center gap-2 mt-4">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="btn-secondary btn-sm"
                >
                  Anterior
                </button>
                <span className="text-sm text-gray-600 py-1.5 px-3">
                  Pág. {page}
                </span>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={page * 30 >= total}
                  className="btn-secondary btn-sm"
                >
                  Siguiente
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Product Form Modal */}
      {showModal && (
        <ProductModal
          product={editProduct}
          categories={categories ?? []}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditProduct(null); }}
          isLoading={createProduct.isPending || updateProduct.isPending}
        />
      )}

      <Modal
        open={!!stockProduct}
        title={stockProduct ? `Ajustar stock: ${stockProduct.name}` : 'Ajustar stock'}
        onClose={() => setStockProduct(null)}
        size="sm"
      >
        {stockProduct ? (
          <StockAdjustForm
            product={stockProduct}
            onConfirm={handleAdjustStock}
            isLoading={adjustStock.isPending}
          />
        ) : null}
      </Modal>
    </div>
  );
}

// ============================================
// Product Form Modal
// ============================================

interface ProductModalProps {
  product: Product | null;
  categories: Array<{ id: string; name: string }>;
  onSave: (data: Record<string, unknown>) => void;
  onClose: () => void;
  isLoading: boolean;
}

function ProductModal({ product, categories, onSave, onClose, isLoading }: ProductModalProps) {
  const [form, setForm] = useState({
    name: product?.name ?? '',
    barcode: product?.barcode ?? '',
    categoryId: product?.categoryId ?? '',
    price: Number(product?.price ?? 0),
    cost: Number(product?.cost ?? 0),
    stock: Number(product?.stock ?? 0),
    minStock: Number(product?.minStock ?? 5),
    unit: product?.unit ?? 'unidad',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...form,
      barcode: form.barcode || null,
      categoryId: form.categoryId || null,
    });
  };

  return (
    <Modal open title={product ? 'Editar producto' : 'Nuevo producto'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Nombre *</label>
          <input
            className="input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Código de barras</label>
            <input
              className="input"
              value={form.barcode}
              onChange={(e) => setForm({ ...form, barcode: e.target.value })}
              placeholder="EAN/SKU"
            />
          </div>
          <div>
            <label className="label">Categoría</label>
            <select
              className="input"
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            >
              <option value="">Sin categoría</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Precio venta *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="input"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
              required
            />
          </div>
          <div>
            <label className="label">Costo</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="input"
              value={form.cost}
              onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">Stock actual</label>
            <input
              type="number"
              step="0.001"
              min="0"
              className="input"
              value={form.stock}
              onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="label">Stock mínimo</label>
            <input
              type="number"
              step="0.001"
              min="0"
              className="input"
              value={form.minStock}
              onChange={(e) => setForm({ ...form, minStock: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="label">Unidad</label>
            <input
              className="input"
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
              placeholder="unidad"
            />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">
            Cancelar
          </button>
          <button type="submit" disabled={isLoading} className="btn-primary flex-1">
            {isLoading ? <Spinner size="sm" /> : 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function StockAdjustForm({
  product,
  onConfirm,
  isLoading,
}: {
  product: Product;
  onConfirm: (data: { quantity: number; reason?: string }) => void;
  isLoading: boolean;
}) {
  const [mode, setMode] = useState<'in' | 'out'>('in');
  const [quantity, setQuantity] = useState(0);
  const [reason, setReason] = useState('');

  const delta = mode === 'in' ? Math.abs(quantity) : -Math.abs(quantity);
  const nextStock = Number(product.stock) + delta;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setMode('in')}
          className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
            mode === 'in' ? 'border-green-300 bg-green-50 text-green-700' : 'border-gray-200 text-gray-600'
          }`}
        >
          Entrada (compra)
        </button>
        <button
          type="button"
          onClick={() => setMode('out')}
          className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
            mode === 'out' ? 'border-red-300 bg-red-50 text-red-700' : 'border-gray-200 text-gray-600'
          }`}
        >
          Salida (ajuste)
        </button>
      </div>

      <div>
        <label className="label">Cantidad</label>
        <input
          type="number"
          className="input"
          min="0"
          step="0.001"
          value={quantity || ''}
          onChange={(e) => setQuantity(Number(e.target.value))}
          placeholder="0"
          autoFocus
        />
      </div>

      <div>
        <label className="label">Motivo (opcional)</label>
        <input
          type="text"
          className="input"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={mode === 'in' ? 'Ej: Compra a proveedor' : 'Ej: Merma / ajuste manual'}
        />
      </div>

      <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm">
        <div className="flex justify-between text-gray-600">
          <span>Stock actual</span>
          <span>{formatNumber(Number(product.stock))}</span>
        </div>
        <div className="flex justify-between text-gray-600">
          <span>Movimiento</span>
          <span className={delta >= 0 ? 'text-green-600' : 'text-red-600'}>
            {delta >= 0 ? '+' : ''}
            {formatNumber(delta)}
          </span>
        </div>
        <div className="flex justify-between font-semibold text-gray-900 mt-1">
          <span>Stock resultante</span>
          <span>{formatNumber(nextStock)}</span>
        </div>
      </div>

      <button
        type="button"
        className={mode === 'in' ? 'btn-success w-full' : 'btn-secondary w-full'}
        disabled={isLoading || quantity <= 0}
        onClick={() => onConfirm({ quantity: delta, reason: reason || undefined })}
      >
        {isLoading ? <Spinner size="sm" /> : mode === 'in' ? 'Registrar entrada' : 'Registrar salida'}
      </button>
    </div>
  );
}
