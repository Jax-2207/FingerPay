import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.js';

export function ProtectedRoute() {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!profile || profile.status === 'pending') {
    return <Navigate to="/pending" replace />;
  }

  if (profile.status === 'rejected') {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="max-w-md rounded-2xl bg-white p-6 text-center shadow-lg">
          <h2 className="text-xl font-bold text-red-600">Registration Rejected</h2>
          <p className="mt-2 text-slate-600">
            Your PRN registration was rejected by Campus Accounts. Please contact the campus
            accounts office.
          </p>
        </div>
      </div>
    );
  }

  if (!profile.passkeyRegistered || !profile.pinSet) {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}

export function PublicOnlyRoute() {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  if (user) {
    if (!profile || profile.status === 'pending') {
      return <Navigate to="/pending" replace />;
    }
    if (!profile.passkeyRegistered || !profile.pinSet) {
      return <Navigate to="/onboarding" replace />;
    }
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
