import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api, type AdminStats } from '../../api.js';
import {
  Users,
  Store,
  CreditCard,
  Coins,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';

export function AdminOverview() {
  const navigate = useNavigate();

  const { data: stats, isLoading } = useQuery<AdminStats>({
    queryKey: ['admin', 'stats'],
    queryFn: () => api.getAdminStats(),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight">Operations Console</h2>
          <p className="text-xs text-slate-500">
            Real-time status of CampusCoin tokenomics and system activity
          </p>
        </div>

        {stats && (
          <div
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
              stats.paused
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            }`}
          >
            {stats.paused ? (
              <>
                <ShieldAlert className="h-4 w-4" /> System Paused
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4" /> System Operational
              </>
            )}
          </div>
        )}
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-white p-5 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400 uppercase">
            <span>Enrolled Students</span>
            <Users className="h-4 w-4 text-blue-600" />
          </div>
          <div className="mt-2 text-2xl font-black text-slate-900">
            {isLoading ? '...' : stats?.totalUsers}
          </div>
          {stats && stats.pendingUsers > 0 && (
            <p className="mt-1 text-xs font-bold text-amber-600">
              {stats.pendingUsers} pending approval
            </p>
          )}
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400 uppercase">
            <span>Campus Merchants</span>
            <Store className="h-4 w-4 text-indigo-600" />
          </div>
          <div className="mt-2 text-2xl font-black text-slate-900">
            {isLoading ? '...' : stats?.activeMerchants}
          </div>
          <p className="mt-1 text-xs text-slate-400">{stats?.totalMerchants} registered total</p>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400 uppercase">
            <span>Total Turnover</span>
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-slate-900">
              {isLoading ? '...' : stats?.totalSpentCpc}
            </span>
            <span className="text-xs font-bold text-emerald-600">CPC</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">{stats?.totalTransactions} transactions</p>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400 uppercase">
            <span>Settlement Queue</span>
            <CreditCard className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-2 text-2xl font-black text-slate-900">
            {isLoading ? '...' : stats?.pendingSettlements}
          </div>
          <p className="mt-1 text-xs text-slate-400">{stats?.totalSettlements} total requests</p>
        </div>
      </div>

      {/* Admin Quick Action Shortcuts */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <button
          onClick={() => navigate('/admin/mint')}
          className="flex items-center justify-between rounded-2xl bg-white p-5 text-left shadow-sm border border-slate-200 hover:border-amber-300 hover:shadow-md transition"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <Coins className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900">Mint CPC</div>
              <div className="text-xs text-slate-400">Credit student balance</div>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-slate-400" />
        </button>

        <button
          onClick={() => navigate('/admin/settlements')}
          className="flex items-center justify-between rounded-2xl bg-white p-5 text-left shadow-sm border border-slate-200 hover:border-indigo-300 hover:shadow-md transition"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900">Review Settlements</div>
              <div className="text-xs text-slate-400">Burn CPC & mark paid</div>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-slate-400" />
        </button>

        <button
          onClick={() => navigate('/admin/chain')}
          className="flex items-center justify-between rounded-2xl bg-white p-5 text-left shadow-sm border border-slate-200 hover:border-red-300 hover:shadow-md transition"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900">Circuit Breaker</div>
              <div className="text-xs text-slate-400">Pause / unpause contract</div>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-slate-400" />
        </button>
      </div>
    </div>
  );
}
