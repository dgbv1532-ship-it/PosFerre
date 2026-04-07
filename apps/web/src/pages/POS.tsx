import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  Banknote,
  ChevronRight,
  CreditCard,
  Minus,
  Package,
  Plus,
  Search,
  ShoppingCart,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import type { Customer, Product } from '@pos/shared';
import { useCreateSale } from '@/hooks/useSales';
import { useCurrentRegister } from '@/hooks/useCash';
import { useCategories, useProductSearch, useProducts } from '@/hooks/useProducts';
import { useCreateCustomer, useCustomers } from '@/hooks/useCustomers';
import { useAuthStore } from '@/store/auth';
import { usePOSStore } from '@/store/pos';
import { formatCurrency } from '@/lib/utils';
import { printReceipt } from '@/lib/receipt';
import { Spinner } from '@/components/ui/Spinner';
import toast from 'react-hot-toast';

const PAYMENT_METHODS = [
  { value: 'cash' as const, label: 'Efectivo', icon: Banknote },
  { value: 'card' as const, label: 'Tarjeta', icon: CreditCard },
  { value: 'transfer' as const, label: 'Transfer', icon: ArrowLeftRight },
];

function getRecommendedCashAmounts(total: number): number[] {
  const safeTotal = Math.max(0, Math.ceil(total));
  const steps =
    safeTotal >= 100000
      ? [10000, 20000, 50000, 100000]
      : safeTotal >= 50000
        ? [5000, 10000, 20000, 50000]
        : safeTotal >= 20000
          ? [2000, 5000, 10000, 20000]
          : safeTotal >= 10000
            ? [1000, 2000, 5000, 10000]
            : [500, 1000, 2000, 5000];

  const nextAbove = (value: number, step: number) => Math.ceil((value + 1) / step) * step;
  const raw = [
    nextAbove(safeTotal, steps[0]),
    nextAbove(safeTotal, steps[1]),
    nextAbove(safeTotal, steps[2]),
    nextAbove(safeTotal, steps[3]),
  ];

  const unique: number[] = [];
  for (const amount of raw) {
    if (!unique.includes(amount)) unique.push(amount);
  }

  let cursor = unique[0] ?? nextAbove(safeTotal, steps[0]);
  while (unique.length < 4) {
    cursor += steps[0];
    if (!unique.includes(cursor)) unique.push(cursor);
  }

  return unique.slice(0, 4);
}

