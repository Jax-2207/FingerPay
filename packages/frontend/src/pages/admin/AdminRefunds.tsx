import { useState, type FormEvent } from 'react';
import { api, formatErrorMessage } from '../../api.js';
import { ConfirmDialog } from '../../components/ConfirmDialog.js';
import { RotateCcw, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';

export function AdminRefunds() {
  const [intentId, setIntentId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [result, setResult] = useState<{
    txHash: string;
    intentId: string;
  } | null>(null);

  const explorerBaseUrl = import.meta.env.VITE_EXPLORER_URL;

  const handleOpenConfirm = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);

    const trimmed = intentId.trim();
    if (!trimmed.startsWith('0x') || trimmed.length !== 66) {
      setError(
        'Please provide a valid 32-byte hexadecimal Payment Intent ID (0x followed by 64 hex characters).',
      );
      return;
    }

    setShowConfirm(true);
  };

  const handleExecuteRefund = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.adminRefund({
        intentId: intentId.trim(),
      });

      setResult({
        txHash: res.txHash,
        intentId: intentId.trim(),
      });
      setShowConfirm(false);
      setIntentId('');
    } catch (err) {
      setError(formatErrorMessage(err));
      setShowConfirm(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-black text-slate-900 tracking-tight">Payment Refunds</h2>
        <p className="text-xs text-slate-500">
          Reverse a confirmed payment by calling FingerPay.refund() on-chain. Tokens are returned to
          the student.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-2xl bg-red-50 p-4 text-xs text-red-700 border border-red-200">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="rounded-2xl bg-emerald-50 p-6 border border-emerald-200 text-emerald-900 space-y-3">
          <div className="flex items-center gap-2 font-bold text-sm">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <span>Refund Successful: On-chain tokens returned to original payer</span>
          </div>

          <div className="space-y-1 text-xs font-mono text-emerald-800 bg-white/70 p-3 rounded-xl border border-emerald-100">
            <div>Intent ID: {result.intentId}</div>
            <div className="flex items-center gap-1.5 pt-1">
              <span>Transaction Hash:</span>
              {explorerBaseUrl ? (
                <a
                  href={`${explorerBaseUrl}/tx/${result.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-700 underline font-bold flex items-center gap-1"
                >
                  <span>{result.txHash.slice(0, 10)}...</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <span>{result.txHash}</span>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-200">
        <form onSubmit={handleOpenConfirm} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
              Confirmed Payment Intent ID (32-byte bytes32 hex)
            </label>
            <input
              type="text"
              required
              value={intentId}
              onChange={(e) => setIntentId(e.target.value)}
              placeholder="0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs font-mono focus:border-slate-900 focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Only confirmed payments that have not yet been refunded can be processed. Reversible
              only once.
            </p>
          </div>

          <button
            type="submit"
            className="flex items-center justify-center gap-2 rounded-xl bg-red-600 px-6 py-3 text-xs font-bold text-white shadow-sm hover:bg-red-700 transition"
          >
            <RotateCcw className="h-4 w-4" />
            <span>Review & Authorize Refund</span>
          </button>
        </form>
      </div>

      {/* Confirmation Dialog showing exact values */}
      <ConfirmDialog
        open={showConfirm}
        destructive
        title="Confirm Payment Refund"
        description="This action will call FingerPay.refund() on-chain via the relayer, transferring tokens from the merchant wallet back to the student. This action cannot be undone:"
        confirmLabel="Execute Refund"
        loading={submitting}
        details={[
          {
            label: 'Payment Intent ID',
            value: `${intentId.slice(0, 14)}...${intentId.slice(-10)}`,
          },
          { label: 'Action', value: 'Reversible On-Chain Refund' },
        ]}
        onConfirm={handleExecuteRefund}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  );
}
