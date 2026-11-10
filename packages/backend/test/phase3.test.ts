import { randomUUID } from 'node:crypto';
import express from 'express';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';
import pino from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { createErrorHandler } from '../src/errors.js';
import { loadConfig } from '../src/config.js';
import { createPhase3Router } from '../src/routes/phase3.js';
import type { IdTokenVerifier } from '../src/middleware/auth.js';
import type { AppConfig } from '../src/config.js';
import { deriveWalletAddress } from '../src/services/wallet.js';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';

vi.mock('@simplewebauthn/server', () => ({
  generateAuthenticationOptions: vi.fn(async () => ({
    challenge: 'auth-challenge',
    rpId: 'localhost',
    allowCredentials: [],
  })),
  generateRegistrationOptions: vi.fn(async () => ({
    challenge: 'register-challenge',
    rp: { id: 'localhost', name: 'FingerPay' },
    user: { id: '', name: '', displayName: '' },
    pubKeyCredParams: [],
    timeout: 60_000,
    attestation: 'none',
  })),
  verifyAuthenticationResponse: vi.fn(async () => ({
    verified: true,
    authenticationInfo: { newCounter: 1 },
  })),
  verifyRegistrationResponse: vi.fn(async () => ({
    verified: true,
    registrationInfo: {
      credential: {
        id: 'credential-1',
        publicKey: new Uint8Array([1, 2, 3]),
        counter: 0,
        transports: ['internal'],
      },
      credentialDeviceType: 'singleDevice',
      credentialBackedUp: false,
    },
  })),
}));

