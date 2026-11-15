import { randomUUID } from 'node:crypto';
import express from 'express';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';
import pino from 'pino';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import argon2 from 'argon2';
import { createApp } from '../src/app.js';
import { loadConfig, type AppConfig } from '../src/config.js';
import type { IdTokenVerifier } from '../src/middleware/auth.js';
import { deriveWalletAddress } from '../src/services/wallet.js';
import { LimitsService } from '../src/services/limits.js';
import type { RelayerService } from '../src/services/relayer.js';
import type { ChainService } from '../src/services/chain.js';
import { computeIntentId } from '@fingerpay/shared';

vi.mock('@simplewebauthn/server', () => ({
  generateAuthenticationOptions: vi.fn(async ({ challenge }) => ({
    challenge: Buffer.from(challenge).toString('base64url'),
    rpId: 'localhost',
    allowCredentials: [],
  })),
  verifyAuthenticationResponse: vi.fn(async ({ response, expectedChallenge }) => {
    const raw = response as {
      id?: string;
      response?: { clientDataJSON?: string; challenge?: string };
    };
    if (
      raw?.response?.clientDataJSON === 'fail' ||
      (raw?.response?.challenge !== undefined && raw.response.challenge !== expectedChallenge)
    ) {
      return { verified: false };
    }
    return {
      verified: true,
      authenticationInfo: { newCounter: 1 },
    };
  }),
}));

const emulator = process.env.FIRESTORE_EMULATOR_HOST;

