import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getApiError } from '@/lib/api';
import type { Customer } from '@pos/shared';
import toast from 'react-hot-toast';

interface CustomerInput {
  name: string;
  phone?: string | null;
  email?: string | null;
}

export function useCustomers(search?: string) {
  return useQuery<Customer[]>({
    queryKey: ['customers', search ?? ''],
    queryFn: async () => {
      const res = await api.get('/customers', {
        params: search ? { search } : undefined,
      });
      return res.data.data as Customer[];
    },
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: CustomerInput) => {
      const res = await api.post('/customers', data);
      return res.data.data as Customer;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Cliente creado');
    },
    onError: (error) => toast.error(getApiError(error)),
  });
}

export function useUpdateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: CustomerInput }) => {
      const res = await api.put(`/customers/${id}`, data);
      return res.data.data as Customer;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Cliente actualizado');
    },
    onError: (error) => toast.error(getApiError(error)),
  });
}
