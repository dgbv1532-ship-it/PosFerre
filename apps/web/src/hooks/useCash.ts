import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getApiError } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import type { CashRegister, CashMovement } from '@pos/shared';
import { useAuthStore } from '@/store/auth';
import { useOffline } from './useOffline';
import { generateId } from '@/lib/utils';
import {
  buildLocalCashRegister,
  clearOfflineRegister,
  readCachedCurrentRegister,
  readOfflineRegister,
  writeCachedCurrentRegister,
  writeOfflineRegister,
} from '@/lib/offlineCash';
import toast from 'react-hot-toast';

export function useCurrentRegister() {
  const { isOnline } = useOffline();
  const user = useAuthStore((state) => state.user);

  return useQuery<CashRegister | null>({
    queryKey: ['cash', 'current'],
    queryFn: async () => {
      const offlineRegister = readOfflineRegister(user?.storeId, user?.id);
      const localOffline =
        offlineRegister && user
          ? buildLocalCashRegister(offlineRegister, user.name)
          : null;

      if (!isOnline) {
        return localOffline ?? readCachedCurrentRegister(user?.storeId, user?.id);
      }

      try {
        const res = await api.get('/cash/current');
        const register = res.data.data as CashRegister | null;
        writeCachedCurrentRegister(register, user?.storeId, user?.id);
        if (register) {
          clearOfflineRegister();
          return register;
        }
        if (localOffline) return localOffline;
        return register;
      } catch (error) {
        if (!navigator.onLine) {
          return localOffline ?? readCachedCurrentRegister(user?.storeId, user?.id);
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
      if (!navigator.onLine) {
        if (!user?.storeId || !user.id) {
          throw new Error('Sesion invalida. Vuelve a iniciar sesion.');
        }

        const offlineEntry = {
          localId: `local-reg-${generateId()}`,
          storeId: user.storeId,
          userId: user.id,
          openingAmount: data.openingAmount,
          notes: data.notes ?? null,
          openedAt: new Date().toISOString(),
          pendingSync: true,
        };

        writeOfflineRegister(offlineEntry);
        return buildLocalCashRegister(offlineEntry, user.name);
      }

      const res = await api.post('/cash/open', data);
      return res.data.data as CashRegister;
    },
    onSuccess: (register) => {
      writeCachedCurrentRegister(register, user?.storeId, user?.id);
      const isLocal = String(register.id).startsWith('local-reg-');
      if (!isLocal) {
        clearOfflineRegister();
      }
      qc.invalidateQueries({ queryKey: ['cash'] });
      toast.success(isLocal ? 'Caja abierta offline — se sincronizara al reconectar' : 'Caja abierta');
    },
    onError: (err) => toast.error(getApiError(err)),
  });
}

export function useCloseCashRegister() {
  const qc = useQueryClient();
  const user = useAuthStore((state) => state.user);
  return useMutation({
    mutationFn: async (data: { closingAmount: number; notes?: string }) => {
      if (!navigator.onLine) {
        const offlineEntry = readOfflineRegister(user?.storeId, user?.id);
        if (offlineEntry) {
          clearOfflineRegister();
          writeCachedCurrentRegister(null, user?.storeId, user?.id);
          return {
            ...buildLocalCashRegister(offlineEntry, user?.name),
            closedAt: new Date().toISOString(),
            closingAmount: data.closingAmount,
            expectedClosingAmount: data.closingAmount,
            closingDifference: 0,
            notes: data.notes ?? offlineEntry.notes,
          } as CashRegister;
        }

        throw new Error('No se puede cerrar caja sin conexion en una caja sincronizada.');
      }

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
