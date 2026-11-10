import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, formatErrorMessage, type MerchantProfile } from '../../api.js';
import { CheckCircle2, XCircle, Power, AlertCircle, ExternalLink } from 'lucide-react';

export function AdminMerchants() {
  const queryClient = useQueryClient();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const explorerBaseUrl = import.meta.env.VITE_EXPLORER_URL;

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'merchants'],
    queryFn: () => api.getAdminMerchants(),
  });

  const merchants = data?.merchants ?? [];

  const handleDecision = async (uid: string, decision: 'approve' | 'reject') => {
    setActionLoading(uid);
    setError(null);
    try {
      await api.decideAdminMerchant(uid, decision);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'merchants'] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
    } catch (err) {
      setError(formatErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleStatus = async (uid: string, active: boolean) => {
    setActionLoading(uid);
    setError(null);
    try {
      if (active) {
        await api.deactivateMerchant(uid);
      } else {
        await api.activateMerchant(uid);
      }
      await queryClient.invalidateQueries({ queryKey: ['admin', 'merchants'] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
    } catch (err) {
      setError(formatErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Campus Merchants Directory</h2>
        <p className="text-xs text-slate-500">
          Manage merchant approvals, smart contract registration, and terminal status
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
      ) : merchants.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center text-xs text-slate-400 shadow-sm border border-slate-200">
          No campus merchants registered yet.
        </div>
      ) : (
        <div className="rounded-2xl bg-white shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-400 font-bold uppercase border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Shop Name</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Wallet Address</th>
                  <th className="py-2.5 px-3">Approval</th>
                  <th className="py-2.5 px-3">Terminal State</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {merchants.map((m: MerchantProfile) => (
                  <tr key={m.uid} className="hover:bg-slate-50/50">
                    <td className="py-3 px-3 font-bold text-slate-900">{m.shopName}</td>
                    <td className="py-3 px-3 capitalize text-slate-500">{m.category}</td>
                    <td className="py-3 px-3 font-mono text-slate-700">
                      {explorerBaseUrl && m.walletAddress ? (
                        <a
                          href={`${explorerBaseUrl}/address/${m.walletAddress}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-indigo-600 hover:underline flex items-center gap-1"
                        >
                          <span>
                            {m.walletAddress.slice(0, 6)}...{m.walletAddress.slice(-4)}
                          </span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        `${m.walletAddress.slice(0, 6)}...${m.walletAddress.slice(-4)}`
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                          m.status === 'approved'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : m.status === 'rejected'
                              ? 'bg-red-50 text-red-700 border border-red-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {m.status}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                          m.active
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {m.active ? 'Active' : 'Deactivated'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      {m.status === 'pending' ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleDecision(m.uid, 'approve')}
                            disabled={actionLoading === m.uid}
                            className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            <CheckCircle2 className="h-3 w-3" /> Approve
                          </button>
                          <button
                            onClick={() => handleDecision(m.uid, 'reject')}
                            disabled={actionLoading === m.uid}
                            className="flex items-center gap-1 rounded-lg bg-red-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            <XCircle className="h-3 w-3" /> Reject
                          </button>
                        </div>
                      ) : m.status === 'approved' ? (
                        <button
                          onClick={() => handleToggleStatus(m.uid, m.active)}
                          disabled={actionLoading === m.uid}
                          className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold ml-auto disabled:opacity-50 ${
                            m.active
                              ? 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                          }`}
                        >
                          <Power className="h-3 w-3" />
                          <span>{m.active ? 'Deactivate' : 'Activate'}</span>
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400">Rejected</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
