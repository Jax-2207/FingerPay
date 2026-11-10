import { auth } from './firebase.js';

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

const FRIENDLY_MESSAGES: Record<string, string> = {
  SYSTEM_PAUSED: 'FingerPay is temporarily paused by administration for maintenance.',
  INTENT_NOT_FOUND: 'Payment request not found or invalid QR code.',
  INTENT_EXPIRED: 'Payment request has expired. Please ask the merchant to generate a new QR code.',
  INTENT_ALREADY_USED: 'This payment has already been processed.',
  INTENT_NOT_AVAILABLE: 'This payment request is no longer available.',
  SELF_PAYMENT: 'Cannot pay your own merchant account.',
  INSUFFICIENT_BALANCE: 'Insufficient CPC balance. Please top up at the Campus Accounts office.',
  INVALID_PIN: 'Incorrect application PIN. Please try again.',
  PIN_LOCKED: 'Account temporarily locked due to failed PIN attempts. Try again in 15 minutes.',
  PASSKEY_INVALID: 'Biometric verification failed. Please try again.',
  PASSKEY_REQUIRED: 'Passkey not found. Please register your device passkey first.',
  DAILY_LIMIT_EXCEEDED: 'Daily spending limit exceeded (max 500 CPC/day).',
  PAYMENT_LIMIT_EXCEEDED: 'Single payment exceeds maximum limit (max 200 CPC).',
  RATE_LIMITED: 'Too many requests. Please wait a moment and try again.',
  PRN_INVALID: 'PRN is not available or not on the approved campus allowlist.',
  PROFILE_EXISTS: 'Profile is already registered for this account.',
  ACCOUNT_NOT_APPROVED: 'Account is pending approval from Campus Accounts.',
  UNAUTHORIZED: 'Session expired or unauthenticated. Please log in.',
  FORBIDDEN: 'Access forbidden for your current role.',
};

export function formatErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return FRIENDLY_MESSAGES[error.code] || error.message || 'An unexpected error occurred.';
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred.';
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

async function fetchWithAuth(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const token = await auth.currentUser?.getIdToken();

  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorData: { error?: { code?: string; message?: string } } = {};
    try {
      errorData = (await response.json()) as typeof errorData;
    } catch {
      // response was not JSON
    }
    const code = errorData.error?.code || 'UNKNOWN_ERROR';
    const message = errorData.error?.message || response.statusText || 'Request failed';
    throw new ApiError(response.status, code, message);
  }

  return response;
}

export interface StudentProfile {
  uid: string;
  name: string;
  email: string | null;
  prn: string;
  role: string;
  status: 'pending' | 'approved' | 'rejected';
  walletAddress: string;
  balance: string;
  passkeyRegistered: boolean;
  pinSet: boolean;
}

export interface PaymentIntentDetails {
  id: string;
  intentId: string;
  merchantUid: string;
  merchantAddress: string;
  merchantName: string;
  category?: string;
  amount: string;
  expiry: number;
  status: 'created' | 'submitted' | 'confirmed' | 'failed' | 'expired';
}

export interface WebAuthnOptionsPayload {
  challengeId: string;
  options: unknown;
}

export interface TransactionRecord {
  id: string;
  intentId?: string;
  userUid?: string;
  merchantUid?: string;
  merchantAddress?: string;
  merchantName?: string;
  userAddress?: string;
  amount: string;
  category?: string;
  status: string;
  txHash?: string;
  type?: string;
  createdAt?: string | { _seconds: number };
}

export interface SpendingAnalytics {
  totalSpent: number;
  totalsByCategory: Record<string, number>;
  totalsByDay: Record<string, number>;
}

export const api = {
  async getMe(): Promise<StudentProfile> {
    const res = await fetchWithAuth('/me');
    return (await res.json()) as StudentProfile;
  },

  async signupProfile(prn: string): Promise<{ status: string }> {
    const res = await fetchWithAuth('/auth/signup-profile', {
      method: 'POST',
      body: JSON.stringify({ prn }),
    });
    return (await res.json()) as { status: string };
  },

  async getPasskeyRegisterOptions(): Promise<WebAuthnOptionsPayload> {
    const res = await fetchWithAuth('/passkey/register/options', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    return (await res.json()) as WebAuthnOptionsPayload;
  },

  async verifyPasskeyRegister(
    challengeId: string,
    response: unknown,
  ): Promise<{ verified: boolean }> {
    const res = await fetchWithAuth('/passkey/register/verify', {
      method: 'POST',
      body: JSON.stringify({ challengeId, response }),
    });
    return (await res.json()) as { verified: boolean };
  },

  async setPin(pin: string): Promise<{ pinSet: boolean }> {
    const res = await fetchWithAuth('/pin/set', {
      method: 'POST',
      body: JSON.stringify({ pin }),
    });
    return (await res.json()) as { pinSet: boolean };
  },

  async getPaymentIntent(intentId: string): Promise<PaymentIntentDetails> {
    const res = await fetchWithAuth(`/intents/${encodeURIComponent(intentId)}`);
    return (await res.json()) as PaymentIntentDetails;
  },

  async getPaymentAuthOptions(intentId: string): Promise<WebAuthnOptionsPayload> {
    const res = await fetchWithAuth(`/intents/${encodeURIComponent(intentId)}/auth-options`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    return (await res.json()) as WebAuthnOptionsPayload;
  },

  async confirmPayment(
    intentId: string,
    payload: {
      challengeId: string;
      pin: string;
      assertion: unknown;
    },
  ): Promise<{ status: string; txHash: string; intentId: string }> {
    const res = await fetchWithAuth(`/intents/${encodeURIComponent(intentId)}/confirm`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return (await res.json()) as { status: string; txHash: string; intentId: string };
  },

  async getHistory(limit = 20): Promise<{ transactions: TransactionRecord[] }> {
    const res = await fetchWithAuth(`/history?limit=${limit}`);
    return (await res.json()) as { transactions: TransactionRecord[] };
  },

  async getSpendingAnalytics(): Promise<SpendingAnalytics> {
    const res = await fetchWithAuth('/analytics/spending');
    return (await res.json()) as SpendingAnalytics;
  },
};
