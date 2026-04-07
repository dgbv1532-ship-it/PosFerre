import { type FormEvent, useMemo, useState } from 'react';
import { Edit2, Plus, Search, UserRound } from 'lucide-react';
import type { Customer } from '@pos/shared';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { useCreateCustomer, useCustomers, useUpdateCustomer } from '@/hooks/useCustomers';

export function CustomersPage() {
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);

  const query = useMemo(() => search.trim(), [search]);
  const { data: customers, isLoading } = useCustomers(query || undefined);
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();

  const handleEdit = (customer: Customer) => {
    setEditing(customer);
    setShowModal(true);
  };

  const handleSave = async (data: { name: string; phone?: string | null; email?: string | null }) => {
    if (editing) {
      await updateCustomer.mutateAsync({ id: editing.id, data });
    } else {
      await createCustomer.mutateAsync(data);
    }
    setShowModal(false);
    setEditing(null);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h1 className="text-lg font-bold text-gray-900">Clientes</h1>
          <button
            onClick={() => {
              setEditing(null);
              setShowModal(true);
            }}
            className="btn-primary btn-sm"
          >
            <Plus size={15} /> Nuevo
          </button>
        </div>

        <div className="relative">
          <Search size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-8 py-1.5 text-sm"
            placeholder="Buscar por nombre, telefono o email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : customers?.length ? (
          <div className="space-y-2">
            {customers.map((customer) => (
              <div key={customer.id} className="card p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center">
                  <UserRound size={16} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{customer.name}</div>
                  <div className="text-xs text-gray-500 truncate">
                    {customer.phone || 'Sin telefono'} {customer.email ? `- ${customer.email}` : ''}
                  </div>
                </div>

                <button
                  onClick={() => handleEdit(customer)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                  title="Editar cliente"
                >
                  <Edit2 size={14} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={UserRound}
            title="Sin clientes"
            description={search ? 'No se encontraron clientes con ese filtro.' : 'Crea tu primer cliente para asociarlo a ventas.'}
            action={
              <button
                onClick={() => {
                  setEditing(null);
                  setShowModal(true);
                }}
                className="btn-primary btn-sm"
              >
                <Plus size={14} /> Agregar cliente
              </button>
            }
          />
        )}
      </div>

      <Modal
        open={showModal}
        onClose={() => {
          setShowModal(false);
          setEditing(null);
        }}
        title={editing ? 'Editar cliente' : 'Nuevo cliente'}
        size="sm"
      >
        <CustomerForm
          customer={editing}
          onSave={handleSave}
          isLoading={createCustomer.isPending || updateCustomer.isPending}
        />
      </Modal>
    </div>
  );
}

function CustomerForm({
  customer,
  onSave,
  isLoading,
}: {
  customer: Customer | null;
  onSave: (data: { name: string; phone?: string | null; email?: string | null }) => void;
  isLoading: boolean;
}) {
  const [name, setName] = useState(customer?.name ?? '');
  const [phone, setPhone] = useState(customer?.phone ?? '');
  const [email, setEmail] = useState(customer?.email ?? '');

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSave({
      name: name.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">Nombre</label>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
        />
      </div>

      <div>
        <label className="label">Telefono</label>
        <input
          className="input"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Opcional"
        />
      </div>

      <div>
        <label className="label">Email</label>
        <input
          type="email"
          className="input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Opcional"
        />
      </div>

      <button type="submit" className="btn-primary w-full" disabled={isLoading || !name.trim()}>
        {isLoading ? <Spinner size="sm" /> : 'Guardar cliente'}
      </button>
    </form>
  );
}
