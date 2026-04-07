import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingCart } from 'lucide-react';
import { api, getApiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { initialSync } from '@/lib/sync';
import toast from 'react-hot-toast';

export function RegisterPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    storeName: '',
    adminName: '',
    email: '',
    password: '',
    confirm: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirm) {
      toast.error('Las contraseÃ±as no coinciden');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/auth/register', {
        storeName: form.storeName,
        adminName: form.adminName,
        email: form.email,
        password: form.password,
      });
      const { user, accessToken, refreshToken } = res.data.data;
      setAuth(user, accessToken, refreshToken);
      await initialSync();
      toast.success(`Â¡Bienvenido! Tu cuenta de ${form.storeName} fue creada.`);
      navigate('/dashboard');
    } catch (err) {
      toast.error(getApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value }),
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl shadow-lg mb-3">
            <ShoppingCart size={24} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Crear cuenta gratuita</h1>
          <p className="text-gray-500 text-sm mt-1">14 dÃ­as de prueba sin tarjeta</p>
        </div>

        <div className="card p-6">
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="label">Nombre de la ferreterÃ­a</label>
              <input className="input" placeholder="Ej: FerreterÃ­a El Clavo" {...field('storeName')} required />
            </div>
            <div>
              <label className="label">Tu nombre</label>
              <input className="input" placeholder="Juan GarcÃ­a" {...field('adminName')} required />
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" placeholder="juan@ferreteria.com" {...field('email')} required />
            </div>
            <div>
              <label className="label">ContraseÃ±a</label>
              <input type="password" className="input" placeholder="MÃ­nimo 6 caracteres" {...field('password')} minLength={6} required />
            </div>
            <div>
              <label className="label">Confirmar contraseÃ±a</label>
              <input type="password" className="input" {...field('confirm')} minLength={6} required />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 mt-2">
              {loading ? 'Creando cuenta...' : 'Empezar gratis'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-500 mt-4">
          Â¿Ya tienes cuenta?{' '}
          <a href="/login" className="text-blue-600 hover:underline">Iniciar sesiÃ³n</a>
        </p>
      </div>
    </div>
  );
}