const emulator = process.env.FIRESTORE_EMULATOR_HOST;
const integration = describe.skipIf(emulator === undefined)('Phase 3 onboarding API', () => {
  let db: Firestore;
  let config: AppConfig;
  let app: express.Express;
  let baseUrl: string;
  let adminApp: App;
  let server: ReturnType<express.Express['listen']>;
  const projectId = `fingerpay-phase3-${randomUUID()}`;
  const users = new Map<string, { email: string | null; customClaims: Record<string, unknown> }>();
  const verifier: IdTokenVerifier = {
    verifyIdToken: async (token) => {
      if (token === 'bad') throw new Error('invalid token');
      return {
        uid: token === 'admin' ? 'admin-uid' : token,
        role: token === 'admin' ? 'admin' : 'user',
      };
    },
  };

  beforeAll(async () => {
    adminApp = initializeApp({ projectId }, `phase3-${randomUUID()}`);
    process.env.FIRESTORE_EMULATOR_HOST = emulator;
    db = getFirestore(adminApp);
    config = loadConfig({
      NODE_ENV: 'test',
      FIREBASE_PROJECT_ID: projectId,
      FIRESTORE_EMULATOR_HOST: emulator,
      CORS_ORIGINS: 'http://localhost:5173',
      RPC_URL: 'http://127.0.0.1:8545',
      CHAIN_ID: '31337',
      RELAYER_PRIVATE_KEY: `0x${'11'.repeat(32)}`,
      FINGERPAY_ADDRESS: '0x0000000000000000000000000000000000000001',
      CAMPUSCOIN_ADDRESS: '0x0000000000000000000000000000000000000002',
      WALLET_SALT: 'a-secure-local-wallet-salt-value-123456',
      WEBAUTHN_RP_ID: 'localhost',
      WEBAUTHN_RP_NAME: 'FingerPay',
      WEBAUTHN_ORIGIN: 'http://localhost:5173',
    });
    const fakeAuth = {
      getUser: async (uid: string) =>
        users.get(uid) ?? { email: 'student@example.test', customClaims: {} },
      setCustomUserClaims: async (uid: string, claims: Record<string, unknown>) => {
        const record = users.get(uid) ?? { email: 'student@example.test', customClaims: {} };
        record.customClaims = claims;
        users.set(uid, record);
      },
      createCustomToken: async (uid: string) => `custom-${uid}`,
    } as unknown as Auth;
    app = express();
    app.use('/api/admin/prn/import', express.text({ type: 'text/csv' }));
    app.use(express.json());
    app.use(
      '/api',
      createPhase3Router({
        auth: fakeAuth,
        firestore: db,
        verifier,
        config,
        chain: { getTokenBalance: async () => 0n },
        audit: { write: async () => undefined } as never,
      }),
    );
    app.use(createErrorHandler(pino({ level: 'silent' })));
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string')
      throw new Error('Test server did not bind');
    baseUrl = `http://127.0.0.1:${address.port}/api`;
  });

  afterAll(async () => {
    if (server !== undefined)
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    if (adminApp !== undefined) await deleteApp(adminApp);
  });

  it('imports PRNs, rejects unlisted and used PRNs, and atomically creates a pending profile', async () => {
    const prn = `P-${randomUUID()}`;
    const secondPrn = `P-${randomUUID()}`;
    const imported = await fetch(`${baseUrl}/admin/prn/import`, {
      method: 'POST',
      headers: { authorization: 'Bearer admin', 'content-type': 'application/json' },
      body: JSON.stringify({
        records: [
          { prn, name: 'Student' },
          { prn: secondPrn, name: 'Duplicate account' },
        ],
      }),
    });
    expect(imported.status).toBe(201);
    const csvImport = await fetch(`${baseUrl}/admin/prn/import`, {
      method: 'POST',
      headers: { authorization: 'Bearer admin', 'content-type': 'text/csv' },
      body: `prn,name\nCSV-${randomUUID()},CSV Student`,
    });
    expect(csvImport.status).toBe(201);
    const deniedImport = await fetch(`${baseUrl}/admin/prn/import`, {
      method: 'POST',
      headers: { authorization: 'Bearer student', 'content-type': 'application/json' },
      body: JSON.stringify({ records: [{ prn: `DENY-${randomUUID()}`, name: 'Nope' }] }),
    });
    expect(deniedImport.status).toBe(403);
    const uid = `student-${randomUUID()}`;
    const missing = await fetch(`${baseUrl}/auth/signup-profile`, {
      method: 'POST',
      headers: { authorization: `Bearer ${uid}`, 'content-type': 'application/json' },
      body: JSON.stringify({ prn: 'missing' }),
    });
    expect(missing.status).toBe(403);
    const signup = await fetch(`${baseUrl}/auth/signup-profile`, {
      method: 'POST',
      headers: { authorization: `Bearer ${uid}`, 'content-type': 'application/json' },
      body: JSON.stringify({ prn }),
    });
    expect(signup.status).toBe(201);
    const profile = await db.collection('users').doc(uid).get();
    expect(profile.get('status')).toBe('pending');
    expect(profile.get('walletAddress')).toBe(deriveWalletAddress(uid, config.WALLET_SALT));
    const decision = await fetch(`${baseUrl}/admin/users/${uid}/decision`, {
      method: 'POST',
      headers: { authorization: 'Bearer admin', 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'approve' }),
    });
    expect(decision.status).toBe(200);
    expect((await db.collection('users').doc(uid).get()).get('status')).toBe('approved');
    expect(users.get(uid)?.customClaims.role).toBe('user');
    const duplicateAccount = await fetch(`${baseUrl}/auth/signup-profile`, {
      method: 'POST',
      headers: { authorization: `Bearer ${uid}`, 'content-type': 'application/json' },
      body: JSON.stringify({ prn: secondPrn }),
    });
    expect(duplicateAccount.status).toBe(409);
    const replay = await fetch(`${baseUrl}/auth/signup-profile`, {
      method: 'POST',
      headers: { authorization: `Bearer other-${uid}`, 'content-type': 'application/json' },
      body: JSON.stringify({ prn }),
    });
    expect(replay.status).toBe(403);
  });

  it('rejects unauthenticated calls and prevents unapproved users from setting a PIN', async () => {
    const unauth = await fetch(`${baseUrl}/me`);
    expect(unauth.status).toBe(401);
    const uid = `pending-${randomUUID()}`;
    await db.collection('users').doc(uid).set({ status: 'pending', role: 'user' });
    const result = await fetch(`${baseUrl}/pin/set`, {
      method: 'POST',
      headers: { authorization: `Bearer ${uid}`, 'content-type': 'application/json' },
      body: JSON.stringify({ pin: '4682' }),
    });
    expect(result.status).toBe(403);
    const passkey = await fetch(`${baseUrl}/passkey/register/options`, {
      method: 'POST',
      headers: { authorization: `Bearer ${uid}` },
    });
    expect(passkey.status).toBe(403);
  });

  it('sets Argon2id PIN and locks verification after five failures, including the correct PIN', async () => {
    const uid = `approved-${randomUUID()}`;
    await db.collection('users').doc(uid).set({
      status: 'approved',
      role: 'user',
      walletAddress: '0x0000000000000000000000000000000000000001',
    });
    const weak = await fetch(`${baseUrl}/pin/set`, {
      method: 'POST',
      headers: { authorization: `Bearer ${uid}`, 'content-type': 'application/json' },
      body: JSON.stringify({ pin: '1234' }),
    });
    expect(weak.status).toBe(400);
    const set = await fetch(`${baseUrl}/pin/set`, {
      method: 'POST',
      headers: { authorization: `Bearer ${uid}`, 'content-type': 'application/json' },
      body: JSON.stringify({ pin: '4682' }),
    });
    expect(set.status).toBe(201);
    const stored = await db.collection('pinSecrets').doc(uid).get();
    expect(stored.get('hash')).not.toBe('4682');
    const duplicate = await fetch(`${baseUrl}/pin/set`, {
      method: 'POST',
      headers: { authorization: `Bearer ${uid}`, 'content-type': 'application/json' },
      body: JSON.stringify({ pin: '4682' }),
    });
    expect(duplicate.status).toBe(409);
    const me = await fetch(`${baseUrl}/me`, { headers: { authorization: `Bearer ${uid}` } });
    const meBody = (await me.json()) as Record<string, unknown>;
    expect(JSON.stringify(meBody)).not.toContain(String(stored.get('hash')));
    const valid = await fetch(`${baseUrl}/pin/verify`, {
      method: 'POST',
      headers: { authorization: `Bearer ${uid}`, 'content-type': 'application/json' },
      body: JSON.stringify({ pin: '4682' }),
    });
    expect(valid.status).toBe(200);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const wrong = await fetch(`${baseUrl}/pin/verify`, {
        method: 'POST',
        headers: { authorization: `Bearer ${uid}`, 'content-type': 'application/json' },
        body: JSON.stringify({ pin: '9999' }),
      });
      expect(wrong.status).toBe(401);
    }
    const correct = await fetch(`${baseUrl}/pin/verify`, {
      method: 'POST',
      headers: { authorization: `Bearer ${uid}`, 'content-type': 'application/json' },
      body: JSON.stringify({ pin: '4682' }),
    });
    expect(correct.status).toBe(423);
    await db
      .collection('pinSecrets')
      .doc(uid)
      .update({ lockedUntil: Date.now() - 1, failedAttempts: 5 });
    const afterExpiryWrong = await fetch(`${baseUrl}/pin/verify`, {
      method: 'POST',
      headers: { authorization: `Bearer ${uid}`, 'content-type': 'application/json' },
      body: JSON.stringify({ pin: '9999' }),
    });
    expect(afterExpiryWrong.status).toBe(401);
    expect((await db.collection('pinSecrets').doc(uid).get()).get('failedAttempts')).toBe(1);
    const afterExpiryCorrect = await fetch(`${baseUrl}/pin/verify`, {
      method: 'POST',
      headers: { authorization: `Bearer ${uid}`, 'content-type': 'application/json' },
      body: JSON.stringify({ pin: '4682' }),
    });
    expect(afterExpiryCorrect.status).toBe(200);
  });

  it('verifies registered passkeys, binds challenges to the credential owner, and rejects replay', async () => {
    const uid = `passkey-${randomUUID()}`;
    const prn = `PK-${randomUUID()}`;
    await db
      .collection('users')
      .doc(uid)
      .set({
        uid,
        status: 'approved',
        role: 'user',
        name: 'Passkey Student',
        prn,
        webAuthnUserId: Buffer.from(randomUUID()).toString('base64url'),
        walletAddress: '0x0000000000000000000000000000000000000001',
      });
    vi.mocked(verifyRegistrationResponse).mockResolvedValueOnce({ verified: false } as never);
    const invalidOptions = await fetch(`${baseUrl}/passkey/register/options`, {
      method: 'POST',
      headers: { authorization: `Bearer ${uid}` },
    });
    const invalidChallenge = ((await invalidOptions.json()) as { challengeId: string }).challengeId;
    const invalidRegistration = await fetch(`${baseUrl}/passkey/register/verify`, {
      method: 'POST',
      headers: { authorization: `Bearer ${uid}`, 'content-type': 'application/json' },
      body: JSON.stringify({ challengeId: invalidChallenge, response: {} }),
    });
    expect(invalidRegistration.status).toBe(400);

    const optionsResponse = await fetch(`${baseUrl}/passkey/register/options`, {
      method: 'POST',
      headers: { authorization: `Bearer ${uid}` },
    });
    const registration = (await optionsResponse.json()) as { challengeId: string };
    expect(vi.mocked(generateRegistrationOptions).mock.calls.at(-1)?.[0]).toMatchObject({
      rpID: config.WEBAUTHN_RP_ID,
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
    });
    const registrationResponse = await fetch(`${baseUrl}/passkey/register/verify`, {
      method: 'POST',
      headers: { authorization: `Bearer ${uid}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        challengeId: registration.challengeId,
        response: { id: 'credential-1' },
      }),
    });
    expect(registrationResponse.status).toBe(200);
    expect((await db.collection('passkeys').doc('credential-1').get()).get('uid')).toBe(uid);
    expect(vi.mocked(verifyRegistrationResponse).mock.calls.at(-1)?.[0]).toMatchObject({
      expectedOrigin: config.WEBAUTHN_ORIGIN,
      expectedRPID: config.WEBAUTHN_RP_ID,
      requireUserVerification: true,
    });

    const otherUid = `passkey-other-${randomUUID()}`;
    const otherPrn = `PK-${randomUUID()}`;
    await db.collection('users').doc(otherUid).set({ status: 'approved', prn: otherPrn });
    await db
      .collection('passkeys')
      .doc('credential-2')
      .set({
        uid: otherUid,
        publicKey: Buffer.from([1, 2, 3]).toString('base64url'),
        counter: 0,
        transports: [],
      });
    const ownerOptions = await fetch(`${baseUrl}/passkey/auth/options`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prn }),
    });
    const ownerChallenge = (await ownerOptions.json()) as { challengeId: string };
    const wrongOwnerCredential = await fetch(`${baseUrl}/passkey/auth/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        challengeId: ownerChallenge.challengeId,
        response: { id: 'credential-2' },
      }),
    });
    expect(wrongOwnerCredential.status).toBe(401);

    await db.collection('prnAllowlist').doc(prn).set({ used: true });
    const options = await fetch(`${baseUrl}/passkey/auth/options`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prn }),
    });
    const authChallenge = (await options.json()) as { challengeId: string };
    expect(vi.mocked(generateAuthenticationOptions).mock.calls.at(-1)?.[0]).toMatchObject({
      rpID: config.WEBAUTHN_RP_ID,
      userVerification: 'required',
    });
    vi.mocked(verifyAuthenticationResponse).mockResolvedValueOnce({ verified: false } as never);
    const invalidAuth = await fetch(`${baseUrl}/passkey/auth/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        challengeId: authChallenge.challengeId,
        response: { id: 'credential-1' },
      }),
    });
    expect(invalidAuth.status).toBe(401);
    const expiredOptions = await fetch(`${baseUrl}/passkey/auth/options`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prn }),
    });
    const expiredChallenge = (await expiredOptions.json()) as { challengeId: string };
    await db
      .collection('webauthnChallenges')
      .doc(expiredChallenge.challengeId)
      .update({ expiresAt: Timestamp.fromMillis(0) });
    const expired = await fetch(`${baseUrl}/passkey/auth/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        challengeId: expiredChallenge.challengeId,
        response: { id: 'credential-1' },
      }),
    });
    expect(expired.status).toBe(401);
    const validOptions = await fetch(`${baseUrl}/passkey/auth/options`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prn }),
    });
    const validChallenge = (await validOptions.json()) as { challengeId: string };
    const result = await fetch(`${baseUrl}/passkey/auth/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        challengeId: validChallenge.challengeId,
        response: { id: 'credential-1' },
      }),
    });
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ token: `custom-${uid}` });
    const replay = await fetch(`${baseUrl}/passkey/auth/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        challengeId: validChallenge.challengeId,
        response: { id: 'credential-1' },
      }),
    });
    expect(replay.status).toBe(401);
    expect(vi.mocked(verifyAuthenticationResponse).mock.calls.at(-1)?.[0]).toMatchObject({
      expectedOrigin: config.WEBAUTHN_ORIGIN,
      expectedRPID: config.WEBAUTHN_RP_ID,
      requireUserVerification: true,
    });
  });

  it('bounds passkey option issuance per client IP', async () => {
    const uid = `rate-limit-${randomUUID()}`;
    const prn = `RATE-${randomUUID()}`;
    await db.collection('users').doc(uid).set({ status: 'approved', prn });
    await db.collection('passkeys').doc(`rate-${uid}`).set({ uid, publicKey: 'AQID', counter: 0 });
    let rateLimited = false;
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const response = await fetch(`${baseUrl}/passkey/auth/options`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prn }),
      });
      if (response.status === 429) {
        rateLimited = true;
        break;
      }
    }
    expect(rateLimited).toBe(true);
  });
});

void integration;
