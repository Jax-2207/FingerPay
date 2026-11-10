import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api, type TransactionRecord } from '../../api.js';
import { Store, Terminal, CreditCard, Wallet, ArrowUpRight, AlertCircle } from 'lucide-react';

export function MerchantDashboard() {
  const navigate = useNavigate();

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['merchant', 'profile'],
    queryFn: () => api.getMerchantProfile(),
  });

  const { data: txData, isLoading: txLoading } = useQuery({
    queryKey: ['merchant', 'transactions', 'recent'],
    queryFn: () => api.getHistory(5),
  });

  const recentTransactions = txData?.transactions ?? [];

  return (
    <div className="space-y-6">
      {/* Deactivated Warning */}
      {profile && !profile.active && (
        <div className="flex items-center gap-3 rounded-2xl bg-red-50 p-4 border border-red-200 text-red-800 text-sm">
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
          <div>
            <div className="font-bold">Merchant Account Deactivated</div>
            <div className="text-xs text-red-600">
              Your merchant terminal cannot create payment intents while deactivated by Campus
              Accounts.
            </div>
          </div>
        </div>
      )}

      {/* Top Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-white p-5 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400 uppercase tracking-wider">
            <span>On-Chain CPC Balance</span>
            <Wallet className="h-4 w-4 text-indigo-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">
              {profileLoading ? '...' : (profile?.balance ?? '0')}
            </span>
            <span className="text-sm font-semibold text-indigo-600">CPC</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">Available for campus settlement</p>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400 uppercase tracking-wider">
            <span>Merchant Shop</span>
            <Store className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-xl font-bold text-slate-900 truncate">
            {profile?.shopName || 'Registered Shop'}
          </div>
          <p className="mt-1 text-xs text-slate-400 capitalize">
            Category: {profile?.category || 'General'}
          </p>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400 uppercase tracking-wider">
            <span>Settlement Status</span>
            <CreditCard className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-2 text-xl font-bold text-slate-900">
            {profile?.active ? 'Eligible' : 'Suspended'}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Settlement in INR processed by Campus Accounts
          </p>
        </div>
      </div>

      {/* Quick Launch Banner */}
      <div className="flex flex-col sm:flex-row items-center justify-between rounded-2xl bg-gradient-to-r from-indigo-900 to-indigo-700 p-6 text-white shadow-md gap-4">
        <div>
          <h2 className="text-lg font-bold">Open POS Payment Terminal</h2>
          <p className="text-xs text-indigo-200 mt-1">
            Accept instant passkey payments by generating a dynamic payment QR.
          </p>
        </div>
        <button
          onClick={() => navigate('/merchant/terminal')}
          disabled={profile && !profile.active}
          className="flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-xs font-bold text-indigo-900 shadow-sm transition hover:bg-indigo-50 active:scale-95 disabled:opacity-50"
        >
          <Terminal className="h-4 w-4" />
          <span>Launch Terminal</span>
        </button>
      </div>

      {/* Recent Received Payments */}
      <div className="rounded-2xl bg-white p-5 shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-900">Recent Customer Payments</h3>
          <button
            onClick={() => navigate('/merchant/transactions')}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
          >
            View all
          </button>
        </div>

        {txLoading ? (
          <div className="py-8 text-center text-xs text-slate-400">Loading transactions...</div>
        ) : recentTransactions.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            No payments received yet. Open the terminal to accept your first payment.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recentTransactions.map((tx: TransactionRecord) => (
              <div key={tx.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                    <ArrowUpRight className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-800">
                      Payment ID: {tx.id.slice(0, 10)}...
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {tx.category ? tx.category.toUpperCase() : 'GENERAL'}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-sm font-bold text-emerald-600">+{tx.amount} CPC</div>
                  <div className="text-[10px] font-medium text-slate-400 capitalize">
                    {tx.status}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
