import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext.js';
import {
  ProtectedRoute,
  PublicOnlyRoute,
  MerchantRoute,
  AdminRoute,
} from './components/ProtectedRoute.js';
import { StudentLayout } from './components/StudentLayout.js';
import { MerchantLayout } from './components/MerchantLayout.js';
import { AdminLayout } from './components/AdminLayout.js';

// Student Pages
import { Login } from './pages/Login.js';
import { Signup } from './pages/Signup.js';
import { Pending } from './pages/Pending.js';
import { Onboarding } from './pages/Onboarding.js';
import { Dashboard } from './pages/Dashboard.js';
import { Scan } from './pages/Scan.js';
import { Pay } from './pages/Pay.js';
import { History } from './pages/History.js';
import { Analytics } from './pages/Analytics.js';
import { Profile } from './pages/Profile.js';

// Merchant Pages
import { MerchantDashboard } from './pages/merchant/MerchantDashboard.js';
import { MerchantTerminal } from './pages/merchant/MerchantTerminal.js';
import { MerchantTransactions } from './pages/merchant/MerchantTransactions.js';
import { MerchantSettlements } from './pages/merchant/MerchantSettlements.js';

// Admin Pages
import { AdminOverview } from './pages/admin/AdminOverview.js';
import { AdminUsers } from './pages/admin/AdminUsers.js';
import { AdminPrnImport } from './pages/admin/AdminPrnImport.js';
import { AdminMerchants } from './pages/admin/AdminMerchants.js';
import { AdminMint } from './pages/admin/AdminMint.js';
import { AdminRefunds } from './pages/admin/AdminRefunds.js';
import { AdminSettlements } from './pages/admin/AdminSettlements.js';
import { AdminChain } from './pages/admin/AdminChain.js';
import { AdminLogs } from './pages/admin/AdminLogs.js';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public auth routes (redirect to home if authenticated & onboarded) */}
            <Route element={<PublicOnlyRoute />}>
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
            </Route>

            {/* Waiting / Onboarding routes */}
            <Route path="/pending" element={<Pending />} />
            <Route path="/onboarding" element={<Onboarding />} />

            {/* Protected Student Layout & routes */}
            <Route element={<ProtectedRoute />}>
              <Route element={<StudentLayout />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/scan" element={<Scan />} />
                <Route path="/pay/:intentId" element={<Pay />} />
                <Route path="/history" element={<History />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/profile" element={<Profile />} />
              </Route>
            </Route>

            {/* Protected Merchant Layout & routes */}
            <Route element={<MerchantRoute />}>
              <Route element={<MerchantLayout />}>
                <Route path="/merchant" element={<MerchantDashboard />} />
                <Route path="/merchant/terminal" element={<MerchantTerminal />} />
                <Route path="/merchant/transactions" element={<MerchantTransactions />} />
                <Route path="/merchant/settlements" element={<MerchantSettlements />} />
              </Route>
            </Route>

            {/* Protected Admin Layout & routes */}
            <Route element={<AdminRoute />}>
              <Route element={<AdminLayout />}>
                <Route path="/admin" element={<AdminOverview />} />
                <Route path="/admin/users" element={<AdminUsers />} />
                <Route path="/admin/prn" element={<AdminPrnImport />} />
                <Route path="/admin/merchants" element={<AdminMerchants />} />
                <Route path="/admin/mint" element={<AdminMint />} />
                <Route path="/admin/refunds" element={<AdminRefunds />} />
                <Route path="/admin/settlements" element={<AdminSettlements />} />
                <Route path="/admin/chain" element={<AdminChain />} />
                <Route path="/admin/logs" element={<AdminLogs />} />
              </Route>
            </Route>

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
