import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.js';
import { api, type TransactionRecord } from '../api.js';
import { QrCode, ArrowUpRight, BarChart3, ShieldCheck, Wallet } from 'lucide-react';

export function Dashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['transactions', 'recent'],
    queryFn: () => api.getHistory(5),
  });

  const recentTransactions = historyData?.transactions ?? [];

  return (
    <div className="space-y-4">
      {/* Balance Card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 p-6 text-white shadow-lg">
        <div className="flex items-center justify-between text-blue-100 text-xs font-medium">
          <div className="flex items-center gap-1.5">
            <Wallet className="h-4 w-4" />
            <span>CampusCoin (CPC) Balance</span>
          </div>
          <span className="rounded-full bg-blue-500/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
            On-Chain
          </span>
        </div>

        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-4xl font-extrabold tracking-tight">{profile?.balance ?? '0'}</span>
          <span className="text-lg font-semibold text-blue-200">CPC</span>
        </div>

        <div className="mt-4 flex items-center justify-between pt-3 border-t border-blue-500/30 text-xs text-blue-200">
          <div>
            <span className="text-blue-300">Student PRN:</span> {profile?.prn}
          </div>
          <div className="font-mono text-[11px] text-blue-200">
            {profile?.walletAddress
              ? `${profile.walletAddress.slice(0, 6)}...${profile.walletAddress.slice(-4)}`
              : ''}
          </div>
        </div>
      </div>

      {/* Quick Action Grid */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => navigate('/scan')}
          className="flex items-center gap-3 rounded-2xl bg-white p-4 text-left shadow-sm border border-slate-200 transition hover:border-blue-300 hover:shadow-md"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <QrCode className="h-6 w-6" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-800">Scan & Pay</div>
            <div className="text-xs text-slate-500">Scan merchant QR</div>
          </div>
        </button>

        <button
          onClick={() => navigate('/analytics')}
          className="flex items-center gap-3 rounded-2xl bg-white p-4 text-left shadow-sm border border-slate-200 transition hover:border-blue-300 hover:shadow-md"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <BarChart3 className="h-6 w-6" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-800">Analytics</div>
            <div className="text-xs text-slate-500">Spending breakdown</div>
          </div>
        </button>
      </div>

      {/* Spending Limits Info Banner */}
      <div className="flex items-center justify-between rounded-xl bg-slate-100 p-3 text-xs text-slate-600 border border-slate-200">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>Security Limits: Max 200 CPC/txn • Max 500 CPC/day</span>
        </div>
      </div>

      {/* Recent Transactions Section */}
      <div className="rounded-2xl bg-white p-4 shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-slate-900">Recent Transactions</h2>
          <button
            onClick={() => navigate('/history')}
            className="text-xs font-semibold text-blue-600 hover:text-blue-700"
          >
            View all
          </button>
        </div>

        {historyLoading ? (
          <div className="py-6 text-center text-xs text-slate-400">Loading transactions...</div>
        ) : recentTransactions.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400">
            No transactions yet. Scan a merchant QR to pay!
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recentTransactions.map((tx: TransactionRecord) => (
              <div key={tx.id} className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                    <ArrowUpRight className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-800">
                      {tx.merchantName || 'Campus Merchant'}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {tx.category ? tx.category.toUpperCase() : 'PAYMENT'}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs font-bold text-slate-900">-{tx.amount} CPC</div>
                  <div className="text-[10px] font-medium text-emerald-600 capitalize">
                    {tx.status}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Closed-loop Disclaimer */}
      <div className="rounded-xl border border-slate-200 bg-white/60 p-3 text-center text-[11px] text-slate-500">
        CampusCoin (CPC) is a closed-loop demo token with zero monetary guarantee. Not redeemable
        for cash outside the campus accounts office.
      </div>
    </div>
  );
}
