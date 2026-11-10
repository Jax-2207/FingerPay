import { describe, expect, it } from 'vitest';
import { ApiError, formatErrorMessage } from '../src/api.js';

describe('Frontend API Error Mapping', () => {
  it('maps known backend error codes to user-friendly messages', () => {
    const pausedError = new ApiError(503, 'SYSTEM_PAUSED', 'System paused');
    expect(formatErrorMessage(pausedError)).toBe(
      'FingerPay is temporarily paused by administration for maintenance.',
    );

    const balanceError = new ApiError(400, 'INSUFFICIENT_BALANCE', 'Insufficient balance');
    expect(formatErrorMessage(balanceError)).toBe(
      'Insufficient CPC balance. Please top up at the Campus Accounts office.',
    );

    const pinLocked = new ApiError(423, 'PIN_LOCKED', 'Pin locked');
    expect(formatErrorMessage(pinLocked)).toBe(
      'Account temporarily locked due to failed PIN attempts. Try again in 15 minutes.',
    );

    const expiredError = new ApiError(400, 'INTENT_EXPIRED', 'Intent expired');
    expect(formatErrorMessage(expiredError)).toBe(
      'Payment request has expired. Please ask the merchant to generate a new QR code.',
    );

    const usedError = new ApiError(409, 'INTENT_ALREADY_USED', 'Already used');
    expect(formatErrorMessage(usedError)).toBe('This payment has already been processed.');

    const prnInvalid = new ApiError(403, 'PRN_INVALID', 'PRN invalid');
    expect(formatErrorMessage(prnInvalid)).toBe(
      'PRN is not available or not on the approved campus allowlist.',
    );

    const selfPay = new ApiError(400, 'SELF_PAYMENT', 'Self payment');
    expect(formatErrorMessage(selfPay)).toBe('Cannot pay your own merchant account.');
  });

  it('falls back to error message or default for unknown codes', () => {
    const unknownError = new ApiError(500, 'CUSTOM_ERROR', 'A custom failure occurred');
    expect(formatErrorMessage(unknownError)).toBe('A custom failure occurred');

    const genericError = new Error('Network offline');
    expect(formatErrorMessage(genericError)).toBe('Network offline');

    expect(formatErrorMessage('string failure')).toBe('An unexpected error occurred.');
  });
});
