// ============================================
// Core Domain Types
// ============================================

export type UserRole = 'admin' | 'cashier';
export type PaymentMethod = 'cash' | 'card' | 'transfer';
export type SaleStatus = 'completed' | 'cancelled';
export type CashMovementType = 'in' | 'out';
export type StorePlan = 'basic' | 'pro' | 'multi';

export interface Store {
  id: string;
  name: string;
  plan: StorePlan;
  trialEndsAt: string | null;
  createdAt: string;
}

export interface User {
  id: string;
  storeId: string;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
}

export interface Category {
  id: string;
  storeId: string;
  name: string;
  createdAt: string;
}

export interface Product {
  id: string;
  storeId: string;
  categoryId: string | null;
  name: string;
  barcode: string | null;
  price: number;
  cost: number;
  stock: number;
  minStock: number;
  unit: string;
  imageUrl: string | null;
  active: boolean;
  updatedAt: string;
  createdAt: string;
  // populated relation
  category?: Category;
}

export interface Customer {
  id: string;
  storeId: string;
  name: string;
  phone: string | null;
  email: string | null;
  createdAt: string;
}

export interface CashRegister {
  id: string;
  storeId: string;
  userId: string;
  openedAt: string;
  closedAt: string | null;
  openingAmount: number;
  closingAmount: number | null;
  expectedClosingAmount: number | null;
  closingDifference: number | null;
  notes: string | null;
  user?: Pick<User, 'id' | 'name' | 'email'>;
}

export interface CashMovement {
  id: string;
  registerId: string;
  type: CashMovementType;
  amount: number;
  description: string;
  createdAt: string;
}

export interface SaleItem {
  id: string;
  saleId: string;
  productId: string;
  quantity: number;
  price: number;
  subtotal: number;
  product?: Pick<Product, 'id' | 'name' | 'barcode' | 'unit'>;
}

export interface Sale {
  id: string;
  storeId: string;
  registerId: string | null;
  userId: string;
  customerId: string | null;
  total: number;
  discount: number;
  paymentMethod: PaymentMethod;
  status: SaleStatus;
  syncedAt: string | null;
  createdAt: string;
  items?: SaleItem[];
  user?: Pick<User, 'id' | 'name'>;
  customer?: Pick<Customer, 'id' | 'name'>;
}

// ============================================
// Auth Types
// ============================================

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface JWTPayload {
  userId: string;
  storeId: string;
  role: UserRole;
}

// ============================================
// API Response Types
// ============================================

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}

// ============================================
// Sync Types (Offline)
// ============================================

export type SyncEntity = 'sale' | 'product' | 'cash_movement';
export type SyncOperation = 'create' | 'update' | 'delete';

export interface SyncQueueItem {
  id: string;
  storeId: string;
  deviceId: string;
  entity: SyncEntity;
  operation: SyncOperation;
  payload: Record<string, unknown>;
  createdAt: string;
  syncedAt: string | null;
}

export interface SyncRequest {
  deviceId: string;
  items: Array<{
    localId: string;
    entity: SyncEntity;
    operation: SyncOperation;
    payload: Record<string, unknown>;
    createdAt: string;
  }>;
}

export interface SyncResponse {
  synced: string[];
  failed: Array<{ localId: string; error: string }>;
  serverUpdates: {
    products: Product[];
    categories: Category[];
  };
}

// ============================================
// Reports Types
// ============================================

export interface DailySummary {
  date: string;
  totalSales: number;
  totalRevenue: number;
  totalDiscount: number;
  byPaymentMethod: Record<PaymentMethod, number>;
  topProducts: Array<{
    productId: string;
    name: string;
    quantity: number;
    revenue: number;
  }>;
}

export interface LowStockAlert {
  productId: string;
  name: string;
  stock: number;
  minStock: number;
  category?: string;
}
