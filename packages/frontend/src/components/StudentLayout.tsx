import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Home, QrCode, Clock, BarChart3, User, RefreshCw } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.js';
import { useState } from 'react';

export function StudentLayout() {
  const { profile, refreshProfile } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const navigate = useNavigate();

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshProfile();
    } finally {
      setTimeout(() => setRefreshing(false), 400);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      {/* Top Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white font-bold shadow-sm">
              FP
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-slate-900 leading-none">
                FingerPay
              </h1>
              <span className="text-xs text-slate-500">Student Wallet</span>
            </div>
          </div>

          {/* On-chain balance pill */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              title="Refresh on-chain balance"
              aria-label="Refresh balance"
              className="flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
            >
              <span>{profile?.balance ?? '0'} CPC</span>
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => navigate('/profile')}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200"
              aria-label="Student Profile"
            >
              <User className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pt-4 pb-24">
        <Outlet />
      </main>

      {/* Bottom Mobile-first Navigation Bar */}
      <nav
        aria-label="Student Navigation"
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-md"
      >
        <div className="mx-auto flex max-w-lg items-center justify-around px-2 py-2">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 py-1 px-3 text-xs font-medium transition ${
                isActive ? 'text-blue-600 font-semibold' : 'text-slate-500 hover:text-slate-900'
              }`
            }
          >
            <Home className="h-5 w-5" />
            <span>Home</span>
          </NavLink>

          <NavLink
            to="/history"
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 py-1 px-3 text-xs font-medium transition ${
                isActive ? 'text-blue-600 font-semibold' : 'text-slate-500 hover:text-slate-900'
              }`
            }
          >
            <Clock className="h-5 w-5" />
            <span>History</span>
          </NavLink>

          {/* Prominent centered Scan action */}
          <NavLink
            to="/scan"
            className="flex -mt-5 flex-col items-center justify-center rounded-full bg-blue-600 p-3 text-white shadow-lg shadow-blue-500/30 transition hover:bg-blue-700 active:scale-95"
            aria-label="Scan QR Code"
          >
            <QrCode className="h-6 w-6" />
          </NavLink>

          <NavLink
            to="/analytics"
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 py-1 px-3 text-xs font-medium transition ${
                isActive ? 'text-blue-600 font-semibold' : 'text-slate-500 hover:text-slate-900'
              }`
            }
          >
            <BarChart3 className="h-5 w-5" />
            <span>Analytics</span>
          </NavLink>

          <NavLink
            to="/profile"
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 py-1 px-3 text-xs font-medium transition ${
                isActive ? 'text-blue-600 font-semibold' : 'text-slate-500 hover:text-slate-900'
              }`
            }
          >
            <User className="h-5 w-5" />
            <span>Profile</span>
          </NavLink>
        </div>
      </nav>
    </div>
  );
}
