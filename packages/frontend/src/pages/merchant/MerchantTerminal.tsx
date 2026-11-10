import { useState, useEffect, type FormEvent } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { api, formatErrorMessage, type PaymentIntentDetails } from '../../api.js';
import { QrCode, Clock, CheckCircle2, AlertCircle, XCircle, RotateCcw, Store } from 'lucide-react';

export function MerchantTerminal() {
  const [amount, setAmount] = useState<string>('');
  const [category, setCategory] = useState<string>('canteen');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Active intent state
  const [activeIntent, setActiveIntent] = useState<PaymentIntentDetails | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  // Poll intent status while active
  useEffect(() => {
    if (!activeIntent || activeIntent.status !== 'created') return;

    const pollInterval = setInterval(async () => {
      try {
        const fresh = await api.getPaymentIntent(activeIntent.id);
        setActiveIntent(fresh);

        if (fresh.status === 'confirmed') {
          setConfirmed(true);
          clearInterval(pollInterval);
        } else if (fresh.status === 'expired' || fresh.status === 'failed') {
          clearInterval(pollInterval);
        }
      } catch {
        // Ignore transient poll errors
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [activeIntent?.id, activeIntent?.status]);

  // Countdown timer
  useEffect(() => {
    if (!activeIntent?.expiry) return;

    const timer = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      const remaining = Number(activeIntent.expiry) - now;
      if (remaining <= 0) {
        setTimeLeft(0);
        clearInterval(timer);
      } else {
        setTimeLeft(remaining);
      }
    }, 1000);

    const now = Math.floor(Date.now() / 1000);
    setTimeLeft(Math.max(0, Number(activeIntent.expiry) - now));

    return () => clearInterval(timer);
  }, [activeIntent?.expiry]);

  const handleCreateIntent = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsedAmount = parseInt(amount, 10);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Please enter a valid positive CPC amount.');
      return;
    }
    if (parsedAmount > 200) {
      setError('Amount exceeds the maximum campus single payment limit of 200 CPC.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.createIntent({
        amount: parsedAmount,
        category: category.trim() || 'general',
      });

      setActiveIntent({
        id: res.id,
        intentId: res.intentId,
        merchantUid: '',
        merchantAddress: '',
        merchantName: '',
        category,
        amount: res.amount,
        expiry: res.expiry,
        status: 'created',
      });
      setConfirmed(false);
    } catch (err) {
      setError(formatErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelIntent = async () => {
    if (!activeIntent) return;
    try {
      await api.cancelIntent(activeIntent.id);
    } catch {
      // Ignore
    }
    setActiveIntent(null);
    setAmount('');
    setError(null);
    setConfirmed(false);
  };

  const handleReset = () => {
    setActiveIntent(null);
    setAmount('');
    setError(null);
    setConfirmed(false);
  };

  const fullPaymentUrl = activeIntent
    ? `${window.location.origin}/pay/${encodeURIComponent(activeIntent.id)}`
    : '';

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <div className="text-center">
        <h2 className="text-xl font-black text-slate-900 tracking-tight">Merchant POS Terminal</h2>
        <p className="text-xs text-slate-500">Generate a secure payment QR for customer checkout</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-2xl bg-red-50 p-4 text-xs text-red-700 border border-red-200">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Confirmed State */}
      {confirmed && activeIntent ? (
        <div className="rounded-3xl bg-white p-8 text-center shadow-lg border border-emerald-200 animate-in zoom-in-95">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
            <CheckCircle2 className="h-12 w-12" />
          </div>
          <h3 className="text-2xl font-black text-slate-900">Payment Received!</h3>
          <div className="mt-2 text-4xl font-extrabold text-emerald-600">
            +{activeIntent.amount} CPC
          </div>
          <p className="mt-2 text-xs text-slate-400 font-mono">
            Intent ID: {activeIntent.intentId.slice(0, 10)}...
          </p>

          <button
            onClick={handleReset}
            className="mt-6 w-full rounded-2xl bg-slate-900 py-3.5 text-sm font-bold text-white shadow-md hover:bg-slate-800 transition"
          >
            Start New Transaction
          </button>
        </div>
      ) : activeIntent ? (
        /* Active Payment QR Screen */
        <div className="rounded-3xl bg-white p-6 text-center shadow-lg border border-slate-200 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-slate-700">
              <Store className="h-4 w-4 text-indigo-600" />
              <span>Checkout Terminal</span>
            </div>
            <div className="flex items-center gap-1 font-semibold text-amber-600">
              <Clock className="h-4 w-4" />
              <span>{timeLeft !== null && timeLeft > 0 ? `${timeLeft}s left` : 'Expired'}</span>
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Amount Due
            </div>
            <div className="text-4xl font-black text-slate-900 mt-1">
              {activeIntent.amount} <span className="text-xl font-bold text-indigo-600">CPC</span>
            </div>
          </div>

          {/* QR Code Container */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 inline-block shadow-inner mx-auto">
            <QRCodeSVG value={fullPaymentUrl} size={220} level="M" />
          </div>

          <p className="text-xs text-slate-500">
            Ask student to scan this QR code with their FingerPay app
          </p>

          {/* Terminal Actions */}
          <div className="flex gap-2.5 pt-2">
            <button
              onClick={handleCancelIntent}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <XCircle className="h-4 w-4 text-slate-400" />
              <span>Cancel</span>
            </button>
            <button
              onClick={handleReset}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-slate-100 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-200"
            >
              <RotateCcw className="h-4 w-4" />
              <span>New QR</span>
            </button>
          </div>
        </div>
      ) : (
        /* Amount Entry Keypad Form */
        <div className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200">
          <form onSubmit={handleCreateIntent} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                Payment Amount (CPC)
              </label>
              <div className="relative">
                <input
                  type="number"
                  required
                  min={1}
                  max={200}
                  step={1}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3.5 text-2xl font-black text-slate-900 focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                  CPC
                </span>
              </div>
            </div>

            {/* Quick preset amount chips */}
            <div className="grid grid-cols-4 gap-2">
              {[10, 20, 50, 100].map((preset) => (
                <button
                  type="button"
                  key={preset}
                  onClick={() => setAmount(preset.toString())}
                  className="rounded-xl border border-slate-200 bg-slate-50 py-2 text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:border-indigo-300 transition"
                >
                  +{preset}
                </button>
              ))}
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                Item Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs font-semibold text-slate-800 focus:border-indigo-600 focus:outline-none"
              >
                <option value="canteen">Canteen / Food</option>
                <option value="stationery">Stationery & Print</option>
                <option value="bookstore">Bookstore</option>
                <option value="general">General Goods</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={submitting || !amount || Number(amount) <= 0}
              className="flex items-center justify-center gap-2 w-full rounded-2xl bg-indigo-600 py-3.5 text-sm font-bold text-white shadow-md transition hover:bg-indigo-700 active:scale-[0.99] disabled:opacity-50"
            >
              <QrCode className="h-5 w-5" />
              <span>{submitting ? 'Generating...' : 'Generate Customer QR'}</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
