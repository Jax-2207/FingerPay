import { useState, type FormEvent } from 'react';
import { api, formatErrorMessage } from '../../api.js';
import { ConfirmDialog } from '../../components/ConfirmDialog.js';
import { Coins, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';

export function AdminMint() {
  const [prn, setPrn] = useState('');
  const [amount, setAmount] = useState('');
  const [receiptRef, setReceiptRef] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [result, setResult] = useState<{
    txHash: string;
    studentWallet: string;
    amount: string;
    prn: string;
  } | null>(null);

  const explorerBaseUrl = import.meta.env.VITE_EXPLORER_URL;

  const handleOpenConfirm = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);

    const parsedAmount = parseInt(amount, 10);
    if (!prn.trim()) {
      setError('Student PRN is required.');
      return;
    }
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Please enter a valid positive integer CPC amount.');
      return;
    }
    if (!receiptRef.trim()) {
      setError('Campus Accounts receipt reference is required.');
      return;
    }

    setShowConfirm(true);
  };

  const handleExecuteMint = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.adminMint({
        prn: prn.trim(),
        amount: parseInt(amount, 10),
        receiptRef: receiptRef.trim(),
      });

      setResult({
        txHash: res.txHash,
        studentWallet: res.studentWallet,
        amount,
        prn: prn.trim(),
      });
      setShowConfirm(false);
      setAmount('');
      setReceiptRef('');
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
        <h2 className="text-xl font-black text-slate-900 tracking-tight">Mint CampusCoin (CPC)</h2>
        <p className="text-xs text-slate-500">
          Credit demo CPC tokens to an enrolled student against an external Accounts Office receipt
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
            <span>
              Mint Successful: {result.amount} CPC credited to {result.prn}
            </span>
          </div>

          <div className="space-y-1 text-xs font-mono text-emerald-800 bg-white/70 p-3 rounded-xl border border-emerald-100">
            <div>Student Wallet: {result.studentWallet}</div>
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
              Student PRN
            </label>
            <input
              type="text"
              required
              value={prn}
              onChange={(e) => setPrn(e.target.value)}
              placeholder="e.g. PRN-2024-001"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs font-mono uppercase focus:border-slate-900 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
              CPC Amount to Mint
            </label>
            <input
              type="number"
              required
              min={1}
              step={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 50"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs font-bold focus:border-slate-900 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
              External Campus Accounts Receipt Reference
            </label>
            <input
              type="text"
              required
              value={receiptRef}
              onChange={(e) => setReceiptRef(e.target.value)}
              placeholder="e.g. REC-2026-NOV-8901"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs font-mono focus:border-slate-900 focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Audit reference from the physical fee receipt or accounts voucher. Duplicate
              references are rejected.
            </p>
          </div>

          <button
            type="submit"
            className="flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-6 py-3 text-xs font-bold text-white shadow-sm hover:bg-amber-700 transition"
          >
            <Coins className="h-4 w-4" />
            <span>Review & Mint CPC</span>
          </button>
        </form>
      </div>

      {/* Confirmation Dialog showing exact values */}
      <ConfirmDialog
        open={showConfirm}
        title="Confirm CampusCoin Minting"
        description="You are about to execute an on-chain token mint via the authorized relayer. Please review exact values:"
        confirmLabel="Authorize Mint"
        loading={submitting}
        details={[
          { label: 'Recipient PRN', value: prn },
          { label: 'Amount to Mint', value: `${amount} CPC` },
          { label: 'Receipt Reference', value: receiptRef },
        ]}
        onConfirm={handleExecuteMint}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  );
}