export function POSPage() {
  const user = useAuthStore((state) => state.user);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(undefined);
  const [showCheckout, setShowCheckout] = useState(false);
  const [autoPrintReceipt, setAutoPrintReceipt] = useState<boolean>(() => {
    const value = localStorage.getItem('autoPrintReceipt');
    return value === null ? true : value === '1';
  });
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: catalogData, isLoading: catalogLoading } = useProducts({
    categoryId: selectedCategory,
    limit: 60,
  });
  const { data: currentRegister, isLoading: currentRegisterLoading } = useCurrentRegister();

  const { products: searchResults, isLoading: searchLoading } = useProductSearch(search);
  const { data: categories } = useCategories();
  const { data: customers = [] } = useCustomers();

  const displayProducts = search ? searchResults : (catalogData?.data ?? []);
  const isLoading = search ? searchLoading : catalogLoading;

  const createSale = useCreateSale();

  const {
    cart,
    discount,
    customerId,
    paymentMethod,
    amountPaid,
    addToCart,
    removeFromCart,
    updateQuantity,
    setDiscount,
    setCustomerId,
    setPaymentMethod,
    setAmountPaid,
    clearCart,
    subtotal,
    total,
    change,
  } = usePOSStore();

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const handleAddProduct = useCallback((product: Product) => {
    addToCart(product);
    setSearch('');
    searchRef.current?.focus();
  }, [addToCart]);

  const handleSale = useCallback(async () => {
    if (cart.length === 0) return;
    if (!currentRegister?.id) {
      toast.error('Debes abrir caja antes de registrar ventas');
      return;
    }

    const cartSnapshot = cart.map((item) => ({ ...item }));
    const subtotalValue = subtotal();
    const totalValue = total();
    const changeValue = change();
    const selectedCustomer = customerId
      ? customers.find((customer) => customer.id === customerId) ?? null
      : null;

    const saleResult = await createSale.mutateAsync({
      registerId: currentRegister.id,
      items: cart.map((item) => ({
        productId: item.product.id,
        quantity: item.quantity,
        price: item.price,
      })),
      customerId: customerId ?? undefined,
      discount,
      paymentMethod,
      amountPaid,
    });

    if (autoPrintReceipt) {
      const offline = 'offline' in saleResult && saleResult.offline;
      const saleNumber = offline
        ? `OFF-${Date.now().toString().slice(-6)}`
        : String((saleResult as { id: string }).id).slice(0, 8);

      printReceipt({
        storeName: user?.storeName ?? 'FerretPOS',
        saleNumber,
        createdAt: new Date().toISOString(),
        paymentMethod,
        cashierName: user?.name,
        customerName: selectedCustomer?.name ?? undefined,
        items: cartSnapshot.map((item) => ({
          name: item.product.name,
          quantity: item.quantity,
          price: item.price,
          subtotal: item.subtotal,
        })),
        subtotal: subtotalValue,
        discount,
        total: totalValue,
        amountPaid: paymentMethod === 'cash' ? amountPaid : undefined,
        change: paymentMethod === 'cash' ? changeValue : undefined,
        pendingSync: offline,
      });
    }

    clearCart();
    setShowCheckout(false);
  }, [
    amountPaid,
    autoPrintReceipt,
    cart,
    change,
    clearCart,
    createSale,
    customerId,
    customers,
    discount,
    paymentMethod,
    subtotal,
    total,
    currentRegister?.id,
    user?.name,
    user?.storeName,
  ]);

  useEffect(() => {
    localStorage.setItem('autoPrintReceipt', autoPrintReceipt ? '1' : '0');
  }, [autoPrintReceipt]);

  useEffect(() => {
    const handleHotkeys = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();

      if (event.key === 'F2' || (event.ctrlKey && key === 'k')) {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }

      if (event.key === 'F5' && cart.length > 0) {
        event.preventDefault();
        setShowCheckout(true);
      }

      if (event.key === 'Escape') {
        if (showCheckout) {
          event.preventDefault();
          setShowCheckout(false);
          return;
        }

        if (search) setSearch('');
      }
    };

    window.addEventListener('keydown', handleHotkeys);
    return () => window.removeEventListener('keydown', handleHotkeys);
  }, [cart.length, search, showCheckout]);

  return (
    <div className="h-full flex flex-col md:flex-row overflow-hidden">
      <div className="flex-1 flex flex-col p-4 overflow-hidden">
        <div className="relative mb-3">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            ref={searchRef}
            type="text"
            className="input pl-10 text-base"
            placeholder="Buscar producto o escanear codigo de barras..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || !search.trim()) return;

              event.preventDefault();
              const normalized = search.trim().toLowerCase();
              const match =
                displayProducts.find((product) => product.barcode === search.trim()) ??
                displayProducts.find((product) => product.name.toLowerCase().includes(normalized));

              if (match) handleAddProduct(match);
            }}
            autoComplete="off"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div className="text-xs text-gray-500 mb-3 flex flex-wrap gap-x-3 gap-y-1">
          <span>F2: buscar</span>
          <span>F5: cobrar</span>
          <span>Esc: cerrar/limpiar</span>
          <span>Enter: agregar primer resultado</span>
        </div>

        {!search && categories && categories.length > 0 && (
          <div className="flex gap-2 mb-3 overflow-x-auto pb-1 scrollbar-hide">
            <button
              onClick={() => setSelectedCategory(undefined)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                selectedCategory === undefined
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Tag size={13} />
              Todos
            </button>
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category.id === selectedCategory ? undefined : category.id)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === category.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {category.name}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : displayProducts.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Package size={32} className="mx-auto mb-2 text-gray-300" />
              <p>{search ? 'No se encontraron productos' : 'No hay productos en esta categoria'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {displayProducts.map((product) => (
                <button
                  key={product.id}
                  onClick={() => handleAddProduct(product)}
                  disabled={Number(product.stock) <= 0}
                  className="card p-3 text-left hover:border-blue-300 hover:shadow-md transition-all active:scale-95 group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="text-sm font-medium text-gray-900 line-clamp-2 mb-1 group-hover:text-blue-700">
                    {product.name}
                  </div>
                  {product.barcode ? (
                    <div className="text-xs text-gray-400 mb-2">{product.barcode}</div>
                  ) : null}
                  <div className="flex items-center justify-between mt-auto">
                    <span className="text-sm font-bold text-blue-600">{formatCurrency(Number(product.price))}</span>
                    <span className={`text-xs ${Number(product.stock) <= 0 ? 'text-red-400' : 'text-gray-400'}`}>
                      {Number(product.stock) <= 0 ? 'Sin stock' : `Stock: ${Number(product.stock)}`}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="w-full md:w-80 lg:w-96 bg-white border-t md:border-t-0 md:border-l border-gray-200 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <ShoppingCart size={18} className="text-gray-600" />
            <span className="font-semibold text-gray-900">Carrito ({cart.length})</span>
          </div>
          {cart.length > 0 ? (
            <button onClick={clearCart} className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1">
              <Trash2 size={14} />
              Vaciar
            </button>
          ) : null}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cart.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <ShoppingCart size={36} className="mx-auto mb-2 text-gray-200" />
              <p className="text-sm">Toca un producto para agregarlo</p>
            </div>
          ) : (
            cart.map((item) => (
              <div key={item.product.id} className="flex items-start gap-2 p-2 rounded-lg bg-gray-50">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{item.product.name}</div>
                  <div className="text-xs text-gray-500">{formatCurrency(item.price)} c/u</div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                    className="w-6 h-6 rounded bg-gray-200 hover:bg-gray-300 flex items-center justify-center"
                  >
                    <Minus size={12} />
                  </button>
                  <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                  <button
                    onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                    className="w-6 h-6 rounded bg-blue-100 hover:bg-blue-200 text-blue-700 flex items-center justify-center"
                  >
                    <Plus size={12} />
                  </button>
                </div>

                <div className="text-right min-w-[70px]">
                  <div className="text-sm font-semibold text-gray-900">{formatCurrency(item.subtotal)}</div>
                  <button
                    onClick={() => removeFromCart(item.product.id)}
                    className="text-red-400 hover:text-red-600 mt-0.5"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {cart.length > 0 ? (
          <div className="border-t border-gray-100 p-4 space-y-3">
            {customerId ? (
              <div className="text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-2.5 py-2">
                Cliente: {customers.find((customer) => customer.id === customerId)?.name ?? 'Seleccionado'}
              </div>
            ) : null}

            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 flex-1">Descuento</label>
              <div className="relative w-36">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">Gs.</span>
                <input
                  type="number"
                  min="0"
                  className="input pl-9 text-sm py-1.5"
                  value={discount || ''}
                  onChange={(e) => setDiscount(Number(e.target.value))}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="flex justify-between text-sm text-gray-600">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal())}</span>
            </div>

            <div className="flex justify-between text-lg font-bold text-gray-900">
              <span>Total</span>
              <span className="text-blue-600">{formatCurrency(total())}</span>
            </div>

            <button onClick={() => setShowCheckout(true)} className="btn-primary w-full py-3 text-base">
              Cobrar <ChevronRight size={18} />
            </button>
          </div>
        ) : null}
      </div>

      {showCheckout ? (
        <CheckoutModal
          total={total()}
          customers={customers}
          customerId={customerId}
          autoPrintReceipt={autoPrintReceipt}
          paymentMethod={paymentMethod}
          amountPaid={amountPaid}
          change={change()}
          onToggleAutoPrintReceipt={setAutoPrintReceipt}
          onSetCustomerId={setCustomerId}
          onSetPayment={setPaymentMethod}
          onSetAmountPaid={setAmountPaid}
          onConfirm={handleSale}
          onClose={() => setShowCheckout(false)}
          hasOpenRegister={Boolean(currentRegister?.id)}
          isRegisterLoading={currentRegisterLoading}
          isLoading={createSale.isPending}
        />
      ) : null}
    </div>
  );
}

function CheckoutModal({
  total,
  customers,
  customerId,
  autoPrintReceipt,
  paymentMethod,
  amountPaid,
  change,
  onToggleAutoPrintReceipt,
  onSetCustomerId,
  onSetPayment,
  onSetAmountPaid,
  onConfirm,
  onClose,
  hasOpenRegister,
  isRegisterLoading,
  isLoading,
}: {
  total: number;
  customers: Customer[];
  customerId: string | null;
  autoPrintReceipt: boolean;
  paymentMethod: 'cash' | 'card' | 'transfer';
  amountPaid: number;
  change: number;
  onToggleAutoPrintReceipt: (value: boolean) => void;
  onSetCustomerId: (id: string | null) => void;
  onSetPayment: (method: 'cash' | 'card' | 'transfer') => void;
  onSetAmountPaid: (amount: number) => void;
  onConfirm: () => void;
  onClose: () => void;
  hasOpenRegister: boolean;
  isRegisterLoading: boolean;
  isLoading: boolean;
}) {
  const createCustomer = useCreateCustomer();
  const [customerSearch, setCustomerSearch] = useState('');
  const [showQuickCustomerForm, setShowQuickCustomerForm] = useState(false);
  const [quickCustomerName, setQuickCustomerName] = useState('');
  const [quickCustomerPhone, setQuickCustomerPhone] = useState('');
  const [quickCustomerEmail, setQuickCustomerEmail] = useState('');
  const [selectedCustomerName, setSelectedCustomerName] = useState<string | null>(null);

  useEffect(() => {
    if (!customerId) {
      setSelectedCustomerName(null);
    }
  }, [customerId]);

  const quickAmounts = getRecommendedCashAmounts(total);
  const selectedCustomer = customers.find((customer) => customer.id === customerId) ?? null;
  const selectedCustomerLabel = selectedCustomer?.name ?? selectedCustomerName;
  const normalizedCustomerSearch = customerSearch.trim().toLowerCase();
  const filteredCustomers = normalizedCustomerSearch
    ? customers.filter((customer) => {
        const phone = customer.phone ?? '';
        const email = customer.email ?? '';
        return (
          customer.name.toLowerCase().includes(normalizedCustomerSearch) ||
          phone.includes(normalizedCustomerSearch) ||
          email.toLowerCase().includes(normalizedCustomerSearch)
        );
      })
    : customers;

  const handleSelectCustomer = (customer: Customer) => {
    onSetCustomerId(customer.id);
    setSelectedCustomerName(customer.name);
  };

  const handleClearCustomer = () => {
    onSetCustomerId(null);
    setSelectedCustomerName(null);
  };

  const handleCreateQuickCustomer = async () => {
    if (!quickCustomerName.trim()) return;

    const created = await createCustomer.mutateAsync({
      name: quickCustomerName.trim(),
      phone: quickCustomerPhone.trim() || null,
      email: quickCustomerEmail.trim() || null,
    });

    onSetCustomerId(created.id);
    setSelectedCustomerName(created.name);
    setCustomerSearch(created.name);
    setQuickCustomerName('');
    setQuickCustomerPhone('');
    setQuickCustomerEmail('');
    setShowQuickCustomerForm(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white rounded-t-2xl sm:rounded-2xl p-6 shadow-xl">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Cobrar</h2>

        <div className="bg-blue-50 rounded-xl p-4 mb-4 text-center">
          <div className="text-sm text-blue-600 mb-1">Total a cobrar</div>
          <div className="text-3xl font-bold text-blue-700">{formatCurrency(total)}</div>
        </div>

        {!hasOpenRegister && !isRegisterLoading ? (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Debes abrir caja para confirmar ventas.
          </div>
        ) : null}

        <div className="mb-4">
          <label className="label">Cliente (opcional)</label>
          <input
            type="text"
            className="input mb-2"
            placeholder="Buscar cliente por nombre, telefono o email"
            value={customerSearch}
            onChange={(event) => setCustomerSearch(event.target.value)}
          />

          {selectedCustomerLabel ? (
            <div className="mb-2 flex items-center justify-between rounded-lg bg-blue-50 border border-blue-100 px-3 py-2">
              <div className="text-sm text-blue-800 truncate">
                {selectedCustomerLabel}
                {selectedCustomer?.phone ? ` - ${selectedCustomer.phone}` : ''}
              </div>
              <button
                type="button"
                className="text-xs text-blue-700 hover:text-blue-900"
                onClick={handleClearCustomer}
              >
                Quitar
              </button>
            </div>
          ) : null}

          <div className="max-h-32 overflow-y-auto space-y-1">
            {filteredCustomers.slice(0, 8).map((customer) => (
              <button
                type="button"
                key={customer.id}
                onClick={() => handleSelectCustomer(customer)}
                className={`w-full text-left rounded-lg px-2.5 py-2 text-sm transition-colors ${
                  customer.id === customerId
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                }`}
              >
                <div className="font-medium truncate">{customer.name}</div>
                <div className="text-xs text-gray-500 truncate">
                  {customer.phone || customer.email || 'Sin contacto'}
                </div>
              </button>
            ))}
            {!filteredCustomers.length ? (
              <div className="text-xs text-gray-500 py-1.5 px-2">No hay clientes para ese filtro.</div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => setShowQuickCustomerForm((value) => !value)}
            className="mt-2 text-xs text-blue-700 hover:text-blue-900"
          >
            {showQuickCustomerForm ? 'Cerrar formulario rapido' : '+ Crear cliente rapido'}
          </button>

          {showQuickCustomerForm ? (
            <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-2.5 space-y-2">
              <input
                type="text"
                className="input"
                placeholder="Nombre *"
                value={quickCustomerName}
                onChange={(event) => setQuickCustomerName(event.target.value)}
              />
              <input
                type="text"
                className="input"
                placeholder="Telefono (opcional)"
                value={quickCustomerPhone}
                onChange={(event) => setQuickCustomerPhone(event.target.value)}
              />
              <input
                type="email"
                className="input"
                placeholder="Email (opcional)"
                value={quickCustomerEmail}
                onChange={(event) => setQuickCustomerEmail(event.target.value)}
              />
              <button
                type="button"
                className="btn-primary w-full"
                disabled={createCustomer.isPending || !quickCustomerName.trim()}
                onClick={handleCreateQuickCustomer}
              >
                {createCustomer.isPending ? <Spinner size="sm" /> : 'Guardar y seleccionar cliente'}
              </button>
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4">
          {PAYMENT_METHODS.map((method) => (
            <button
              key={method.value}
              onClick={() => onSetPayment(method.value)}
              className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 text-sm font-medium transition-colors ${
                paymentMethod === method.value
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              <method.icon size={20} />
              {method.label}
            </button>
          ))}
        </div>

        {paymentMethod === 'cash' ? (
          <div className="space-y-2 mb-4">
            <label className="label">Monto entregado</label>
            <input
              type="number"
              className="input text-lg font-semibold"
              value={amountPaid || ''}
              onChange={(e) => onSetAmountPaid(Number(e.target.value))}
              placeholder={String(total)}
              autoFocus
            />
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => onSetAmountPaid(total)}
                className="col-span-3 py-1.5 text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg font-semibold"
              >
                Exacto: {formatCurrency(total)}
              </button>
              {quickAmounts.map((amount) => (
                <button
                  key={amount}
                  onClick={() => onSetAmountPaid(amount)}
                  className="py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg font-medium"
                >
                  {formatCurrency(amount)}
                </button>
              ))}
            </div>
            {change > 0 ? (
              <div className="flex justify-between p-3 bg-green-50 rounded-xl">
                <span className="text-green-700 font-medium">Vuelto</span>
                <span className="text-green-700 font-bold text-lg">{formatCurrency(change)}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        <label className="mb-4 flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={autoPrintReceipt}
            onChange={(event) => onToggleAutoPrintReceipt(event.target.checked)}
          />
          Imprimir ticket al confirmar
        </label>

        <button
          onClick={onConfirm}
          disabled={
            isLoading ||
            isRegisterLoading ||
            !hasOpenRegister ||
            (paymentMethod === 'cash' && amountPaid < total)
          }
          className="btn-success w-full py-3 text-base"
        >
          {isLoading ? <Spinner size="sm" /> : 'Confirmar venta'}
        </button>
      </div>
    </div>
  );
}
