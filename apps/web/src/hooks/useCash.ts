import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getApiError } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import type { CashRegister, CashMovement } from '@pos/shared';
import { useAuthStore } from '@/store/auth';
import { useOffline } from './useOffline';
import toast from 'react-hot-toast';

const CURRENT_REGISTER_CACHE_KEY = 'ferretpos-current-register';

interface CurrentRegisterCacheEntry {
  storeId: string;
  userId: string;
  register: CashRegister;
}

function readCachedCurrentRegister(storeId?: string, userId?: string): CashRegister | null {
  if (!storeId || !userId) return null;

  const raw = localStorage.getItem(CURRENT_REGISTER_CACHE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as CurrentRegisterCacheEntry;
    if (parsed.storeId !== storeId || parsed.userId !== userId) return null;
    return parsed.register ?? null;
  } catch {
    return null;
  }
}

function writeCachedCurrentRegister(
  register: CashRegister | null,
  storeId?: string,
  userId?: string,
) {
  if (!storeId || !userId || !register) {
    localStorage.removeItem(CURRENT_REGISTER_CACHE_KEY);
    return;
  }

  const entry: CurrentRegisterCacheEntry = { storeId, userId, register };
  localStorage.setItem(CURRENT_REGISTER_CACHE_KEY, JSON.stringify(entry));
}

export function useCurrentRegister() {
  const { isOnline } = useOffline();
  const user = useAuthStore((state) => state.user);

  return useQuery<CashRegister | null>({
    queryKey: ['cash', 'current'],
    queryFn: async () => {
      if (!isOnline) {
        return readCachedCurrentRegister(user?.storeId, user?.id);
      }

      try {
        const res = await api.get('/cash/current');
        const register = res.data.data as CashRegister | null;
        writeCachedCurrentRegister(register, user?.storeId, user?.id);
        return register;
      } catch (error) {
        if (!navigator.onLine) {
          return readCachedCurrentRegister(user?.storeId, user?.id);
        }

        throw error;
      }
    },
    retry: isOnline ? 2 : false,
    refetchInterval: isOnline ? 10000 : false,
  });
}

export function useRegisterDetail(id: string | null) {
  return useQuery({
    queryKey: ['cash', 'register', id],
    queryFn: async () => {
      const res = await api.get(`/cash/registers/${id}`);
      return res.data.data;
    },
    enabled: !!id,
    refetchInterval: id ? 10000 : false,
  });
}

export function useCashRegisters() {
  return useQuery<CashRegister[]>({
    queryKey: ['cash', 'registers'],
    queryFn: async () => {
      const res = await api.get('/cash/registers');
      return res.data.data;
    },
  });
}

export function useOpenCashRegister() {
  const qc = useQueryClient();
  const user = useAuthStore((state) => state.user);
  return useMutation({
    mutationFn: async (data: { openingAmount: number; notes?: string }) => {
      const res = await api.post('/cash/open', data);
      return res.data.data as CashRegister;
    },
    onSuccess: (register) => {
      writeCachedCurrentRegister(register, user?.storeId, user?.id);
      qc.invalidateQueries({ queryKey: ['cash'] });
      toast.success('Caja abierta');
    },
    onError: (err) => toast.error(getApiError(err)),
  });
}

export function useCloseCashRegister() {
  const qc = useQueryClient();
  const user = useAuthStore((state) => state.user);
  return useMutation({
    mutationFn: async (data: { closingAmount: number; notes?: string }) => {
      const res = await api.post('/cash/close', data);
      return res.data.data as CashRegister;
    },
    onSuccess: (register) => {
      writeCachedCurrentRegister(null, user?.storeId, user?.id);
      qc.invalidateQueries({ queryKey: ['cash'] });
      const diff = Number((register as unknown as { closingDifference?: number | string | null }).closingDifference ?? 0);
      if (diff === 0) {
        toast.success('Caja cerrada sin diferencia');
        return;
      }
      toast.success(
        `Caja cerrada (${diff > 0 ? 'Sobrante' : 'Faltante'}: ${formatCurrency(Math.abs(diff))})`,
      );
    },
    onError: (err) => toast.error(getApiError(err)),
  });
}

export function useAddCashMovement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { type: 'in' | 'out'; amount: number; description: string }) => {
      const res = await api.post('/cash/movements', data);
      return res.data.data as CashMovement;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cash'] });
      toast.success('Movimiento registrado');
    },
    onError: (err) => toast.error(getApiError(err)),
  });
}
