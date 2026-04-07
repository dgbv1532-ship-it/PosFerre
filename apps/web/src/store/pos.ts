import { create } from 'zustand';
import type { Product } from '@pos/shared';

export interface CartItem {
  product: Product;
  quantity: number;
  price: number;
  subtotal: number;
}

interface POSState {
  cart: CartItem[];
  discount: number;
  customerId: string | null;
  paymentMethod: 'cash' | 'card' | 'transfer';
  amountPaid: number;

  addToCart: (product: Product, quantity?: number) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  updatePrice: (productId: string, price: number) => void;
  setDiscount: (discount: number) => void;
  setCustomerId: (id: string | null) => void;
  setPaymentMethod: (method: 'cash' | 'card' | 'transfer') => void;
  setAmountPaid: (amount: number) => void;
  clearCart: () => void;

  // Computed
  subtotal: () => number;
  total: () => number;
  change: () => number;
}

export const usePOSStore = create<POSState>((set, get) => ({
  cart: [],
  discount: 0,
  customerId: null,
  paymentMethod: 'cash',
  amountPaid: 0,

  addToCart: (product, quantity = 1) => {
    set((state) => {
      const existing = state.cart.find((i) => i.product.id === product.id);
      if (existing) {
        return {
          cart: state.cart.map((i) =>
            i.product.id === product.id
              ? {
                  ...i,
                  quantity: i.quantity + quantity,
                  subtotal: i.price * (i.quantity + quantity),
                }
              : i,
          ),
        };
      }
      const price = Number(product.price);
      return {
        cart: [
          ...state.cart,
          {
            product,
            quantity,
            price,
            subtotal: price * quantity,
          },
        ],
      };
    });
  },

  removeFromCart: (productId) =>
    set((state) => ({ cart: state.cart.filter((i) => i.product.id !== productId) })),

  updateQuantity: (productId, quantity) => {
    if (quantity <= 0) {
      get().removeFromCart(productId);
      return;
    }
    set((state) => ({
      cart: state.cart.map((i) =>
        i.product.id === productId
          ? { ...i, quantity, subtotal: i.price * quantity }
          : i,
      ),
    }));
  },

  updatePrice: (productId, price) =>
    set((state) => ({
      cart: state.cart.map((i) =>
        i.product.id === productId
          ? { ...i, price, subtotal: price * i.quantity }
          : i,
      ),
    })),

  setDiscount: (discount) => set({ discount }),
  setCustomerId: (id) => set({ customerId: id }),
  setPaymentMethod: (method) => set({ paymentMethod: method }),
  setAmountPaid: (amount) => set({ amountPaid: amount }),

  clearCart: () =>
    set({ cart: [], discount: 0, customerId: null, amountPaid: 0, paymentMethod: 'cash' }),

  subtotal: () => get().cart.reduce((sum, i) => sum + i.subtotal, 0),
  total: () => Math.max(0, get().subtotal() - get().discount),
  change: () => Math.max(0, get().amountPaid - get().total()),
}));
