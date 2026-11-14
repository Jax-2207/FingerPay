import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.js';
import { api, formatErrorMessage } from '../api.js';
import { registerPasskey } from '../passkey.js';
import { Fingerprint, KeyRound, AlertCircle } from 'lucide-react';

export function Onboarding() {
  const { user, profile, role, loading: authLoading, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<1 | 2>(profile?.passkeyRegistered ? 2 : 1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user && !authLoading) {
      navigate('/login', { replace: true });
    } else if (role === 'admin') {
      navigate('/admin', { replace: true });
    } else if (role === 'merchant') {
      navigate('/merchant', { replace: true });
    } else if (profile?.status === 'pending') {
      navigate('/pending', { replace: true });
    } else if (profile?.passkeyRegistered && profile?.pinSet) {
      navigate('/', { replace: true });
    }
  }, [user, role, profile, authLoading, navigate]);

  // PIN state
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  const handleRegisterPasskey = async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await api.getPasskeyRegisterOptions();
      const webauthnRes = await registerPasskey({
        challengeId: data.challengeId,
        options: data.options as never,
      });
      await api.verifyPasskeyRegister(data.challengeId, webauthnRes.response);
      await refreshProfile();
      setStep(2);
    } catch (err) {
      setError(formatErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSetPin = async () => {
    setError(null);
    if (!/^\d{4,6}$/.test(pin)) {
      setError('PIN must be 4 to 6 digits.');
      return;
    }
    if (['0000', '1234', '1111', '0123', '12345', '123456'].includes(pin)) {
      setError('PIN is too simple. Please choose a more secure PIN.');
      return;
    }
    if (pin !== confirmPin) {
      setError('PIN and confirmation PIN do not match.');
      return;
    }

    setLoading(true);
    try {
      await api.setPin(pin);
      await refreshProfile();
      navigate('/');
    } catch (err) {
      setError(formatErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm border border-slate-200">
        {/* Step indicator */}
        <div className="mb-6 flex items-center justify-center gap-2">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
              step >= 1 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'
            }`}
          >
            1
          </div>
          <div className="h-0.5 w-8 bg-slate-200"></div>
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
              step >= 2 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'
            }`}
          >
            2
          </div>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700 border border-red-200">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {step === 1 && (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-blue-600 border border-blue-200">
              <Fingerprint className="h-8 w-8" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">
              Register Device Passkey
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Set up biometric authentication (fingerprint or screen lock) on this device for
              secure, one-touch payments.
            </p>

            <div className="my-6 rounded-xl bg-slate-50 p-4 text-left border border-slate-200 text-xs text-slate-600 space-y-1">
              <div className="font-semibold text-slate-800">Privacy & Security Guarantee:</div>
              <div>• Biometric samples never leave your device.</div>
              <div>• FingerPay stores only the public cryptographic credential.</div>
            </div>

            <button
              onClick={handleRegisterPasskey}
              disabled={loading}
              className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 active:scale-[0.99] disabled:opacity-50"
            >
              {loading ? 'Waiting for authenticator...' : 'Enable Passkey'}
            </button>
          </div>
        )}

        {step === 2 && (
          <div>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
              <KeyRound className="h-8 w-8" />
            </div>
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                Set Application PIN
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Create a 4 to 6 digit security PIN used alongside your passkey for high-value
                authorizations.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Enter 4-6 Digit PIN
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-center text-xl tracking-widest focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Confirm PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-center text-xl tracking-widest focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
              </div>

              <div className="text-xs text-slate-500">
                Argon2id protected. Account locks after 5 consecutive incorrect attempts for 15
                minutes.
              </div>

              <button
                onClick={handleSetPin}
                disabled={loading || pin.length < 4}
                className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 active:scale-[0.99] disabled:opacity-50"
              >
                {loading ? 'Saving PIN...' : 'Complete Onboarding'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
