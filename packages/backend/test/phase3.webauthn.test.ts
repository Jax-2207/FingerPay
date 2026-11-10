import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
} from '@simplewebauthn/server';

const rpId = 'localhost';
const origin = 'http://localhost:5173';
const credentialId = 'cGFzc2tleS1jcmVkZW50aWFs';
const challenge = Buffer.from('phase3-challenge').toString('base64url');

function cborHead(major: number, value: number): Buffer {
  if (value < 24) return Buffer.from([(major << 5) | value]);
  if (value < 256) return Buffer.from([(major << 5) | 24, value]);
  throw new RangeError('Test CBOR value is too large');
}

function cborInteger(value: number): Buffer {
  return value >= 0 ? cborHead(0, value) : cborHead(1, -1 - value);
}

function cborBytes(value: Buffer): Buffer {
  return Buffer.concat([cborHead(2, value.length), value]);
}

function createCredential() {
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = pair.publicKey.export({ format: 'jwk' });
  if (jwk.x === undefined || jwk.y === undefined) throw new Error('EC coordinates are missing');
  const x = Buffer.from(jwk.x, 'base64url');
  const y = Buffer.from(jwk.y, 'base64url');
  const cosePublicKey = Buffer.concat([
    cborHead(5, 5),
    cborInteger(1),
    cborInteger(2),
    cborInteger(3),
    cborInteger(-7),
    cborInteger(-1),
    cborInteger(1),
    cborInteger(-2),
    cborBytes(x),
    cborInteger(-3),
    cborBytes(y),
  ]);
  return { privateKey: pair.privateKey, publicKey: cosePublicKey };
}

function responseFor(
  privateKey: ReturnType<typeof createCredential>['privateKey'],
  responseOrigin = origin,
): AuthenticationResponseJSON {
  const authenticatorData = Buffer.concat([
    createHash('sha256').update(rpId).digest(),
    Buffer.from([0x05, 0, 0, 0, 1]),
  ]);
  const clientDataJSON = Buffer.from(
    JSON.stringify({
      type: 'webauthn.get',
      challenge,
      origin: responseOrigin,
      crossOrigin: false,
    }),
  );
  const signature = sign(
    'sha256',
    Buffer.concat([authenticatorData, createHash('sha256').update(clientDataJSON).digest()]),
    privateKey,
  );
  return {
    id: credentialId,
    rawId: credentialId,
    type: 'public-key',
    clientExtensionResults: {},
    response: {
      authenticatorData: authenticatorData.toString('base64url'),
      clientDataJSON: clientDataJSON.toString('base64url'),
      signature: signature.toString('base64url'),
    },
  };
}

describe('SimpleWebAuthn verifier checks real assertions', () => {
  it('accepts a correctly signed UV assertion and rejects an invalid signature', async () => {
    const credential = createCredential();
    const response = responseFor(credential.privateKey);
    const verified = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpId,
      requireUserVerification: true,
      credential: { id: credentialId, publicKey: credential.publicKey, counter: 0, transports: [] },
    });
    expect(verified.verified).toBe(true);
    expect(verified.authenticationInfo.newCounter).toBe(1);

    const invalidSignature = {
      ...response,
      response: { ...response.response, signature: Buffer.alloc(64).toString('base64url') },
    };
    await expect(
      verifyAuthenticationResponse({
        response: invalidSignature,
        expectedChallenge: challenge,
        expectedOrigin: origin,
        expectedRPID: rpId,
        requireUserVerification: true,
        credential: {
          id: credentialId,
          publicKey: credential.publicKey,
          counter: 0,
          transports: [],
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects assertions with a different origin or RP ID', async () => {
    const credential = createCredential();
    const validResponse = responseFor(credential.privateKey);
    const input = {
      response: validResponse,
      expectedChallenge: challenge,
      requireUserVerification: true,
      credential: { id: credentialId, publicKey: credential.publicKey, counter: 0, transports: [] },
    };
    await expect(
      verifyAuthenticationResponse({
        ...input,
        expectedOrigin: 'https://attacker.example',
        expectedRPID: rpId,
      }),
    ).rejects.toThrow();
    await expect(
      verifyAuthenticationResponse({
        ...input,
        expectedOrigin: origin,
        expectedRPID: 'attacker.example',
      }),
    ).rejects.toThrow();
  });
});
