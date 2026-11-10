import { describe, expect, it } from 'vitest';
import { AuditLogInputSchema } from '../src/schemas.js';

describe('AuditLogInputSchema', () => {
  it('accepts only typed operational metadata', () => {
    expect(
      AuditLogInputSchema.parse({
        actorUid: 'firebase-uid',
        action: 'relayer.transaction.submitted',
        meta: { status: 'success', chainId: '31337', amount: '12' },
      }).meta,
    ).toEqual({ status: 'success', chainId: '31337', amount: '12' });
  });

  it('rejects unapproved fields and free-form values that could contain personal data', () => {
    expect(() =>
      AuditLogInputSchema.parse({
        actorUid: 'firebase-uid',
        action: 'user.updated',
        meta: { email: 'person@example.com' },
      }),
    ).toThrow();
    expect(() =>
      AuditLogInputSchema.parse({
        actorUid: 'firebase-uid',
        action: 'user.updated',
        meta: { status: 'person@example.com' },
      }),
    ).toThrow();
  });
});
