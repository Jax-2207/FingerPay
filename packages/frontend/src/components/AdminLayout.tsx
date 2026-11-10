import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ShieldAlert,
  Users,
  Store,
  Coins,
  RotateCcw,
  CreditCard,
  FileText,
  Activity,
  LogOut,
  UploadCloud,
  LayoutDashboard,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext.js';
import { api } from '../api.js';

export function AdminLayout() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const { data: chainInfo } = useQuery({
    queryKey: ['admin', 'chain'],
    queryFn: () => api.getAdminChain(),
    refetchInterval: 15000,
  });

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      {/* Emergency Pause Banner if paused */}
      {chainInfo?.paused && (
        <div className="bg-red-600 px-4 py-2.5 text-center text-xs font-bold text-white shadow-md flex items-center justify-center gap-2">
          <ShieldAlert className="h-4 w-4 animate-pulse" />
          <span>EMERGENCY PAUSE ACTIVE: Smart contract operations are temporarily halted.</span>
        </div>
      )}

      {/* Top Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white font-bold shadow-sm">
              CA
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-slate-900 leading-none">
                  Campus Accounts Console
                </h1>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                  Admin
                </span>
              </div>
              <span className="text-xs text-slate-500">FingerPay Closed-Loop Operations</span>
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

        {/* Admin Navigation Tabs */}
        <div className="mx-auto flex max-w-6xl overflow-x-auto border-t border-slate-100 px-4 text-xs font-medium">
          <NavLink
            to="/admin"
            end
            className={({ isActive }) =>
              `flex items-center gap-1.5 border-b-2 py-2.5 px-3 whitespace-nowrap transition ${
                isActive
                  ? 'border-slate-900 text-slate-900 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`
            }
          >
            <LayoutDashboard className="h-4 w-4" />
            <span>Overview</span>
          </NavLink>

          <NavLink
            to="/admin/users"
            className={({ isActive }) =>
              `flex items-center gap-1.5 border-b-2 py-2.5 px-3 whitespace-nowrap transition ${
                isActive
                  ? 'border-slate-900 text-slate-900 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`
            }
          >
            <Users className="h-4 w-4" />
            <span>Students</span>
          </NavLink>

          <NavLink
            to="/admin/prn"
            className={({ isActive }) =>
              `flex items-center gap-1.5 border-b-2 py-2.5 px-3 whitespace-nowrap transition ${
                isActive
                  ? 'border-slate-900 text-slate-900 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`
            }
          >
            <UploadCloud className="h-4 w-4" />
            <span>PRN Import</span>
          </NavLink>

          <NavLink
            to="/admin/merchants"
            className={({ isActive }) =>
              `flex items-center gap-1.5 border-b-2 py-2.5 px-3 whitespace-nowrap transition ${
                isActive
                  ? 'border-slate-900 text-slate-900 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`
            }
          >
            <Store className="h-4 w-4" />
            <span>Merchants</span>
          </NavLink>

          <NavLink
            to="/admin/mint"
            className={({ isActive }) =>
              `flex items-center gap-1.5 border-b-2 py-2.5 px-3 whitespace-nowrap transition ${
                isActive
                  ? 'border-slate-900 text-slate-900 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`
            }
          >
            <Coins className="h-4 w-4 text-amber-600" />
            <span>Mint CPC</span>
          </NavLink>

          <NavLink
            to="/admin/settlements"
            className={({ isActive }) =>
              `flex items-center gap-1.5 border-b-2 py-2.5 px-3 whitespace-nowrap transition ${
                isActive
                  ? 'border-slate-900 text-slate-900 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`
            }
          >
            <CreditCard className="h-4 w-4" />
            <span>Settlements</span>
          </NavLink>

          <NavLink
            to="/admin/refunds"
            className={({ isActive }) =>
              `flex items-center gap-1.5 border-b-2 py-2.5 px-3 whitespace-nowrap transition ${
                isActive
                  ? 'border-slate-900 text-slate-900 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`
            }
          >
            <RotateCcw className="h-4 w-4" />
            <span>Refunds</span>
          </NavLink>

          <NavLink
            to="/admin/chain"
            className={({ isActive }) =>
              `flex items-center gap-1.5 border-b-2 py-2.5 px-3 whitespace-nowrap transition ${
                isActive
                  ? 'border-slate-900 text-slate-900 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`
            }
          >
            <Activity className="h-4 w-4" />
            <span>Chain & Controls</span>
          </NavLink>

          <NavLink
            to="/admin/logs"
            className={({ isActive }) =>
              `flex items-center gap-1.5 border-b-2 py-2.5 px-3 whitespace-nowrap transition ${
                isActive
                  ? 'border-slate-900 text-slate-900 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`
            }
          >
            <FileText className="h-4 w-4" />
            <span>Audit Logs</span>
          </NavLink>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
