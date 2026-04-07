import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getApiError } from '@/lib/api';
import { useOffline } from './useOffline';
import { listCategoriesLocal, listProductsLocal, searchProductsLocal } from '@/db/local';
import { useAuthStore } from '@/store/auth';
import type { Product, Category } from '@pos/shared';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';

// ============================================
// Categories
// ============================================

export function useCategories() {
  const { isOnline } = useOffline();
  const storeId = useAuthStore((state) => state.user?.storeId ?? '');

  return useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: async () => {
      if (!isOnline) {
        return listCategoriesLocal(storeId);
      }

      try {
        const res = await api.get('/categories');
        return res.data.data;
      } catch (error) {
        if (!navigator.onLine) {
          return listCategoriesLocal(storeId);
        }
        throw error;
      }
    },
    enabled: Boolean(storeId),
    staleTime: 1000 * 60 * 5,
  });
}

// ============================================
// Products list
// ============================================

export function useProducts(params?: {
  search?: string;
  categoryId?: string;
  lowStock?: boolean;
  page?: number;
  limit?: number;
}) {
  const { isOnline } = useOffline();
  const storeId = useAuthStore((state) => state.user?.storeId ?? '');

  return useQuery({
    queryKey: ['products', params],
    queryFn: async () => {
      if (!isOnline) {
        return listProductsLocal({
          storeId,
          search: params?.search,
          categoryId: params?.categoryId,
          lowStock: params?.lowStock,
          page: params?.page,
          limit: params?.limit,
        });
      }

      try {
        const res = await api.get('/products', { params });
        return res.data as { data: Product[]; total: number; page: number; limit: number };
      } catch (error) {
        if (!navigator.onLine) {
          return listProductsLocal({
            storeId,
            search: params?.search,
            categoryId: params?.categoryId,
            lowStock: params?.lowStock,
            page: params?.page,
            limit: params?.limit,
          });
        }
        throw error;
      }
    },
    enabled: Boolean(storeId),
    staleTime: 1000 * 60 * 2,
  });
}

// ============================================
// Product search (offline-capable)
// ============================================

export function useProductSearch(query: string) {
  const { isOnline } = useOffline();
  const storeId = useAuthStore.getState().user?.storeId ?? '';
  const [localResults, setLocalResults] = useState<Product[]>([]);

  // Online: use API search
  const apiSearch = useQuery({
    queryKey: ['products', 'search', query],
    queryFn: async () => {
      const res = await api.get('/products', { params: { search: query, limit: 20, active: true } });
      return res.data.data as Product[];
    },
    enabled: isOnline && query.length >= 1,
    staleTime: 30000,
  });

  // Offline: use local IndexedDB
  useEffect(() => {
    if (!isOnline && query.length >= 1) {
      searchProductsLocal(query, storeId).then(setLocalResults);
    } else {
      setLocalResults([]);
    }
  }, [query, isOnline, storeId]);

  return {
    products: isOnline ? (apiSearch.data ?? []) : localResults,
    isLoading: isOnline ? apiSearch.isLoading : false,
  };
}

// ============================================
// Mutations
// ============================================

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await api.post('/products', data);
      return res.data.data as Product;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      toast.success('Producto creado');
    },
    onError: (err) => toast.error(getApiError(err)),
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const res = await api.put(`/products/${id}`, data);
      return res.data.data as Product;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      toast.success('Producto actualizado');
    },
    onError: (err) => toast.error(getApiError(err)),
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/products/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      toast.success('Producto eliminado');
    },
    onError: (err) => toast.error(getApiError(err)),
  });
}

export function useAdjustProductStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      quantity,
      reason,
    }: {
      id: string;
      quantity: number;
      reason?: string;
    }) => {
      const res = await api.patch(`/products/${id}/stock`, { quantity, reason });
      return res.data.data as Product;
    },
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({ queryKey: ['products'] });
      const operationLabel = variables.quantity >= 0 ? 'Entrada' : 'Salida';
      toast.success(`${operationLabel} de stock registrada`);
    },
    onError: (err) => toast.error(getApiError(err)),
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string }) => {
      const res = await api.post('/categories', data);
      return res.data.data as Category;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Categoría creada');
    },
    onError: (err) => toast.error(getApiError(err)),
  });
}
