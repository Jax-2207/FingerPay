import { useAuth } from '../auth/AuthContext.js';
import { ShieldCheck, KeyRound, Fingerprint, LogOut, ExternalLink } from 'lucide-react';

export function Profile() {
  const { profile, logout } = useAuth();
  const explorerBaseUrl = import.meta.env.VITE_EXPLORER_URL;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Student Profile</h2>
        <p className="text-xs text-slate-500">Identity, wallet & authentication settings</p>
      </div>

      {/* Identity Card */}
      <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-200 text-center">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 font-bold text-xl border border-blue-100">
          {profile?.name ? profile.name.slice(0, 2).toUpperCase() : 'FP'}
        </div>
        <h3 className="text-lg font-bold text-slate-900">{profile?.name || 'Enrolled Student'}</h3>
        <p className="text-xs text-slate-500">{profile?.email || 'No email provided'}</p>

        <div className="mt-4 rounded-xl bg-slate-50 p-3 text-left border border-slate-200 text-xs space-y-2">
          <div className="flex justify-between">
            <span className="text-slate-500">Campus PRN:</span>
            <span className="font-semibold text-slate-900">{profile?.prn}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Role:</span>
            <span className="font-semibold text-blue-600 uppercase">{profile?.role || 'User'}</span>
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-slate-200">
            <span className="text-slate-500">Wallet Address:</span>
            {explorerBaseUrl && profile?.walletAddress ? (
              <a
                href={`${explorerBaseUrl}/address/${profile.walletAddress}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 font-mono text-blue-600 hover:underline"
              >
                <span>
                  {profile.walletAddress.slice(0, 6)}...{profile.walletAddress.slice(-4)}
                </span>
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              <span className="font-mono text-slate-700">
                {profile?.walletAddress
                  ? `${profile.walletAddress.slice(0, 6)}...${profile.walletAddress.slice(-4)}`
                  : 'Derived on-chain'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Security Credentials Card */}
      <div className="rounded-2xl bg-white p-5 shadow-sm border border-slate-200 space-y-3">
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
          Security Credentials
        </h4>

        <div className="flex items-center justify-between py-1">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Fingerprint className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-800">Biometric Passkey</div>
              <div className="text-[11px] text-slate-400">WebAuthn public credential</div>
            </div>
          </div>
          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
            Active
          </span>
        </div>

        <div className="flex items-center justify-between py-1 border-t border-slate-100 pt-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-800">Application PIN</div>
              <div className="text-[11px] text-slate-400">Argon2id with 5-fail lockout</div>
            </div>
          </div>
          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
            Set
          </span>
        </div>
      </div>

      {/* Spending Limits */}
      <div className="rounded-2xl bg-white p-5 shadow-sm border border-slate-200 space-y-2">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          <span>Campus Policy Limits</span>
        </div>
        <div className="flex justify-between text-xs py-1">
          <span className="text-slate-600">Max Single Payment:</span>
          <span className="font-bold text-slate-900">200 CPC</span>
        </div>
        <div className="flex justify-between text-xs py-1 border-t border-slate-100">
          <span className="text-slate-600">Daily Spending Limit:</span>
          <span className="font-bold text-slate-900">500 CPC</span>
        </div>
      </div>

      {/* Logout Action */}
      <button
        onClick={logout}
        className="flex items-center justify-center gap-2 w-full rounded-xl border border-red-200 bg-red-50 py-3 text-sm font-semibold text-red-700 hover:bg-red-100 active:scale-[0.99]"
      >
        <LogOut className="h-4 w-4" />
        Sign Out
      </button>
    </div>
  );
}
