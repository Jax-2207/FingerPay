import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Store, Terminal, History, CreditCard, LogOut, CheckCircle2, XCircle } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.js';
import { api } from '../api.js';

export function MerchantLayout() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const { data: profile } = useQuery({
    queryKey: ['merchant', 'profile'],
    queryFn: () => api.getMerchantProfile(),
  });

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      {/* Top Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white font-bold shadow-sm">
              <Store className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-slate-900 leading-none">
                  {profile?.shopName || 'Merchant Portal'}
                </h1>
                {profile && (
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      profile.active
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-red-50 text-red-700 border border-red-200'
                    }`}
                  >
                    {profile.active ? (
                      <>
                        <CheckCircle2 className="h-3 w-3" /> Active
                      </>
                    ) : (
                      <>
                        <XCircle className="h-3 w-3" /> Deactivated
                      </>
                    )}
                  </span>
                )}
              </div>
              <span className="text-xs text-slate-500 capitalize">
                {profile?.category || 'Campus Merchant'} • {profile?.balance ?? '0'} CPC
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => logout().then(() => navigate('/login'))}
              className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="mx-auto flex max-w-5xl overflow-x-auto border-t border-slate-100 px-4 text-xs font-medium">
          <NavLink
            to="/merchant"
            end
            className={({ isActive }) =>
              `flex items-center gap-1.5 border-b-2 py-2.5 px-3 transition ${
                isActive
                  ? 'border-indigo-600 text-indigo-600 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`
            }
          >
            <Store className="h-4 w-4" />
            <span>Overview</span>
          </NavLink>

          <NavLink
            to="/merchant/terminal"
            className={({ isActive }) =>
              `flex items-center gap-1.5 border-b-2 py-2.5 px-3 transition ${
                isActive
                  ? 'border-indigo-600 text-indigo-600 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`
            }
          >
            <Terminal className="h-4 w-4" />
            <span>Terminal (POS)</span>
          </NavLink>

          <NavLink
            to="/merchant/transactions"
            className={({ isActive }) =>
              `flex items-center gap-1.5 border-b-2 py-2.5 px-3 transition ${
                isActive
                  ? 'border-indigo-600 text-indigo-600 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`
            }
          >
            <History className="h-4 w-4" />
            <span>Transactions</span>
          </NavLink>

          <NavLink
            to="/merchant/settlements"
            className={({ isActive }) =>
              `flex items-center gap-1.5 border-b-2 py-2.5 px-3 transition ${
                isActive
                  ? 'border-indigo-600 text-indigo-600 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`
            }
          >
            <CreditCard className="h-4 w-4" />
            <span>Settlements</span>
          </NavLink>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
