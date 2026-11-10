import { useQuery } from '@tanstack/react-query';
import { api, type TransactionRecord } from '../../api.js';
import { ArrowUpRight, ExternalLink, Clock } from 'lucide-react';

export function MerchantTransactions() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['merchant', 'transactions', 'full'],
    queryFn: () => api.getHistory(50),
  });

  const explorerBaseUrl = import.meta.env.VITE_EXPLORER_URL;
  const transactions = data?.transactions ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Merchant Transactions</h2>
        <p className="text-xs text-slate-500">Record of customer payments received at your shop</p>
      </div>

      {isLoading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent"></div>
        </div>
      ) : error ? (
        <div className="rounded-2xl bg-white p-6 text-center text-xs text-red-500 shadow-sm border border-slate-200">
          Failed to load transactions. Please try again.
        </div>
      ) : transactions.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm border border-slate-200">
          <Clock className="mx-auto h-10 w-10 text-slate-300 mb-2" />
          <h3 className="text-sm font-semibold text-slate-800">No payment transactions</h3>
          <p className="mt-1 text-xs text-slate-400">
            Open the POS terminal to accept your first customer payment.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white shadow-sm border border-slate-200 overflow-hidden">
          <div className="divide-y divide-slate-100">
            {transactions.map((tx: TransactionRecord) => (
              <div
                key={tx.id}
                className="p-4 flex items-center justify-between hover:bg-slate-50 transition"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                    <ArrowUpRight className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900 font-mono">
                      ID: {tx.id.slice(0, 12)}...
                    </div>
                    <div className="text-[11px] text-slate-400 capitalize">
                      Category: {tx.category || 'General'}
                    </div>
                  </div>
                </div>

                <div className="text-right space-y-1">
                  <div className="text-sm font-black text-emerald-600">+{tx.amount} CPC</div>
                  <div className="flex items-center justify-end gap-2">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${
                        tx.status === 'confirmed'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : tx.status === 'failed'
                            ? 'bg-red-50 text-red-700 border border-red-200'
                            : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {tx.status}
                    </span>

                    {tx.txHash && explorerBaseUrl && (
                      <a
                        href={`${explorerBaseUrl}/tx/${tx.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-indigo-600 hover:text-indigo-800"
                        title="View on Explorer"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
