import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from '@/store/auth';
import { Layout } from '@/components/layout/Layout';
import { LoginPage } from '@/pages/Login';
import { RegisterPage } from '@/pages/Register';
import { POSPage } from '@/pages/POS';
import { InventoryPage } from '@/pages/Inventory';
import { CashRegisterPage } from '@/pages/CashRegister';
import { ReportsPage } from '@/pages/Reports';
import { SettingsPage } from '@/pages/Settings';
import { DashboardPage } from '@/pages/Dashboard';
import { CustomersPage } from '@/pages/Customers';
import { SalesHistoryPage } from '@/pages/SalesHistory';
import { syncWithServer } from '@/lib/sync';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppContent() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin';
  const homePath = isAdmin ? '/dashboard' : '/pos';

  // Sync on app load if authenticated
  useEffect(() => {
    if (isAuthenticated && navigator.onLine) {
      syncWithServer();
    }
  }, [isAuthenticated]);

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Protected routes */}
      <Route
        path="/*"
        element={
          <PrivateRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<Navigate to={homePath} replace />} />
                <Route path="/dashboard" element={isAdmin ? <DashboardPage /> : <Navigate to="/pos" replace />} />
                <Route path="/pos" element={<POSPage />} />
                <Route path="/sales-history" element={<SalesHistoryPage />} />
                <Route path="/inventory" element={<InventoryPage />} />
                <Route path="/customers" element={<CustomersPage />} />
                <Route path="/cash" element={<CashRegisterPage />} />
                <Route path="/reports" element={isAdmin ? <ReportsPage /> : <Navigate to="/pos" replace />} />
                <Route path="/settings" element={isAdmin ? <SettingsPage /> : <Navigate to="/pos" replace />} />
              </Routes>
            </Layout>
          </PrivateRoute>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
