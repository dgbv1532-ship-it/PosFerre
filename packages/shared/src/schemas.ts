import { z } from 'zod';

// ============================================
// Auth Schemas
// ============================================

export const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
});

export const registerStoreSchema = z.object({
  storeName: z.string().min(2, 'Nombre mínimo 2 caracteres').max(100),
  adminName: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(6).max(100),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

// ============================================
// Product Schemas
// ============================================

export const createProductSchema = z.object({
  name: z.string().min(1, 'Nombre requerido').max(200),
  barcode: z.string().max(50).nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  price: z.number().min(0, 'Precio debe ser positivo'),
  cost: z.number().min(0).default(0),
  stock: z.number().min(0).default(0),
  minStock: z.number().min(0).default(5),
  unit: z.string().max(20).default('unidad'),
  imageUrl: z.string().url().nullable().optional(),
  active: z.boolean().default(true),
});

export const updateProductSchema = createProductSchema.partial();

export const adjustStockSchema = z.object({
  quantity: z.number().int(),
  reason: z.string().max(200).optional(),
});

// ============================================
// Category Schemas
// ============================================

export const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
});

export const updateCategorySchema = createCategorySchema.partial();

// ============================================
// Sale Schemas
// ============================================

export const saleItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().min(0.001),
  price: z.number().min(0),
});

export const createSaleSchema = z.object({
  registerId: z.string().uuid().nullable().optional(),
  customerId: z.string().uuid().nullable().optional(),
  items: z.array(saleItemSchema).min(1, 'Al menos 1 producto'),
  discount: z.number().min(0).default(0),
  paymentMethod: z.enum(['cash', 'card', 'transfer']),
  amountPaid: z.number().min(0).optional(),
});

// ============================================
// Cash Register Schemas
// ============================================

export const openCashRegisterSchema = z.object({
  openingAmount: z.number().min(0, 'Monto inicial debe ser positivo'),
  notes: z.string().max(500).optional(),
});

export const closeCashRegisterSchema = z.object({
  closingAmount: z.number().min(0),
  notes: z.string().max(500).optional(),
});

export const cashMovementSchema = z.object({
  type: z.enum(['in', 'out']),
  amount: z.number().min(0.01),
  description: z.string().min(1).max(200),
});

// ============================================
// Customer Schemas
// ============================================

export const createCustomerSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().max(20).nullable().optional(),
  email: z.string().email().nullable().optional(),
});

export const updateCustomerSchema = createCustomerSchema.partial();

// ============================================
// User Schemas
// ============================================

export const createUserSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(6).max(100),
  role: z.enum(['admin', 'cashier']).default('cashier'),
});

export const updateUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  role: z.enum(['admin', 'cashier']).optional(),
  active: z.boolean().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6).max(100),
});

// ============================================
// Sync Schemas
// ============================================

export const syncItemSchema = z.object({
  localId: z.string(),
  entity: z.enum(['sale', 'product', 'cash_movement']),
  operation: z.enum(['create', 'update', 'delete']),
  payload: z.record(z.unknown()),
  createdAt: z.string().datetime(),
});

export const syncRequestSchema = z.object({
  deviceId: z.string().min(1),
  items: z.array(syncItemSchema),
});

// ============================================
// Query/Filter Schemas
// ============================================

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const productQuerySchema = paginationSchema.extend({
  search: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  lowStock: z.coerce.boolean().optional(),
  active: z.coerce.boolean().default(true),
});

export const salesQuerySchema = paginationSchema.extend({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  paymentMethod: z.enum(['cash', 'card', 'transfer']).optional(),
  userId: z.string().uuid().optional(),
});

// Inferred types
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterStoreInput = z.infer<typeof registerStoreSchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type CreateSaleInput = z.infer<typeof createSaleSchema>;
export type OpenCashRegisterInput = z.infer<typeof openCashRegisterSchema>;
export type CloseCashRegisterInput = z.infer<typeof closeCashRegisterSchema>;
export type CashMovementInput = z.infer<typeof cashMovementSchema>;
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type SyncRequestInput = z.infer<typeof syncRequestSchema>;
