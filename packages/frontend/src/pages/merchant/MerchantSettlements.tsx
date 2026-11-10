import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, formatErrorMessage, type SettlementRecord } from '../../api.js';
import { CreditCard, Wallet, AlertCircle, ExternalLink } from 'lucide-react';

export function MerchantSettlements() {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const { data: profile } = useQuery({
    queryKey: ['merchant', 'profile'],
    queryFn: () => api.getMerchantProfile(),
  });

  const { data: settleData, isLoading } = useQuery({
    queryKey: ['merchant', 'settlements'],
    queryFn: () => api.getSettlements(),
  });

  const settlements = settleData?.settlements ?? [];
  const balance = Number(profile?.balance ?? '0');
  const explorerBaseUrl = import.meta.env.VITE_EXPLORER_URL;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const parsed = parseInt(amount, 10);
    if (isNaN(parsed) || parsed <= 0) {
      setError('Please enter a valid positive integer CPC amount.');
      return;
    }
    if (parsed > balance) {
      setError(
        `Requested amount (${parsed} CPC) exceeds available on-chain balance (${balance} CPC).`,
      );
      return;
    }

    setSubmitting(true);
    try {
      await api.requestSettlement(parsed);
      setSuccessMsg(`Settlement request for ${parsed} CPC submitted successfully.`);
      setAmount('');
      await queryClient.invalidateQueries({ queryKey: ['merchant', 'settlements'] });
      await queryClient.invalidateQueries({ queryKey: ['merchant', 'profile'] });
    } catch (err) {
      setError(formatErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Merchant Settlements</h2>
        <p className="text-xs text-slate-500">
          Request official campus account settlement to convert earned CPC to INR
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-2xl bg-red-50 p-4 text-xs text-red-700 border border-red-200">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 p-4 text-xs text-emerald-800 border border-emerald-200 font-semibold">
          <span>{successMsg}</span>
        </div>
      )}

      {/* Available Balance & Request Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="rounded-2xl bg-gradient-to-br from-indigo-900 to-indigo-700 p-6 text-white shadow-md">
          <div className="flex items-center gap-2 text-xs font-semibold text-indigo-200 uppercase tracking-wider">
            <Wallet className="h-4 w-4" />
            <span>Available CPC Balance</span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-4xl font-extrabold">{balance}</span>
            <span className="text-lg font-semibold text-indigo-200">CPC</span>
          </div>
          <p className="mt-3 text-xs text-indigo-200 border-t border-indigo-600/50 pt-2">
            Settlement burns CPC on-chain upon Campus Accounts approval.
          </p>
        </div>

        {/* Request Form */}
        <div className="md:col-span-2 rounded-2xl bg-white p-6 shadow-sm border border-slate-200">
          <h3 className="text-sm font-bold text-slate-900 mb-1">Submit Settlement Request</h3>
          <p className="text-xs text-slate-500 mb-4">
            Campus Accounts will review, burn the tokens on-chain, and disburse INR.
          </p>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                Settlement Amount (CPC)
              </label>
              <div className="relative">
                <input
                  type="number"
                  required
                  min={1}
                  max={balance}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={`Max ${balance}`}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-bold focus:border-indigo-600 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setAmount(balance.toString())}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-indigo-600 hover:text-indigo-800"
                >
                  MAX
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || !amount || Number(amount) <= 0 || Number(amount) > balance}
              className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 transition disabled:opacity-50"
            >
              <CreditCard className="h-4 w-4" />
              <span>{submitting ? 'Submitting...' : 'Request Settlement'}</span>
            </button>
          </form>
        </div>
      </div>

      {/* Settlement History Table */}
      <div className="rounded-2xl bg-white p-5 shadow-sm border border-slate-200">
        <h3 className="text-sm font-bold text-slate-900 mb-3">Settlement History</h3>

        {isLoading ? (
          <div className="py-8 text-center text-xs text-slate-400">Loading settlements...</div>
        ) : settlements.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            No settlement requests submitted yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-400 font-bold uppercase border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Request ID</th>
                  <th className="py-2.5 px-3">Amount</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Burn Tx</th>
                  <th className="py-2.5 px-3">INR Payment Ref</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {settlements.map((s: SettlementRecord) => (
                  <tr key={s.id} className="hover:bg-slate-50/50">
                    <td className="py-3 px-3 font-mono font-bold text-slate-800">
                      {s.id.slice(0, 10)}...
                    </td>
                    <td className="py-3 px-3 font-bold text-slate-900">{s.amount} CPC</td>
                    <td className="py-3 px-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                          s.status === 'paid'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : s.status === 'approved'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : s.status === 'rejected'
                                ? 'bg-red-50 text-red-700 border border-red-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {s.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-500">
                      {s.txHash ? (
                        explorerBaseUrl ? (
                          <a
                            href={`${explorerBaseUrl}/tx/${s.txHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-indigo-600 hover:underline flex items-center gap-1"
                          >
                            <span>{s.txHash.slice(0, 6)}...</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          `${s.txHash.slice(0, 6)}...`
                        )
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-3 px-3 font-medium text-slate-700">
                      {s.externalReference ||
                        (s.rejectionReason ? `Reason: ${s.rejectionReason}` : 'Pending review')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
