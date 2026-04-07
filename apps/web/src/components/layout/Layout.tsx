import { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingCart,
  FileText,
  Package,
  Users,
  BarChart3,
  DollarSign,
  Settings,
  LogOut,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useOffline } from '@/hooks/useOffline';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

interface LayoutProps {
  children: ReactNode;
}

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Panel', adminOnly: true },
  { to: '/pos', icon: ShoppingCart, label: 'Ventas' },
  { to: '/sales-history', icon: FileText, label: 'Historial' },
  { to: '/inventory', icon: Package, label: 'Inventario' },
  { to: '/customers', icon: Users, label: 'Clientes' },
  { to: '/cash', icon: DollarSign, label: 'Caja' },
  { to: '/reports', icon: BarChart3, label: 'Reportes', adminOnly: true },
  { to: '/settings', icon: Settings, label: 'Ajustes', adminOnly: true },
];

export function Layout({ children }: LayoutProps) {
  const { user, refreshToken, logout } = useAuthStore();
  const { isOnline } = useOffline();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      if (isOnline && refreshToken) {
        await api.post('/auth/logout', { refreshToken });
      }
    } finally {
      logout();
      navigate('/login');
    }
  };

  const visibleNav = navItems.filter((item) => !item.adminOnly || user?.role === 'admin');

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar — desktop */}
      <aside className="hidden md:flex flex-col w-56 bg-white border-r border-gray-200">
        {/* Logo */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <ShoppingCart size={16} className="text-white" />
            </div>
            <div>
              <div className="text-sm font-bold text-gray-900">FerretPOS</div>
              <div className="text-xs text-gray-500 truncate max-w-[120px]">{user?.storeName}</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2 space-y-0.5">
          {visibleNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                )
              }
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* User + status */}
        <div className="p-3 border-t border-gray-100 space-y-2">
          {/* Connectivity indicator */}
          <div className={cn(
            'flex items-center gap-2 px-2 py-1 rounded-lg text-xs',
            isOnline ? 'text-green-600 bg-green-50' : 'text-orange-600 bg-orange-50',
          )}>
            {isOnline ? <Wifi size={12} /> : <WifiOff size={12} />}
            {isOnline ? 'En línea' : 'Sin conexión'}
          </div>

          <div className="flex items-center gap-2 px-2">
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-gray-900 truncate">{user?.name}</div>
              <div className="text-xs text-gray-500">
                {user?.role === 'admin' ? 'Admin' : 'Cajero'}
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
              title="Cerrar sesión"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <main className="flex-1 overflow-auto">{children}</main>

        {/* Bottom nav — mobile */}
        <nav className="md:hidden bg-white border-t border-gray-200 safe-bottom">
          <div className="flex">
            {visibleNav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex-1 flex flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors',
                    isActive ? 'text-blue-600' : 'text-gray-500',
                  )
                }
              >
                <item.icon size={20} />
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
