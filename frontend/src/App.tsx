import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminRoute } from './components/AdminRoute';
import { CollectorRoute } from './components/CollectorRoute';
import { AdminLayout } from './layouts/AdminLayout';
import { CollectorLayout } from './layouts/CollectorLayout';
import { Login } from './pages/Login';
import { Unauthorized } from './pages/Unauthorized';
import { Dashboard as AdminDashboard } from './pages/admin/Dashboard';
import { Collectors } from './pages/admin/Collectors';
import { Donations as AdminDonations } from './pages/admin/Donations';
import { Reports } from './pages/admin/Reports';
import { Dashboard as CollectorDashboard } from './pages/collector/Dashboard';
import { Donation } from './pages/collector/Donation';
import { MyDonations } from './pages/collector/MyDonations';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/unauthorized" element={<Unauthorized />} />

          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <AdminRoute>
                  <AdminLayout />
                </AdminRoute>
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminDashboard />} />
            <Route path="collectors" element={<Collectors />} />
            <Route path="donations" element={<AdminDonations />} />
            <Route path="reports" element={<Reports />} />
          </Route>

          <Route
            path="/"
            element={
              <ProtectedRoute>
                <CollectorRoute>
                  <CollectorLayout />
                </CollectorRoute>
              </ProtectedRoute>
            }
          >
            <Route index element={<CollectorDashboard />} />
            <Route path="donation" element={<Donation />} />
            <Route path="my-donations" element={<MyDonations />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
