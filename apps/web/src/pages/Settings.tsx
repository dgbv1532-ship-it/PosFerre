import { useState } from 'react';
import { Users, Tag, Key, Plus, Power } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getApiError } from '@/lib/api';
import { useCategories, useCreateCategory } from '@/hooks/useProducts';
import { roleLabel } from '@/lib/utils';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { createUserSchema } from '@pos/shared';
import type { User, Category } from '@pos/shared';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/auth';

export function SettingsPage() {
  const [tab, setTab] = useState<'users' | 'categories' | 'password'>('users');
  const user = useAuthStore((s) => s.user);

  if (user?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        <div className="text-center">
          <Key size={40} className="mx-auto mb-3 text-gray-300" />
          <p>Acceso restringido a administradores</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-lg font-bold text-gray-900 mb-4">Ajustes</h1>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg mb-6 w-fit">
          {[
            { key: 'users', label: 'Usuarios', icon: Users },
            { key: 'categories', label: 'Categorías', icon: Tag },
            { key: 'password', label: 'Contraseña', icon: Key },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key as typeof tab)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                tab === key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600'
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {tab === 'users' && <UsersTab />}
        {tab === 'categories' && <CategoriesTab />}
        {tab === 'password' && <PasswordTab />}
      </div>
    </div>
  );
}

// ============================================
// Users Tab
// ============================================

function UsersTab() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);

  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await api.get('/users');
      return res.data.data;
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      await api.put(`/users/${id}`, { active });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
    onError: (err) => toast.error(getApiError(err)),
  });

  const createUser = useMutation({
    mutationFn: async (data: Record<string, string>) => {
      const res = await api.post('/users', data);
      return res.data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setShowModal(false);
      toast.success('Usuario creado');
    },
    onError: (err) => toast.error(getApiError(err)),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-gray-500">{users?.length ?? 0} usuarios</span>
        <button onClick={() => setShowModal(true)} className="btn-primary btn-sm">
          <Plus size={14} /> Nuevo usuario
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : (
        <div className="space-y-2">
          {users?.map((u) => (
            <div key={u.id} className="card p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-sm">
                {u.name[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900">{u.name}</div>
                <div className="text-xs text-gray-500">{u.email} · {roleLabel(u.role)}</div>
              </div>
              <button
                onClick={() => toggleActive.mutate({ id: u.id, active: !u.active })}
                className={`p-1.5 rounded-lg transition-colors ${
                  u.active
                    ? 'text-green-600 hover:bg-green-50'
                    : 'text-gray-400 hover:bg-gray-100'
                }`}
                title={u.active ? 'Desactivar' : 'Activar'}
              >
                <Power size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Nuevo usuario" size="sm">
        <UserForm
          onSave={(data) => createUser.mutate(data)}
          isLoading={createUser.isPending}
        />
      </Modal>
    </div>
  );
}

function UserForm({ onSave, isLoading }: {
  onSave: (data: Record<string, string>) => void;
  isLoading: boolean;
}) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'cashier' });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = createUserSchema.safeParse(form);
    if (!result.success) {
      toast.error(result.error.errors[0].message);
      return;
    }
    onSave(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">Nombre</label>
        <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
      </div>
      <div>
        <label className="label">Email</label>
        <input type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
      </div>
      <div>
        <label className="label">Contraseña</label>
        <input type="password" className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={6} required />
      </div>
      <div>
        <label className="label">Rol</label>
        <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="cashier">Cajero</option>
          <option value="admin">Administrador</option>
        </select>
      </div>
      <button type="submit" disabled={isLoading} className="btn-primary w-full">
        {isLoading ? <Spinner size="sm" /> : 'Crear usuario'}
      </button>
    </form>
  );
}

// ============================================
// Categories Tab
// ============================================

function CategoriesTab() {
  const qc = useQueryClient();
  const { data: categories, isLoading } = useCategories();
  const createCategory = useCreateCategory();
  const [newName, setNewName] = useState('');

  const deleteCategory = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/categories/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Categoría eliminada');
    },
    onError: (err) => toast.error(getApiError(err)),
  });

  return (
    <div>
      {/* Add new */}
      <div className="flex gap-2 mb-4">
        <input
          className="input flex-1"
          placeholder="Nueva categoría..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newName) {
              createCategory.mutate({ name: newName });
              setNewName('');
            }
          }}
        />
        <button
          onClick={() => { if (newName) { createCategory.mutate({ name: newName }); setNewName(''); } }}
          disabled={!newName || createCategory.isPending}
          className="btn-primary"
        >
          <Plus size={16} />
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : (
        <div className="space-y-2">
          {categories?.map((c: Category) => (
            <div key={c.id} className="card p-3 flex items-center gap-3">
              <div className="flex-1 text-sm font-medium text-gray-900">{c.name}</div>
              <button
                onClick={() => { if (confirm(`¿Eliminar categoría "${c.name}"?`)) deleteCategory.mutate(c.id); }}
                className="text-xs text-red-400 hover:text-red-600"
              >
                Eliminar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// Password Tab
// ============================================

function PasswordTab() {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.newPassword !== form.confirm) {
      toast.error('Las contraseñas no coinciden');
      return;
    }
    setLoading(true);
    try {
      await api.post('/users/change-password', {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      toast.success('Contraseña actualizada. Vuelve a iniciar sesión.');
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err) {
      toast.error(getApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-xs">
      <div>
        <label className="label">Contraseña actual</label>
        <input type="password" className="input" value={form.currentPassword}
          onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} required />
      </div>
      <div>
        <label className="label">Nueva contraseña</label>
        <input type="password" className="input" value={form.newPassword} minLength={6}
          onChange={(e) => setForm({ ...form, newPassword: e.target.value })} required />
      </div>
      <div>
        <label className="label">Confirmar contraseña</label>
        <input type="password" className="input" value={form.confirm}
          onChange={(e) => setForm({ ...form, confirm: e.target.value })} required />
      </div>
      <button type="submit" disabled={loading} className="btn-primary">
        {loading ? <Spinner size="sm" /> : 'Cambiar contraseña'}
      </button>
    </form>
  );
}
