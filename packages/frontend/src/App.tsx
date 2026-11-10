import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext.js';
import { ProtectedRoute, PublicOnlyRoute } from './components/ProtectedRoute.js';
import { StudentLayout } from './components/StudentLayout.js';

// Pages
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

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
