import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.js';
import { Clock, RefreshCw, LogOut } from 'lucide-react';

export function Pending() {
  const { user, profile, role, loading, refreshProfile, logout } = useAuth();
  const [checking, setChecking] = useState(false);
  const navigate = useNavigate();

  // If the user is an admin or merchant, redirect them immediately to their portal
  useEffect(() => {
    if (role === 'admin') {
      navigate('/admin', { replace: true });
    } else if (role === 'merchant') {
      navigate('/merchant', { replace: true });
    } else if (!user && !loading) {
      navigate('/login', { replace: true });
    }
  }, [user, role, loading, navigate]);

  const handleCheck = async () => {
    setChecking(true);
    try {
      await refreshProfile();
      if (role === 'admin') {
        navigate('/admin', { replace: true });
      } else if (role === 'merchant') {
        navigate('/merchant', { replace: true });
      } else if (profile?.status === 'approved') {
        if (!profile.passkeyRegistered || !profile.pinSet) {
          navigate('/onboarding', { replace: true });
        } else {
          navigate('/', { replace: true });
        }
      }
    } finally {
      setTimeout(() => setChecking(false), 500);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm border border-slate-200">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 text-amber-600 border border-amber-200">
          <Clock className="h-8 w-8" />
        </div>

        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Approval Pending</h2>
        <p className="mt-2 text-sm text-slate-600">
          Your PRN registration has been received and is waiting for authorization from Campus
          Accounts.
        </p>

        <div className="my-6 rounded-xl bg-slate-50 p-4 text-left border border-slate-200">
          <div className="text-xs text-slate-500 font-medium">REGISTERED PRN</div>
          <div className="text-base font-bold text-slate-800">{profile?.prn || 'Pending'}</div>
          <div className="mt-2 text-xs text-slate-500 font-medium">ACCOUNT STATUS</div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 mt-1">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-600"></span>
            Pending Admin Review
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={handleCheck}
            disabled={checking}
            className="flex items-center justify-center gap-2 w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 active:scale-[0.99] disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
            {checking ? 'Checking Status...' : 'Check Status'}
          </button>

          <button
            onClick={handleLogout}
            className="flex items-center justify-center gap-2 w-full rounded-xl border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>

        <p className="mt-6 text-xs text-slate-400">
          Once approved, you will be prompted to set up your device biometric passkey and PIN.
        </p>
      </div>
    </div>
  );
}
