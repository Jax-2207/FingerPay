import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type TransactionRecord } from '../api.js';
import { ArrowUpRight, ArrowDownLeft, ExternalLink, Clock } from 'lucide-react';

export function History() {
  const [filter, setFilter] = useState<'all' | 'confirmed' | 'pending' | 'refunded'>('all');

  const { data, isLoading, error } = useQuery({
    queryKey: ['transactions', 'full'],
    queryFn: () => api.getHistory(50),
  });

  const explorerBaseUrl = import.meta.env.VITE_EXPLORER_URL;
  const transactions = data?.transactions ?? [];

  const filtered = transactions.filter((tx: TransactionRecord) => {
    if (filter === 'all') return true;
    if (filter === 'confirmed') return tx.status === 'confirmed';
    if (filter === 'pending') return tx.status === 'submitted' || tx.status === 'pending';
    if (filter === 'refunded') return tx.status === 'refunded' || tx.type === 'refund';
    return true;
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Transaction History</h2>
        <p className="text-xs text-slate-500">Record of confirmed CPC campus payments & refunds</p>
      </div>

      {/* Filter Chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
        {(['all', 'confirmed', 'pending', 'refunded'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`rounded-full px-3 py-1 font-semibold capitalize transition ${
              filter === tab
                ? 'bg-blue-600 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
        </div>
      ) : error ? (
        <div className="rounded-2xl bg-white p-6 text-center text-xs text-red-500 shadow-sm border border-slate-200">
          Failed to load transaction history. Please try again.
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm border border-slate-200">
          <Clock className="mx-auto h-10 w-10 text-slate-300 mb-2" />
          <h3 className="text-sm font-semibold text-slate-800">No transactions found</h3>
          <p className="mt-1 text-xs text-slate-400">
            {filter === 'all'
              ? 'No payment records available.'
              : `No transactions match the filter "${filter}".`}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((tx: TransactionRecord) => {
            const isRefund = tx.type === 'refund' || tx.status === 'refunded';
            return (
              <div
                key={tx.id}
                className="rounded-2xl bg-white p-4 shadow-sm border border-slate-200 space-y-2"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                        isRefund ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'
                      }`}
                    >
                      {isRefund ? (
                        <ArrowDownLeft className="h-5 w-5" />
                      ) : (
                        <ArrowUpRight className="h-5 w-5" />
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-900">
                        {tx.merchantName || 'Campus Merchant'}
                      </div>
                      <div className="text-xs text-slate-400 capitalize">
                        {tx.category || 'General'}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div
                      className={`text-sm font-extrabold ${
                        isRefund ? 'text-emerald-600' : 'text-slate-900'
                      }`}
                    >
                      {isRefund ? `+${tx.amount}` : `-${tx.amount}`} CPC
                    </div>
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${
                        tx.status === 'confirmed'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : tx.status === 'refunded'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {tx.status}
                    </span>
                  </div>
                </div>

                {/* Explorer & ID footer */}
                <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-400">
                  <div className="font-mono">
                    ID: {tx.id.length > 14 ? `${tx.id.slice(0, 8)}...` : tx.id}
                  </div>

                  {tx.txHash && (
                    <div>
                      {explorerBaseUrl ? (
                        <a
                          href={`${explorerBaseUrl}/tx/${tx.txHash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 font-mono text-blue-600 hover:underline"
                        >
                          <span>Tx: {tx.txHash.slice(0, 6)}...</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="font-mono text-slate-500">
                          Tx: {tx.txHash.slice(0, 6)}...{tx.txHash.slice(-4)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