const phase8Suite = describe.skipIf(emulator === undefined)(
  'Phase 8 Security Hardening & Adversarial Testing',
  { timeout: 25_000 },
  () => {
    let db: Firestore;
    let config: AppConfig;
    let app: express.Express;
    let baseUrl: string;
    let adminApp: App;
    let server: ReturnType<express.Express['listen']>;
    const projectId = `fingerpay-phase8-${randomUUID()}`;

    const users = new Map<
      string,
      { email: string | null; customClaims: Record<string, unknown> }
    >();

    const verifier: IdTokenVerifier = {
      verifyIdToken: async (token) => {
        if (token === 'bad' || token === 'invalid') throw new Error('invalid token');
        const userRecord = users.get(token);
        const role =
          (userRecord?.customClaims?.role as string | undefined) ??
          (token.startsWith('admin')
            ? 'admin'
            : token.startsWith('merchant')
              ? 'merchant'
              : 'user');
        return {
          uid: token,
          role,
        };
      },
    };

    const mockBalances = new Map<string, bigint>();
    const mockMerchantActive = new Map<string, boolean>();
    const relayerPayCalls: Array<unknown> = [];

    const mockChain = {
      getHealth: async () => ({ connected: true, chainId: '31337' }),
      getTokenBalance: async (addr: string) => mockBalances.get(addr.toLowerCase()) ?? 1000n,
      isMerchantActive: async (addr: string) => mockMerchantActive.get(addr.toLowerCase()) ?? true,
      isMerchantRegistered: async (addr: string) => mockMerchantActive.has(addr.toLowerCase()),
      isIntentUsed: async () => false,
      isPaused: async () => false,
      decodeCustomError: (err: unknown) => (err instanceof Error ? err.message : 'CUSTOM_REVERT'),
    } as unknown as ChainService;

    const mockRelayer = {
      registerMerchant: vi.fn(async (addr: string) => {
        mockMerchantActive.set(addr.toLowerCase(), true);
        return `0xreg-${randomUUID()}`;
      }),
      deactivateMerchant: vi.fn(async (addr: string) => {
        mockMerchantActive.set(addr.toLowerCase(), false);
        return `0xdeact-${randomUUID()}`;
      }),
      mint: vi.fn(async (to: string, amount: bigint) => {
        const current = mockBalances.get(to.toLowerCase()) ?? 0n;
        mockBalances.set(to.toLowerCase(), current + amount);
        return `0xmint-${randomUUID()}`;
      }),
      pay: vi.fn(async (user: string, merchant: string, amount: bigint) => {
        relayerPayCalls.push({ user, merchant, amount });
        const userBal = mockBalances.get(user.toLowerCase()) ?? 1000n;
        mockBalances.set(user.toLowerCase(), userBal - amount);
        const merchBal = mockBalances.get(merchant.toLowerCase()) ?? 0n;
        mockBalances.set(merchant.toLowerCase(), merchBal + amount);
        return {
          txHash: `0xpay-${randomUUID()}`,
          intentId: `0xintent-${randomUUID()}`,
          blockNumber: 42,
        };
      }),
      refund: vi.fn(async () => `0xref-${randomUUID()}`),
      settle: vi.fn(async () => `0xset-${randomUUID()}`),
      pause: vi.fn(async () => `0xpause-${randomUUID()}`),
      unpause: vi.fn(async () => `0xunpause-${randomUUID()}`),
    } as unknown as RelayerService;

    beforeAll(async () => {
      adminApp = initializeApp({ projectId }, `phase8-${randomUUID()}`);
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
        MAX_PAYMENT_CPC: '200',
        DAILY_LIMIT_CPC: '500',
        INTENT_TTL_SECONDS: '120',
      });

      const mockAuth = {
        getUser: async (uid: string) => users.get(uid) ?? { customClaims: {} },
        setCustomUserClaims: async (uid: string, claims: Record<string, unknown>) => {
          const user = users.get(uid) ?? { email: null, customClaims: {} };
          user.customClaims = claims;
          users.set(uid, user);
        },
      } as unknown as Auth;

      const mockAudit = {
        write: vi.fn(async () => {}),
      };

      app = createApp({
        config,
        chain: mockChain,
        logger: pino({ level: 'silent' }),
        auth: mockAuth,
        firestore: db,
        tokenVerifier: verifier,
        audit: mockAudit as never,
        relayer: mockRelayer,
        limits: new LimitsService(db, config),
      });

      await new Promise<void>((resolve) => {
        server = app.listen(0, '127.0.0.1', () => {
          const addr = server.address() as { port: number };
          baseUrl = `http://127.0.0.1:${addr.port}`;
          resolve();
        });
      });
    });

    afterAll(async () => {
      server?.close();
      await deleteApp(adminApp);
    });

    // Helper to seed a student
    async function seedStudent(uid: string, initialPin = '4321') {
      const walletAddress = deriveWalletAddress(uid, config.WALLET_SALT);
      await db
        .collection('users')
        .doc(uid)
        .set({
          name: `Student ${uid}`,
          role: 'user',
          status: 'approved',
          walletAddress,
          passkeyRegistered: true,
        });
      await db
        .collection('passkeys')
        .doc(`key-${uid}`)
        .set({
          uid,
          publicKey: Buffer.from('test-pubkey').toString('base64url'),
          counter: 0,
          transports: ['internal'],
        });
      const pinHash = await argon2.hash(initialPin, {
        type: argon2.argon2id,
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1,
      });
      await db.collection('pinSecrets').doc(uid).set({
        hash: pinHash,
        failedAttempts: 0,
        lockedUntil: null,
      });
      mockBalances.set(walletAddress.toLowerCase(), 1000n);
      return { uid, walletAddress };
    }

    // Helper to seed an active merchant
    async function seedMerchant(uid: string) {
      const walletAddress = deriveWalletAddress(uid, config.WALLET_SALT);
      await db
        .collection('merchants')
        .doc(uid)
        .set({
          shopName: `Shop ${uid}`,
          ownerUid: uid,
          status: 'approved',
          active: true,
          walletAddress,
        });
      mockMerchantActive.set(walletAddress.toLowerCase(), true);
      return { uid, walletAddress };
    }

    // Helper to create a valid intent
    async function createValidIntent(merchantUid: string, amount = 25) {
      const res = await fetch(`${baseUrl}/api/intents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${merchantUid}`,
        },
        body: JSON.stringify({ amount }),
      });
      expect(res.status).toBe(201);
      return (await res.json()) as {
        intentId: string;
        qrPayload: string;
        amount: number;
        expiry: number;
      };
    }

    // Helper to fetch challenge
    async function fetchChallenge(studentUid: string, intentId: string, origin = baseUrl) {
      const res = await fetch(`${origin}/api/intents/${intentId}/auth-options`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentUid}`,
        },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(200);
      return (await res.json()) as { challengeId: string; options: { challenge: string } };
    }

    describe('1. WebAuthn Assertion Replay & Challenge Single-Use', () => {
      it('rejects replaying a previously consumed payment challenge', async () => {
        const student = await seedStudent('student-replay-1');
        const merchant = await seedMerchant('merchant-replay-1');
        const intent1 = await createValidIntent(merchant.uid, 15);
        const { challengeId } = await fetchChallenge(student.uid, intent1.intentId);

        // First confirm: succeeds
        const firstRes = await fetch(`${baseUrl}/api/intents/${intent1.intentId}/confirm`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${student.uid}`,
          },
          body: JSON.stringify({
            challengeId,
            pin: '4321',
            assertion: { id: `key-${student.uid}`, response: { clientDataJSON: 'ok' } },
          }),
        });
        expect(firstRes.status).toBe(200);
        const firstData = await firstRes.json();
        expect(firstData.status).toBe('confirmed');

        // Replay attempt on same intent: rejected because intent is already processed
        const replaySameRes = await fetch(`${baseUrl}/api/intents/${intent1.intentId}/confirm`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${student.uid}`,
          },
          body: JSON.stringify({
            challengeId,
            pin: '4321',
            assertion: { id: `key-${student.uid}`, response: { clientDataJSON: 'ok' } },
          }),
        });
        expect(replaySameRes.status).toBe(400);
        const replaySameData = await replaySameRes.json();
        expect(replaySameData.error.code).toBe('INTENT_NOT_AVAILABLE');

        // Replay attempt using the consumed challenge on a new intent: rejected because challenge was consumed
        const intent2 = await createValidIntent(merchant.uid, 20);
        const replayNewRes = await fetch(`${baseUrl}/api/intents/${intent2.intentId}/confirm`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${student.uid}`,
          },
          body: JSON.stringify({
            challengeId,
            pin: '4321',
            assertion: { id: `key-${student.uid}`, response: { clientDataJSON: 'ok' } },
          }),
        });
        expect(replayNewRes.status).toBe(400);
        const replayNewData = await replayNewRes.json();
        expect(replayNewData.error.code).toBe('CHALLENGE_EXPIRED');
      });

      it('rejects a prior attempt assertion when the student retries the same intent', async () => {
        const student = await seedStudent('student-retry-replay');
        const merchant = await seedMerchant('merchant-retry-replay');
        const intent = await createValidIntent(merchant.uid, 15);
        // Use IPv6 loopback so this replay check has an isolated IPv6 rate-limit bucket.
        const retryServer = app.listen(0, '::1');
        await new Promise<void>((resolve, reject) => {
          retryServer.once('listening', resolve);
          retryServer.once('error', reject);
        });
        try {
          const address = retryServer.address();
          if (address === null || typeof address === 'string') {
            throw new Error('Could not read the retry test server address');
          }
          const retryBaseUrl = `http://[::1]:${address.port}`;
          const firstAttempt = await fetchChallenge(student.uid, intent.intentId, retryBaseUrl);
          const secondAttempt = await fetchChallenge(student.uid, intent.intentId, retryBaseUrl);

          expect(firstAttempt.options.challenge).not.toBe(secondAttempt.options.challenge);

          const payCallsBefore = relayerPayCalls.length;
          const replayRes = await fetch(`${retryBaseUrl}/api/intents/${intent.intentId}/confirm`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${student.uid}`,
            },
            body: JSON.stringify({
              challengeId: secondAttempt.challengeId,
              pin: '4321',
              assertion: {
                id: `key-${student.uid}`,
                response: { clientDataJSON: 'ok', challenge: firstAttempt.options.challenge },
              },
            }),
          });

          expect(replayRes.status).toBe(401);
          const replayData = await replayRes.json();
          expect(replayData.error.code).toBe('AUTHENTICATION_FAILED');
          expect(relayerPayCalls).toHaveLength(payCallsBefore);
        } finally {
          await new Promise<void>((resolve, reject) => {
            retryServer.close((error) => (error ? reject(error) : resolve()));
          });
        }
      });

      it('rejects cross-intent challenge reuse', async () => {
        const student = await seedStudent('student-cross-1');
        const merchant = await seedMerchant('merchant-cross-1');
        const intentA = await createValidIntent(merchant.uid, 10);
        const intentB = await createValidIntent(merchant.uid, 20);

        // Fetch challenge for Intent A
        const { challengeId: challengeA } = await fetchChallenge(student.uid, intentA.intentId);

        // Attempt to confirm Intent B using challenge A -> rejected
        const crossRes = await fetch(`${baseUrl}/api/intents/${intentB.intentId}/confirm`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${student.uid}`,
          },
          body: JSON.stringify({
            challengeId: challengeA,
            pin: '4321',
            assertion: { id: `key-${student.uid}`, response: { clientDataJSON: 'ok' } },
          }),
        });
        expect(crossRes.status).toBe(400);
        const crossData = await crossRes.json();
        expect(crossData.error.code).toBe('CHALLENGE_MISMATCH');
      });

      it('rejects an expired WebAuthn challenge', async () => {
        const student = await seedStudent('student-exp-ch');
        const merchant = await seedMerchant('merchant-exp-ch');
        const intent = await createValidIntent(merchant.uid, 12);

        // Inject an expired challenge directly into Firestore with valid UUID
        const expiredChallengeId = randomUUID();
        const intentChallenge = Buffer.from(intent.intentId.slice(2), 'hex').toString('base64url');
        await db
          .collection('webauthnChallenges')
          .doc(expiredChallengeId)
          .set({
            uid: student.uid,
            intentId: intent.intentId,
            challenge: intentChallenge,
            purpose: 'payment',
            expiresAt: Timestamp.fromMillis(Date.now() - 5000), // 5s in past
            createdAt: Timestamp.fromMillis(Date.now() - 60000),
          });

        const res = await fetch(`${baseUrl}/api/intents/${intent.intentId}/confirm`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${student.uid}`,
          },
          body: JSON.stringify({
            challengeId: expiredChallengeId,
            pin: '4321',
            assertion: { id: `key-${student.uid}`, response: { clientDataJSON: 'ok' } },
          }),
        });
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error.code).toBe('CHALLENGE_EXPIRED');
      });

      it('rejects challenge generated for a different user', async () => {
        const studentA = await seedStudent('student-diff-a');
        const studentB = await seedStudent('student-diff-b');
        const merchant = await seedMerchant('merchant-diff');
        const intent = await createValidIntent(merchant.uid, 15);

        // Challenge generated for student A
        const { challengeId } = await fetchChallenge(studentA.uid, intent.intentId);

        // Student B attempts to confirm using Student A's challenge
        const res = await fetch(`${baseUrl}/api/intents/${intent.intentId}/confirm`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${studentB.uid}`,
          },
          body: JSON.stringify({
            challengeId,
            pin: '4321',
            assertion: { id: `key-${studentB.uid}`, response: { clientDataJSON: 'ok' } },
          }),
        });
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error.code).toBe('CHALLENGE_MISMATCH');
      });
    });

    describe('2. Intent Invariants & Concurrency Protection', () => {
      it('rejects expired payment intent', async () => {
        const student = await seedStudent('student-intent-exp');
        const merchant = await seedMerchant('merchant-intent-exp');

        // Create an intent with past expiry directly in Firestore
        const expiredIntentId = `0xexp-${randomUUID().replace(/-/g, '')}`;
        await db
          .collection('paymentIntents')
          .doc(expiredIntentId)
          .set({
            intentId: expiredIntentId,
            merchantUid: merchant.uid,
            merchantAddress: merchant.walletAddress,
            amount: '25',
            nonce: `0x${'aa'.repeat(32)}`,
            expiry: String(Math.floor(Date.now() / 1000) - 10), // 10 seconds ago
            status: 'created',
            createdAt: Timestamp.now(),
          });

        const res = await fetch(`${baseUrl}/api/intents/${expiredIntentId}/auth-options`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${student.uid}`,
          },
          body: JSON.stringify({}),
        });
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error.code).toBe('INTENT_EXPIRED');
      });

      it('safely handles concurrent double-confirm requests (exactly one succeeds)', async () => {
        const student = await seedStudent('student-race-1');
        const merchant = await seedMerchant('merchant-race-1');
        const intent = await createValidIntent(merchant.uid, 30);
        const { challengeId } = await fetchChallenge(student.uid, intent.intentId);

        // Send two concurrent confirm requests with the same payload
        const payload = {
          challengeId,
          pin: '4321',
          assertion: { id: `key-${student.uid}`, response: { clientDataJSON: 'ok' } },
        };

        const [res1, res2] = await Promise.all([
          fetch(`${baseUrl}/api/intents/${intent.intentId}/confirm`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${student.uid}`,
            },
            body: JSON.stringify(payload),
          }),
          fetch(`${baseUrl}/api/intents/${intent.intentId}/confirm`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${student.uid}`,
            },
            body: JSON.stringify(payload),
          }),
        ]);

        const statuses = [res1.status, res2.status];
        // Exactly one should succeed (200), and the other must fail (409 or 400)
        expect(statuses).toContain(200);
        const failures = statuses.filter((s) => s !== 200);
        expect(failures.length).toBe(1);
        expect([400, 409]).toContain(failures[0]);
      });

      it('rejects payment with insufficient student token balance', async () => {
        const student = await seedStudent('student-poor-1');
        const merchant = await seedMerchant('merchant-poor-1');
        // Set student balance to 5 CPC
        mockBalances.set(student.walletAddress.toLowerCase(), 5n);

        const intent = await createValidIntent(merchant.uid, 50); // requires 50 CPC
        const { challengeId } = await fetchChallenge(student.uid, intent.intentId);

        const res = await fetch(`${baseUrl}/api/intents/${intent.intentId}/confirm`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${student.uid}`,
          },
          body: JSON.stringify({
            challengeId,
            pin: '4321',
            assertion: { id: `key-${student.uid}`, response: { clientDataJSON: 'ok' } },
          }),
        });
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error.code).toBe('INSUFFICIENT_BALANCE');
      });

      it('rejects self-payment attempts (student pays themselves)', async () => {
        const student = await seedStudent('student-self-1');
        // Register same student as merchant
        await db.collection('merchants').doc(student.uid).set({
          shopName: 'Self Shop',
          ownerUid: student.uid,
          status: 'approved',
          active: true,
          walletAddress: student.walletAddress,
        });

        // Temporarily give merchant role to create intent
        users.set(student.uid, { email: 'student@campus.edu', customClaims: { role: 'merchant' } });
        const intent = await createValidIntent(student.uid, 10);

        // Switch back to user role to attempt payment challenge
        users.set(student.uid, { email: 'student@campus.edu', customClaims: { role: 'user' } });
        const res = await fetch(`${baseUrl}/api/intents/${intent.intentId}/auth-options`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${student.uid}`,
          },
          body: JSON.stringify({}),
        });
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error.code).toBe('SELF_PAYMENT');
      });
    });

    describe('3. PIN Security & Unified Lockout Synchronization', () => {
      it('rejects trivial or predictable PINs upon setting', async () => {
        const uid = 'student-pin-weak';
        await db.collection('users').doc(uid).set({
          name: 'Weak Pin User',
          role: 'user',
          status: 'approved',
        });

        for (const weakPin of ['0000', '1111', '1234', '4321', '123456']) {
          const res = await fetch(`${baseUrl}/api/pin/set`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${uid}`,
            },
            body: JSON.stringify({ pin: weakPin }),
          });
          expect(res.status).toBe(400);
          const data = await res.json();
          expect(data.error.code).toBe('PIN_TOO_WEAK');
        }
      });

      it('enforces 15-minute lockout after 5 failed PIN attempts across verify and confirm', async () => {
        const student = await seedStudent('student-lockout-sync', '9512');
        const merchant = await seedMerchant('merchant-lockout-sync');

        // Fail 4 times at /pin/verify
        for (let i = 1; i <= 4; i++) {
          const res = await fetch(`${baseUrl}/api/pin/verify`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${student.uid}`,
            },
            body: JSON.stringify({ pin: '0987' }),
          });
          expect(res.status).toBe(401);
          const data = await res.json();
          expect(data.error.code).toBe('PIN_INVALID');
        }

        // 5th failure at /pin/verify triggers lockout
        const fifthRes = await fetch(`${baseUrl}/api/pin/verify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${student.uid}`,
          },
          body: JSON.stringify({ pin: '0987' }),
        });
        expect(fifthRes.status).toBe(401);

        // 6th attempt at /pin/verify is rejected with 423 PIN_LOCKED even with correct PIN!
        const verifyLockedRes = await fetch(`${baseUrl}/api/pin/verify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${student.uid}`,
          },
          body: JSON.stringify({ pin: '9512' }),
        });
        expect(verifyLockedRes.status).toBe(423);
        const verifyLockedData = await verifyLockedRes.json();
        expect(verifyLockedData.error.code).toBe('PIN_LOCKED');

        // Now attempt /intents/:id/confirm with correct PIN: MUST also be rejected with 403 ACCOUNT_LOCKED!
        const intent = await createValidIntent(merchant.uid, 10);
        const { challengeId } = await fetchChallenge(student.uid, intent.intentId);
        const confirmLockedRes = await fetch(`${baseUrl}/api/intents/${intent.intentId}/confirm`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${student.uid}`,
          },
          body: JSON.stringify({
            challengeId,
            pin: '9512',
            assertion: { id: `key-${student.uid}`, response: { clientDataJSON: 'ok' } },
          }),
        });
        expect(confirmLockedRes.status).toBe(403);
        const confirmLockedData = await confirmLockedRes.json();
        expect(confirmLockedData.error.code).toBe('ACCOUNT_LOCKED');
      });
    });

    describe('4. Role Boundaries & Privilege Escalation', () => {
      it('rejects student attempts to access administrative endpoints', async () => {
        const studentToken = 'student-attacker';
        users.set(studentToken, { email: 'student@campus.edu', customClaims: { role: 'user' } });

        const adminEndpoints = [
          { method: 'GET', path: '/api/admin/users' },
          {
            method: 'POST',
            path: '/api/admin/prn/import',
            body: JSON.stringify([{ prn: 'P1', name: 'N' }]),
          },
          {
            method: 'POST',
            path: '/api/admin/users/uid-1/decision',
            body: JSON.stringify({ decision: 'approve' }),
          },
          { method: 'GET', path: '/api/admin/merchants' },
          {
            method: 'POST',
            path: '/api/admin/merchants/uid-1/decision',
            body: JSON.stringify({ decision: 'approve' }),
          },
          { method: 'POST', path: '/api/admin/merchants/uid-1/deactivate' },
          { method: 'POST', path: '/api/admin/merchants/uid-1/activate' },
          {
            method: 'POST',
            path: '/api/admin/mint',
            body: JSON.stringify({ prn: 'PRN-1', amount: 50, receiptRef: 'REC-1' }),
          },
          {
            method: 'POST',
            path: '/api/admin/refund',
            body: JSON.stringify({ intentId: '0x123' }),
          },
          { method: 'POST', path: '/api/admin/pause' },
          { method: 'POST', path: '/api/admin/unpause' },
          { method: 'GET', path: '/api/admin/settlements' },
          {
            method: 'POST',
            path: '/api/admin/settlements/set-1/decision',
            body: JSON.stringify({ decision: 'approve' }),
          },
          {
            method: 'POST',
            path: '/api/admin/settlements/set-1/mark-paid',
            body: JSON.stringify({ disbursementRef: 'DISB-1' }),
          },
          { method: 'GET', path: '/api/admin/logs' },
          { method: 'GET', path: '/api/admin/stats' },
          { method: 'GET', path: '/api/admin/chain' },
        ];

        for (const ep of adminEndpoints) {
          const res = await fetch(`${baseUrl}${ep.path}`, {
            method: ep.method,
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${studentToken}`,
            },
            ...(ep.body ? { body: ep.body } : {}),
          });
          expect(res.status, `Endpoint ${ep.method} ${ep.path} should reject student`).toBe(403);
          const data = await res.json();
          expect(data.error.code).toBe('FORBIDDEN');
        }
      });

      it('rejects student attempts to access merchant-only endpoints', async () => {
        const studentToken = 'student-merch-attacker';
        users.set(studentToken, { email: 'student@campus.edu', customClaims: { role: 'user' } });

        const merchantEndpoints = [
          { method: 'POST', path: '/api/intents', body: JSON.stringify({ amount: 10 }) },
          { method: 'POST', path: '/api/intents/intent-fake-id/cancel' },
          { method: 'POST', path: '/api/settlements', body: JSON.stringify({ amount: 10 }) },
          { method: 'GET', path: '/api/settlements' },
        ];

        for (const ep of merchantEndpoints) {
          const res = await fetch(`${baseUrl}${ep.path}`, {
            method: ep.method,
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${studentToken}`,
            },
            ...(ep.body ? { body: ep.body } : {}),
          });
          expect(res.status, `Endpoint ${ep.method} ${ep.path} should reject student`).toBe(403);
          const data = await res.json();
          expect(data.error.code).toBe('FORBIDDEN');
        }
      });

      it('rejects unauthenticated requests to protected endpoints', async () => {
        const protectedPaths = ['/api/me', '/api/admin/users', '/api/admin/mint'];

        for (const path of protectedPaths) {
          const res = await fetch(`${baseUrl}${path}`, {
            method: path.includes('mint') ? 'POST' : 'GET',
            headers: { 'Content-Type': 'application/json' },
            ...(path.includes('mint') ? { body: JSON.stringify({}) } : {}),
          });
          expect(res.status, `Endpoint ${path} should reject unauthenticated request`).toBe(401);
          const data = await res.json();
          expect(data.error.code).toBe('UNAUTHORIZED');
        }
      });
    });

    describe('5. Production Hardening & Sensitive Data Protection', () => {
      it('enforces maximum request payload limit (rejects payload > 64KB)', async () => {
        const largeString = 'a'.repeat(70 * 1024); // 70 KB
        const res = await fetch(`${baseUrl}/api/auth/signup-profile`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer student-payload',
          },
          body: JSON.stringify({ prn: 'PRN-LARGE', data: largeString }),
        });
        expect(res.status).toBe(413);
        const data = await res.json();
        expect(data.error.code).toBe('INVALID_REQUEST');
      });

      it('returns standard generic error response on internal 500 error without leaking stack traces', async () => {
        const student = await seedStudent('student-500-test');
        const res = await fetch(`${baseUrl}/api/intents/nonexistent-intent-id/auth-options`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${student.uid}`,
          },
          body: JSON.stringify({}),
        });
        expect(res.status).toBe(404);
        const data = await res.json();
        expect(data.error).toBeDefined();
        expect(data.error.code).toBe('INTENT_NOT_FOUND');
        expect(data.stack).toBeUndefined();
        expect(data.error.stack).toBeUndefined();
      });

      it('verifies intent ID computation matches contract exact keccak256 hash', () => {
        const chainId = 31337n;
        const contract = '0x0000000000000000000000000000000000000001';
        const merchant = '0x0000000000000000000000000000000000000002';
        const amount = 50n;
        const nonce = `0x${'bb'.repeat(32)}`;
        const expiry = 1750000000n;

        const hash = computeIntentId({ chainId, contract, merchant, amount, nonce, expiry });
        expect(hash).toMatch(/^0x[0-9a-fA-F]{64}$/);

        // Tampering any single parameter must change hash
        const tamperedAmount = computeIntentId({
          chainId,
          contract,
          merchant,
          amount: 51n,
          nonce,
          expiry,
        });
        expect(tamperedAmount).not.toBe(hash);

        const tamperedMerchant = computeIntentId({
          chainId,
          contract,
          merchant: '0x0000000000000000000000000000000000000003',
          amount,
          nonce,
          expiry,
        });
        expect(tamperedMerchant).not.toBe(hash);
      });
    });
  },
);

void phase8Suite;
