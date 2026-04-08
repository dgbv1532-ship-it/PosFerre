import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getApiError } from '@/lib/api';
import { addToSyncQueue } from '@/db/local';
import { generateId } from '@/lib/utils';
import type { Sale, CreateSaleInput } from '@pos/shared';
import axios from 'axios';
import toast from 'react-hot-toast';

export function useSales(params?: {
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
  paymentMethod?: 'cash' | 'card' | 'transfer';
}) {
  return useQuery({
    queryKey: ['sales', params],
    queryFn: async () => {
      const res = await api.get('/sales', { params });
      return res.data as { data: Sale[]; total: number };
    },
  });
}

export function useCreateSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateSaleInput) => {
      if (!navigator.onLine) {
        // Queue for later sync
        const localId = generateId();
        const createdAt = new Date().toISOString();
        const payload = {
          ...data,
          // Always sync offline sales without registerId.
          // The server resolves the correct open register at sync time.
          registerId: null,
          createdAt,
          items: data.items.map((item) => ({
            ...item,
            subtotal: item.price * item.quantity,
          })),
        };
        await addToSyncQueue({
          localId,
          entity: 'sale',
          operation: 'create',
          payload: payload as unknown as Record<string, unknown>,
          createdAt,
        });
        return { offline: true, localId };
      }

      const res = await api.post('/sales', data);
      return res.data.data as Sale;
    },
    onSuccess: (result) => {
      if ('offline' in result && result.offline) {
        toast.success('Venta guardada offline — se sincronizará al reconectar', {
          icon: '📴',
          duration: 4000,
        });
      } else {
        toast.success('Venta registrada');
      }
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['cash'] });
      qc.invalidateQueries({ queryKey: ['reports'] });
    },
    onError: (err) => toast.error(getApiError(err)),
  });
}

export function useCancelSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/sales/${id}/cancel`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      toast.success('Venta cancelada');
    },
    onError: (err) => toast.error(getApiError(err)),
  });
}

export function useDailyReport(from?: string, to?: string) {
  return useQuery({
    queryKey: ['reports', 'daily', from, to],
    queryFn: async () => {
      const res = await api.get('/reports/daily', { params: { from, to } });
      return res.data.data;
    },
    staleTime: 1000 * 60,
  });
}

export function useLowStockReport() {
  return useQuery({
    queryKey: ['reports', 'low-stock'],
    queryFn: async () => {
      const res = await api.get('/reports/low-stock');
      return res.data.data;
    },
  });
}

export function useSalesByPeriod(from: string, to: string) {
  return useQuery<Array<{ day: string; count: number; total: number }>>({
    queryKey: ['reports', 'sales-by-period', from, to],
    queryFn: async () => {
      const res = await api.get('/reports/sales-by-period', { params: { from, to } });
      return res.data.data;
    },
    enabled: Boolean(from && to),
  });
}

export function useDashboardReport(days = 14) {
  return useQuery({
    queryKey: ['reports', 'dashboard', days],
    queryFn: async () => {
      try {
        const res = await api.get('/reports/dashboard', { params: { days } });
        return res.data.data;
      } catch (error) {
        const status = axios.isAxiosError(error) ? error.response?.status : undefined;
        if (status !== 404) throw error;

        const now = new Date();
        const to = now.toISOString();

        const startOfToday = new Date(now);
        startOfToday.setHours(0, 0, 0, 0);

        const fromToday = startOfToday.toISOString();
        const from7 = new Date(startOfToday);
        from7.setDate(from7.getDate() - 6);
        const from30 = new Date(startOfToday);
        from30.setDate(from30.getDate() - 29);
        const fromTrend = new Date(startOfToday);
        fromTrend.setDate(fromTrend.getDate() - (days - 1));

        const [
          todayRes,
          last7Res,
          last30Res,
          trendDailyRes,
          trendRes,
          lowStockRes,
          currentCashRes,
        ] = await Promise.all([
          api.get('/reports/daily', { params: { from: fromToday, to } }),
          api.get('/reports/daily', { params: { from: from7.toISOString(), to } }),
          api.get('/reports/daily', { params: { from: from30.toISOString(), to } }),
          api.get('/reports/daily', { params: { from: fromTrend.toISOString(), to } }),
          api.get('/reports/sales-by-period', { params: { from: fromTrend.toISOString(), to } }),
          api.get('/reports/low-stock'),
          api.get('/cash/current'),
        ]);

        const today = todayRes.data.data as { totalSales: number; totalRevenue: number };
        const last7 = last7Res.data.data as { totalRevenue: number };
        const last30 = last30Res.data.data as { totalRevenue: number };
        const trendDaily = trendDailyRes.data.data as {
          topProducts?: Array<{ productId: string; name: string; quantity: number; revenue: number }>;
        };
        const trend = (trendRes.data.data ?? []) as Array<{ day: string; count: number; total: number }>;
        const lowStock = (lowStockRes.data.data ?? []) as Array<unknown>;
        const currentCash = currentCashRes.data.data;

        return {
          period: {
            from: fromTrend.toISOString(),
            to,
            days,
          },
          metrics: {
            todaySalesCount: today.totalSales ?? 0,
            todayRevenue: today.totalRevenue ?? 0,
            avgTicketToday:
              (today.totalSales ?? 0) > 0
                ? Number((today.totalRevenue ?? 0) / (today.totalSales ?? 1))
                : 0,
            last7Revenue: last7.totalRevenue ?? 0,
            last30Revenue: last30.totalRevenue ?? 0,
            lowStockCount: lowStock.length,
            openRegisters: currentCash ? 1 : 0,
          },
          trend,
          topProducts: (trendDaily.topProducts ?? []).map((item) => ({
            productId: item.productId,
            name: item.name,
            quantity: item.quantity,
            total: item.revenue,
          })),
          fallbackMode: true,
        };
      }
    },
    staleTime: 1000 * 30,
  });
}
