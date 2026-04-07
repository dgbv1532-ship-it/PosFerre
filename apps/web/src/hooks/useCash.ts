import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getApiError } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import type { CashRegister, CashMovement } from '@pos/shared';
import toast from 'react-hot-toast';

export function useCurrentRegister() {
  return useQuery<CashRegister | null>({
    queryKey: ['cash', 'current'],
    queryFn: async () => {
      const res = await api.get('/cash/current');
      return res.data.data;
    },
    refetchInterval: 10000,
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
  return useMutation({
    mutationFn: async (data: { openingAmount: number; notes?: string }) => {
      const res = await api.post('/cash/open', data);
      return res.data.data as CashRegister;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cash'] });
      toast.success('Caja abierta');
    },
    onError: (err) => toast.error(getApiError(err)),
  });
}

export function useCloseCashRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { closingAmount: number; notes?: string }) => {
      const res = await api.post('/cash/close', data);
      return res.data.data as CashRegister;
    },
    onSuccess: (register) => {
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
