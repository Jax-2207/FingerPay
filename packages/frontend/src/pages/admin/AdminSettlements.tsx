import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, formatErrorMessage, type SettlementRecord } from '../../api.js';
import { ConfirmDialog } from '../../components/ConfirmDialog.js';
import { CheckCircle2, XCircle, AlertCircle, ExternalLink, Banknote } from 'lucide-react';

export function AdminSettlements() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Approve dialog
  const [pendingApprove, setPendingApprove] = useState<SettlementRecord | null>(null);

  // Mark-paid modal
  const [pendingMarkPaid, setPendingMarkPaid] = useState<SettlementRecord | null>(null);
  const [extRef, setExtRef] = useState('');

  const explorerBaseUrl = import.meta.env.VITE_EXPLORER_URL;

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'settlements'],
    queryFn: () => api.getAdminSettlements(),
  });

  const settlements = data?.settlements ?? [];

  const handleExecuteApprove = async () => {
    if (!pendingApprove) return;
    setActionLoading(true);
    setError(null);
    try {
      await api.decideAdminSettlement(pendingApprove.id, 'approve');
      setPendingApprove(null);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'settlements'] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
    } catch (err) {
      setError(formatErrorMessage(err));
      setPendingApprove(null);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (id: string) => {
    const reason = window.prompt(
      'Enter reason for settlement rejection:',
      'Rejected by administration',
    );
    if (reason === null) return;

    setActionLoading(true);
    setError(null);
    try {
      await api.decideAdminSettlement(id, 'reject', reason);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'settlements'] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
    } catch (err) {
      setError(formatErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleExecuteMarkPaid = async () => {
    if (!pendingMarkPaid || !extRef.trim()) return;
    setActionLoading(true);
    setError(null);
    try {
      await api.markSettlementPaid(pendingMarkPaid.id, extRef.trim());
      setPendingMarkPaid(null);
      setExtRef('');
      await queryClient.invalidateQueries({ queryKey: ['admin', 'settlements'] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
    } catch (err) {
      setError(formatErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Merchant Settlement Queue</h2>
        <p className="text-xs text-slate-500">
          Approve token burns on-chain and record external rupee payment vouchers
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-2xl bg-red-50 p-4 text-xs text-red-700 border border-red-200">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {isLoading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-900 border-t-transparent"></div>
        </div>
      ) : settlements.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center text-xs text-slate-400 shadow-sm border border-slate-200">
          No merchant settlement requests in queue.
        </div>
      ) : (
        <div className="rounded-2xl bg-white shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-400 font-bold uppercase border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Settlement ID</th>
                  <th className="py-2.5 px-3">Merchant Address</th>
                  <th className="py-2.5 px-3">Amount</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Burn Hash</th>
                  <th className="py-2.5 px-3">Disbursement</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {settlements.map((s: SettlementRecord) => (
                  <tr key={s.id} className="hover:bg-slate-50/50">
                    <td className="py-3 px-3 font-mono font-bold text-slate-800">
                      {s.id.slice(0, 10)}...
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-600">
                      {s.merchantAddress.slice(0, 6)}...{s.merchantAddress.slice(-4)}
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
                    <td className="py-3 px-3 text-right">
                      {s.status === 'requested' ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setPendingApprove(s)}
                            disabled={actionLoading}
                            className="flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                          >
                            <CheckCircle2 className="h-3 w-3" /> Approve & Burn
                          </button>
                          <button
                            onClick={() => handleReject(s.id)}
                            disabled={actionLoading}
                            className="flex items-center gap-1 rounded-lg bg-red-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            <XCircle className="h-3 w-3" /> Reject
                          </button>
                        </div>
                      ) : s.status === 'approved' ? (
                        <button
                          onClick={() => {
                            setPendingMarkPaid(s);
                            setExtRef('');
                          }}
                          disabled={actionLoading}
                          className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 ml-auto disabled:opacity-50"
                        >
                          <Banknote className="h-3 w-3" /> Mark Paid
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400 capitalize">{s.status}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Confirmation Dialog for Burn */}
      <ConfirmDialog
        open={Boolean(pendingApprove)}
        title="Approve Settlement & Burn CPC"
        description="This will execute FingerPay.settle() on-chain via the relayer, burning the tokens from the merchant balance. Ensure tokens are ready to be paid in INR outside the application:"
        confirmLabel="Approve & Burn On-Chain"
        loading={actionLoading}
        details={
          pendingApprove
            ? [
                {
                  label: 'Merchant Address',
                  value: `${pendingApprove.merchantAddress.slice(0, 10)}...`,
                },
                { label: 'Amount to Burn', value: `${pendingApprove.amount} CPC` },
                { label: 'Settlement Code', value: `SETTLE-${pendingApprove.id.slice(0, 8)}` },
              ]
            : []
        }
        onConfirm={handleExecuteApprove}
        onCancel={() => setPendingApprove(null)}
      />

      {/* Mark Paid Modal */}
      {pendingMarkPaid && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <Banknote className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Record External Disbursement</h3>
                <p className="text-xs text-slate-500">
                  Mark external payment of {pendingMarkPaid.amount} CPC equivalent as completed
                </p>
              </div>
            </div>

            <div className="my-4">
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                Bank / Accounts Office Payment Reference
              </label>
              <input
                type="text"
                required
                value={extRef}
                onChange={(e) => setExtRef(e.target.value)}
                placeholder="e.g. UTR-982187319 or NEFT-102931"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs font-mono focus:border-slate-900 focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-slate-400">
                Required audit reference verifying real rupee payment outside FingerPay.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingMarkPaid(null)}
                disabled={actionLoading}
                className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteMarkPaid}
                disabled={actionLoading || !extRef.trim()}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {actionLoading ? 'Saving...' : 'Record Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
