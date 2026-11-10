import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, formatErrorMessage, type AdminChainInfo } from '../../api.js';
import { ConfirmDialog } from '../../components/ConfirmDialog.js';
import {
  ShieldAlert,
  ShieldCheck,
  Pause,
  Play,
  Activity,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';

export function AdminChain() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showPauseConfirm, setShowPauseConfirm] = useState(false);
  const [showUnpauseConfirm, setShowUnpauseConfirm] = useState(false);

  const explorerBaseUrl = import.meta.env.VITE_EXPLORER_URL;

  const { data, isLoading } = useQuery<AdminChainInfo>({
    queryKey: ['admin', 'chain'],
    queryFn: () => api.getAdminChain(),
    refetchInterval: 10000,
  });

  const handleExecutePause = async () => {
    setActionLoading(true);
    setError(null);
    try {
      await api.adminPause();
      setShowPauseConfirm(false);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'chain'] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
    } catch (err) {
      setError(formatErrorMessage(err));
      setShowPauseConfirm(false);
    } finally {
      setActionLoading(false);
    }
  };

  const handleExecuteUnpause = async () => {
    setActionLoading(true);
    setError(null);
    try {
      await api.adminUnpause();
      setShowUnpauseConfirm(false);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'chain'] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
    } catch (err) {
      setError(formatErrorMessage(err));
      setShowUnpauseConfirm(false);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-black text-slate-900 tracking-tight">
          Smart Contract Controls
        </h2>
        <p className="text-xs text-slate-500">
          Emergency circuit breaker, on-chain contract addresses, and recent blockchain event logs
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-2xl bg-red-50 p-4 text-xs text-red-700 border border-red-200">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Circuit Breaker Status Card */}
      <div
        className={`rounded-3xl p-6 border transition shadow-sm ${
          data?.paused
            ? 'bg-red-50 border-red-200 text-red-950'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
                data?.paused ? 'bg-red-600 text-white' : 'bg-emerald-50 text-emerald-600'
              }`}
            >
              {data?.paused ? (
                <ShieldAlert className="h-6 w-6" />
              ) : (
                <ShieldCheck className="h-6 w-6" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold">
                  {data?.paused
                    ? 'Emergency Circuit Breaker: PAUSED'
                    : 'Circuit Breaker: OPERATIONAL'}
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {data?.paused
                  ? 'All state-changing contract operations (mint, pay, refund, settle) are blocked.'
                  : 'Normal campus payments, minting, and settlements are active.'}
              </p>
            </div>
          </div>

          <div>
            {data?.paused ? (
              <button
                onClick={() => setShowUnpauseConfirm(true)}
                disabled={actionLoading}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition disabled:opacity-50"
              >
                <Play className="h-4 w-4" />
                <span>Resume Operations (Unpause)</span>
              </button>
            ) : (
              <button
                onClick={() => setShowPauseConfirm(true)}
                disabled={actionLoading}
                className="flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-red-700 transition disabled:opacity-50"
              >
                <Pause className="h-4 w-4" />
                <span>Emergency Pause System</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Contract Addresses */}
      <div className="rounded-2xl bg-white p-5 shadow-sm border border-slate-200 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Deployed EVM Contract Addresses
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-200">
            <div className="text-slate-500 font-semibold mb-1">FingerPay Controller:</div>
            <div className="font-mono font-bold text-slate-800 break-all">
              {isLoading ? '...' : data?.fingerPayAddress || '0x—'}
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-200">
            <div className="text-slate-500 font-semibold mb-1">CampusCoin (CPC) Token:</div>
            <div className="font-mono font-bold text-slate-800 break-all">
              {isLoading ? '...' : data?.campusCoinAddress || '0x—'}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Indexed Blockchain Events */}
      <div className="rounded-2xl bg-white p-5 shadow-sm border border-slate-200">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900 mb-3">
          <Activity className="h-4 w-4 text-indigo-600" />
          <span>Recently Indexed Smart Contract Events</span>
        </div>

        {isLoading ? (
          <div className="py-6 text-center text-xs text-slate-400">Loading events...</div>
        ) : !data?.recentEvents || data.recentEvents.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400">
            No on-chain events indexed recently.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 text-xs">
            {data.recentEvents.map((evt, idx) => (
              <div key={idx} className="py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-800 uppercase font-mono">
                    {String(evt.eventName || 'Event')}
                  </span>
                  <span className="text-slate-400">Block #{String(evt.blockNumber || '—')}</span>
                </div>

                <div className="font-mono text-slate-500">
                  {evt.transactionHash && explorerBaseUrl ? (
                    <a
                      href={`${explorerBaseUrl}/tx/${String(evt.transactionHash)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:underline flex items-center gap-1"
                    >
                      <span>{String(evt.transactionHash).slice(0, 8)}...</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : evt.transactionHash ? (
                    `${String(evt.transactionHash).slice(0, 8)}...`
                  ) : (
                    '—'
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirmation Dialogs */}
      <ConfirmDialog
        open={showPauseConfirm}
        destructive
        title="Confirm Emergency Contract Pause"
        description="This will execute FingerPay.pause() on-chain via the relayer. All student payments, minting, refunds, and settlements will be blocked until unpaused:"
        confirmLabel="Activate Emergency Pause"
        loading={actionLoading}
        details={[
          { label: 'Target Contract', value: 'FingerPay.sol' },
          { label: 'Action', value: 'OpenZeppelin Pausable.pause()' },
        ]}
        onConfirm={handleExecutePause}
        onCancel={() => setShowPauseConfirm(false)}
      />

      <ConfirmDialog
        open={showUnpauseConfirm}
        title="Confirm Resume Operations (Unpause)"
        description="This will call FingerPay.unpause() on-chain, re-enabling all normal student payment and settlement operations:"
        confirmLabel="Resume Operations"
        loading={actionLoading}
        details={[
          { label: 'Target Contract', value: 'FingerPay.sol' },
          { label: 'Action', value: 'OpenZeppelin Pausable.unpause()' },
        ]}
        onConfirm={handleExecuteUnpause}
        onCancel={() => setShowUnpauseConfirm(false)}
      />
    </div>
  );
}
