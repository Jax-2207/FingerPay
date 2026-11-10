import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, formatErrorMessage, type PaymentIntentDetails } from '../api.js';
import { authenticateWithPasskey } from '../passkey.js';
import { useAuth } from '../auth/AuthContext.js';
import {
  Store,
  Clock,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  KeyRound,
  ExternalLink,
} from 'lucide-react';

export function Pay() {
  const { intentId } = useParams<{ intentId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { refreshProfile } = useAuth();

  const [timeLeftSeconds, setTimeLeftSeconds] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal / PIN state
  const [showPinModal, setShowPinModal] = useState(false);
  const [pin, setPin] = useState('');
  const [authPayload, setAuthPayload] = useState<{
    challengeId: string;
    assertion: unknown;
  } | null>(null);

  // Success state
  const [confirmedTx, setConfirmedTx] = useState<{
    txHash: string;
    intentId: string;
  } | null>(null);

  const {
    data: intent,
    isLoading,
    error: fetchError,
  } = useQuery<PaymentIntentDetails>({
    queryKey: ['intent', intentId],
    queryFn: () => api.getPaymentIntent(intentId!),
    enabled: Boolean(intentId),
  });

  // Countdown timer
  useEffect(() => {
    if (!intent?.expiry) return;

    const interval = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      const remaining = Number(intent.expiry) - now;
      if (remaining <= 0) {
        setTimeLeftSeconds(0);
        clearInterval(interval);
      } else {
        setTimeLeftSeconds(remaining);
      }
    }, 1000);

    const now = Math.floor(Date.now() / 1000);
    setTimeLeftSeconds(Math.max(0, Number(intent.expiry) - now));

    return () => clearInterval(interval);
  }, [intent?.expiry]);

  const handleStartPayment = async () => {
    if (!intentId || !intent) return;
    setError(null);
    setSubmitting(true);

    try {
      // 1. Fetch WebAuthn auth options bound to the intent hash
      const authOptions = await api.getPaymentAuthOptions(intentId);

      // 2. Prompt user for biometric / passkey verification
      const authResult = await authenticateWithPasskey({
        challengeId: authOptions.challengeId,
        options: authOptions.options as never,
      });

      // 3. Save assertion and open PIN prompt
      setAuthPayload({
        challengeId: authOptions.challengeId,
        assertion: authResult.response,
      });
      setShowPinModal(true);
    } catch (err) {
      setError(formatErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmPinAndSubmit = async () => {
    if (!intentId || !authPayload || !pin) return;
    setError(null);
    setSubmitting(true);

    try {
      const result = await api.confirmPayment(intentId, {
        challengeId: authPayload.challengeId,
        pin,
        assertion: authPayload.assertion,
      });

      setConfirmedTx({
        txHash: result.txHash,
        intentId: result.intentId,
      });
      setShowPinModal(false);

      // Refresh cached balance & transactions
      await refreshProfile();
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
    } catch (err) {
      setError(formatErrorMessage(err));
      setShowPinModal(false);
    } finally {
      setSubmitting(false);
    }
  };

  const explorerBaseUrl = import.meta.env.VITE_EXPLORER_URL;

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  if (fetchError || !intent) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm border border-slate-200">
          <AlertCircle className="mx-auto h-12 w-12 text-red-500 mb-2" />
          <h2 className="text-lg font-bold text-slate-900">Payment Request Not Found</h2>
          <p className="mt-1 text-xs text-slate-500">
            {fetchError ? formatErrorMessage(fetchError) : 'The payment intent does not exist.'}
          </p>
          <button
            onClick={() => navigate('/scan')}
            className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white"
          >
            Scan Another QR
          </button>
        </div>
      </div>
    );
  }

  // Success Confirmation Screen
  if (confirmedTx) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm border border-slate-200">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
            <CheckCircle2 className="h-10 w-10" />
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Payment Confirmed!</h2>
          <p className="mt-1 text-sm text-slate-500">
            {intent.amount} CPC transferred to {intent.merchantName}
          </p>

          <div className="my-6 rounded-xl bg-slate-50 p-4 text-left border border-slate-200 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Status</span>
              <span className="font-semibold text-emerald-600 uppercase">Confirmed on-chain</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Amount</span>
              <span className="font-bold text-slate-900">{intent.amount} CPC</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-slate-200">
              <span className="text-slate-500">Transaction Hash</span>
              {explorerBaseUrl ? (
                <a
                  href={`${explorerBaseUrl}/tx/${confirmedTx.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 font-mono text-blue-600 hover:underline"
                >
                  <span>
                    {confirmedTx.txHash.slice(0, 8)}...{confirmedTx.txHash.slice(-6)}
                  </span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <span className="font-mono text-slate-700">
                  {confirmedTx.txHash.slice(0, 8)}...{confirmedTx.txHash.slice(-6)}
                </span>
              )}
            </div>
          </div>

          <button
            onClick={() => navigate('/')}
            className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const isExpired =
    intent.status === 'expired' || (timeLeftSeconds !== null && timeLeftSeconds <= 0);
  const isAlreadyProcessed = intent.status !== 'created';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/')}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm border border-slate-200 text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h2 className="text-lg font-bold text-slate-900">Payment Request</h2>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700 border border-red-200">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Payment Card */}
      <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-200">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Store className="h-6 w-6" />
            </div>
            <div>
              <div className="text-base font-bold text-slate-900">{intent.merchantName}</div>
              <div className="text-xs text-slate-400 capitalize">
                {intent.category || 'General Merchant'}
              </div>
            </div>
          </div>

          <div className="text-right">
            <div className="flex items-center gap-1 text-xs font-medium text-slate-500">
              <Clock className="h-3.5 w-3.5 text-amber-500" />
              <span>{isExpired ? 'Expired' : `${timeLeftSeconds ?? 0}s remaining`}</span>
            </div>
          </div>
        </div>

        {/* Amount Hero */}
        <div className="my-6 text-center">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Total Payment
          </div>
          <div className="mt-1 flex items-baseline justify-center gap-1.5">
            <span className="text-5xl font-black text-slate-900">{intent.amount}</span>
            <span className="text-xl font-bold text-blue-600">CPC</span>
          </div>
        </div>

        {/* Details Table */}
        <div className="rounded-xl bg-slate-50 p-4 space-y-2 text-xs border border-slate-200 text-slate-600">
          <div className="flex justify-between">
            <span>Merchant Wallet:</span>
            <span className="font-mono text-slate-800">
              {intent.merchantAddress.slice(0, 6)}...{intent.merchantAddress.slice(-4)}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Status:</span>
            <span
              className={`font-semibold capitalize ${
                intent.status === 'created' ? 'text-blue-600' : 'text-amber-600'
              }`}
            >
              {intent.status}
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="mt-6 space-y-2">
          {isExpired ? (
            <div className="rounded-xl bg-amber-50 p-3 text-center text-xs font-medium text-amber-800 border border-amber-200">
              This payment request has expired. Please ask the merchant to generate a new QR.
            </div>
          ) : isAlreadyProcessed ? (
            <div className="rounded-xl bg-slate-100 p-3 text-center text-xs font-medium text-slate-600">
              This payment request is already {intent.status}.
            </div>
          ) : (
            <button
              onClick={handleStartPayment}
              disabled={submitting}
              className="flex items-center justify-center gap-2 w-full rounded-xl bg-blue-600 py-3.5 text-base font-bold text-white shadow-md transition hover:bg-blue-700 active:scale-[0.99] disabled:opacity-50"
            >
              <ShieldCheck className="h-5 w-5" />
              {submitting ? 'Authenticating...' : `Approve & Pay ${intent.amount} CPC`}
            </button>
          )}

          <button
            onClick={() => navigate('/')}
            disabled={submitting}
            className="w-full rounded-xl border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </div>

      {/* PIN Verification Modal */}
      {showPinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600">
              <KeyRound className="h-6 w-6" />
            </div>
            <h3 className="text-center text-lg font-bold text-slate-900">Enter Security PIN</h3>
            <p className="mt-1 text-center text-xs text-slate-500">
              Enter your 4-6 digit application PIN to authorize {intent.amount} CPC.
            </p>

            <div className="my-5">
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                autoFocus
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                className="w-full rounded-xl border border-slate-300 py-3 text-center text-2xl tracking-widest focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowPinModal(false)}
                disabled={submitting}
                className="flex-1 rounded-xl border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Back
              </button>
              <button
                onClick={handleConfirmPinAndSubmit}
                disabled={submitting || pin.length < 4}
                className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? 'Confirming...' : 'Authorize'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
