import { describe, expect, it } from 'vitest';
import { generateAuthenticationOptions } from '@simplewebauthn/server';

describe('payment WebAuthn challenge encoding', () => {
  it('base64url-encodes raw 32-byte challenge input exactly once', async () => {
    const challenge = Uint8Array.from({ length: 32 }, (_, index) => index);
    const options = await generateAuthenticationOptions({
      rpID: 'localhost',
      challenge,
      userVerification: 'required',
      allowCredentials: [],
    });

    expect(Buffer.from(options.challenge, 'base64url')).toEqual(Buffer.from(challenge));
    expect(Buffer.from(options.challenge, 'base64url')).toHaveLength(32);
    expect(Buffer.from(options.challenge, 'base64url').toString('base64url')).toBe(
      options.challenge,
    );
  });
});
