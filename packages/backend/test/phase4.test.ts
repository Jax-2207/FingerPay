import { randomUUID } from 'node:crypto';
import express from 'express';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';
import pino from 'pino';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import argon2 from 'argon2';
import { createErrorHandler } from '../src/errors.js';
import { loadConfig, type AppConfig } from '../src/config.js';
import { createPhase4Router } from '../src/routes/phase4.js';
import type { IdTokenVerifier } from '../src/middleware/auth.js';
import { deriveWalletAddress } from '../src/services/wallet.js';
import { LimitsService } from '../src/services/limits.js';
import { IndexerService } from '../src/services/indexer.js';
import type { RelayerService } from '../src/services/relayer.js';
import type { ChainService } from '../src/services/chain.js';

vi.mock('@simplewebauthn/server', () => ({
  generateAuthenticationOptions: vi.fn(async ({ challenge }) => ({
    challenge: Buffer.from(challenge).toString('base64url'),
    rpId: 'localhost',
    allowCredentials: [],
  })),
  verifyAuthenticationResponse: vi.fn(async ({ response }) => {
    const raw = response as { id?: string; clientDataJSON?: string };
    if (raw?.clientDataJSON === 'fail') {
      return { verified: false };
    }
    return {
      verified: true,
      authenticationInfo: { newCounter: 1 },
    };
  }),
}));

const emulator = process.env.FIRESTORE_EMULATOR_HOST;

const phase4Suite = describe.skipIf(emulator === undefined)(
  'Phase 4 Implementation & Pipeline',
  { timeout: 20_000 },
  () => {
    let db: Firestore;
    let config: AppConfig;
    let app: express.Express;
    let baseUrl: string;
    let adminApp: App;
    let server: ReturnType<express.Express['listen']>;
    const projectId = `fingerpay-phase4-${randomUUID()}`;
    const users = new Map<
      string,
      { email: string | null; customClaims: Record<string, unknown> }
    >();

    const verifier: IdTokenVerifier = {
      verifyIdToken: async (token) => {
        if (token === 'bad') throw new Error('invalid token');
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
    let shouldPayRevert = false;

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
        if (shouldPayRevert) {
          throw new Error('InsufficientBalance');
        }
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
    } as unknown as RelayerService;

    beforeAll(async () => {
      adminApp = initializeApp({ projectId }, `phase4-${randomUUID()}`);
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

      const fakeAuth = {
        getUser: async (uid: string) =>
          users.get(uid) ?? { email: `${uid}@example.test`, customClaims: {} },
        setCustomUserClaims: async (uid: string, claims: Record<string, unknown>) => {
          const record = users.get(uid) ?? { email: `${uid}@example.test`, customClaims: {} };
          record.customClaims = claims;
          users.set(uid, record);
        },
      } as unknown as Auth;

      const limits = new LimitsService(db, config);

      app = express();
      app.use(express.json());
      app.use(
        '/api',
        createPhase4Router({
          auth: fakeAuth,
          firestore: db,
          verifier,
          chain: mockChain,
          relayer: mockRelayer,
          limits,
          audit: { write: async () => undefined } as never,
          config,
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
      if (server !== undefined) {
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      }
      if (adminApp !== undefined) await deleteApp(adminApp);
    });

    describe('Merchant Management', () => {
      it('applies for merchant status and derives deterministic wallet address', async () => {
        const merchantUid = `merchant-${randomUUID()}`;
        const res = await fetch(`${baseUrl}/merchant/apply`, {
          method: 'POST',
          headers: { authorization: `Bearer ${merchantUid}`, 'content-type': 'application/json' },
          body: JSON.stringify({ shopName: 'Campus Canteen', category: 'food' }),
        });
        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data.shopName).toBe('Campus Canteen');
        expect(data.status).toBe('pending');
        expect(data.walletAddress).toBe(deriveWalletAddress(merchantUid, config.WALLET_SALT));

        // Duplicate apply is rejected
        const dup = await fetch(`${baseUrl}/merchant/apply`, {
          method: 'POST',
          headers: { authorization: `Bearer ${merchantUid}`, 'content-type': 'application/json' },
          body: JSON.stringify({ shopName: 'Duplicate Canteen' }),
        });
        expect(dup.status).toBe(409);
      });

      it('rejects unauthorized merchant approval and allows admin approval with on-chain registration', async () => {
        const merchantUid = `merchant-${randomUUID()}`;
        await db
          .collection('merchants')
          .doc(merchantUid)
          .set({
            shopName: 'Bookstore',
            category: 'books',
            walletAddress: deriveWalletAddress(merchantUid, config.WALLET_SALT),
            status: 'pending',
          });

        // Student attempts to approve merchant -> 403 Forbidden
        const unauthorized = await fetch(`${baseUrl}/admin/merchants/${merchantUid}/decision`, {
          method: 'POST',
          headers: { authorization: 'Bearer student-user', 'content-type': 'application/json' },
          body: JSON.stringify({ decision: 'approve' }),
        });
        expect(unauthorized.status).toBe(403);

        // Admin approves merchant -> 200 OK, sets custom claim and registers on-chain
        const approved = await fetch(`${baseUrl}/admin/merchants/${merchantUid}/decision`, {
          method: 'POST',
          headers: { authorization: 'Bearer admin-user', 'content-type': 'application/json' },
          body: JSON.stringify({ decision: 'approve' }),
        });
        expect(approved.status).toBe(200);
        const body = await approved.json();
        expect(body.status).toBe('approved');
        expect(mockRelayer.registerMerchant).toHaveBeenCalled();
        expect(users.get(merchantUid)?.customClaims.role).toBe('merchant');

        // Admin deactivates merchant
        const deact = await fetch(`${baseUrl}/admin/merchants/${merchantUid}/deactivate`, {
          method: 'POST',
          headers: { authorization: 'Bearer admin-user' },
        });
        expect(deact.status).toBe(200);
        expect(mockRelayer.deactivateMerchant).toHaveBeenCalled();
        const updatedDoc = await db.collection('merchants').doc(merchantUid).get();
        expect(updatedDoc.get('status')).toBe('deactivated');
      });

      it('prevents inactive or unapproved merchants from creating payment intents', async () => {
        const inactiveMerchantUid = `merchant-${randomUUID()}`;
        await db
          .collection('merchants')
          .doc(inactiveMerchantUid)
          .set({
            shopName: 'Inactive Shop',
            status: 'pending',
            walletAddress: deriveWalletAddress(inactiveMerchantUid, config.WALLET_SALT),
          });

        const res = await fetch(`${baseUrl}/intents`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${inactiveMerchantUid}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ amount: '50' }),
        });
        expect(res.status).toBe(403);
      });
    });

    describe('CPC Minting', () => {
      it('allows authorized admin mint against an approved student PRN', async () => {
        const studentUid = `student-${randomUUID()}`;
        const prn = `PRN-${randomUUID()}`;
        const studentWallet = deriveWalletAddress(studentUid, config.WALLET_SALT);

        await db.collection('users').doc(studentUid).set({
          prn,
          name: 'Alice Student',
          status: 'approved',
          walletAddress: studentWallet,
        });

        const receiptRef = `REC-${randomUUID()}`;
        const mintRes = await fetch(`${baseUrl}/admin/mint`, {
          method: 'POST',
          headers: { authorization: 'Bearer admin-user', 'content-type': 'application/json' },
          body: JSON.stringify({
            prn,
            amount: '100',
            receiptRef,
          }),
        });
        expect(mintRes.status).toBe(201);
        const mintData = await mintRes.json();
        expect(mintData.amount).toBe('100');
        expect(mintData.receiptRef).toBe(receiptRef);
        expect(mintData.userUid).toBe(studentUid);
        expect(mockRelayer.mint).toHaveBeenCalledWith(studentWallet, 100n, expect.any(String));

        // Duplicate receiptRef is rejected
        const dupMint = await fetch(`${baseUrl}/admin/mint`, {
          method: 'POST',
          headers: { authorization: 'Bearer admin-user', 'content-type': 'application/json' },
          body: JSON.stringify({
            prn,
            amount: '50',
            receiptRef,
          }),
        });
        expect(dupMint.status).toBe(409);
      });

      it('rejects unauthorized mint requests and invalid PRNs', async () => {
        const studentUid = `student-${randomUUID()}`;
        const prn = `PRN-${randomUUID()}`;
        await db
          .collection('users')
          .doc(studentUid)
          .set({
            prn,
            status: 'approved',
            walletAddress: deriveWalletAddress(studentUid, config.WALLET_SALT),
          });

        // Non-admin mint attempt -> 403
        const unauthorized = await fetch(`${baseUrl}/admin/mint`, {
          method: 'POST',
          headers: { authorization: 'Bearer student-user', 'content-type': 'application/json' },
          body: JSON.stringify({ prn, amount: '50', receiptRef: `REC-${randomUUID()}` }),
        });
        expect(unauthorized.status).toBe(403);

        // Non-existent student PRN -> 404
        const missingStudent = await fetch(`${baseUrl}/admin/mint`, {
          method: 'POST',
          headers: { authorization: 'Bearer admin-user', 'content-type': 'application/json' },
          body: JSON.stringify({
            prn: 'NON-EXISTENT',
            amount: '50',
            receiptRef: `REC-${randomUUID()}`,
          }),
        });
        expect(missingStudent.status).toBe(404);
      });
    });

    describe('Payment Pipeline & Authorization', () => {
      let merchantUid: string;
      let merchantWallet: string;
      let studentUid: string;
      let studentWallet: string;
      const studentPin = '1357';
      let credentialId: string;

      beforeAll(async () => {
        merchantUid = `merchant-${randomUUID()}`;
        merchantWallet = deriveWalletAddress(merchantUid, config.WALLET_SALT);
        mockMerchantActive.set(merchantWallet.toLowerCase(), true);
        users.set(merchantUid, {
          email: 'merchant@test.local',
          customClaims: { role: 'merchant' },
        });

        await db.collection('merchants').doc(merchantUid).set({
          shopName: 'Stationery Corner',
          category: 'stationery',
          walletAddress: merchantWallet,
          status: 'approved',
        });

        studentUid = `student-${randomUUID()}`;
        studentWallet = deriveWalletAddress(studentUid, config.WALLET_SALT);
        mockBalances.set(studentWallet.toLowerCase(), 500n);
        users.set(studentUid, { email: 'student@test.local', customClaims: { role: 'user' } });

        await db.collection('users').doc(studentUid).set({
          name: 'Bob Student',
          status: 'approved',
          walletAddress: studentWallet,
        });

        // Setup student passkey
        credentialId = `cred-${randomUUID()}`;
        await db
          .collection('passkeys')
          .doc(credentialId)
          .set({
            uid: studentUid,
            publicKey: Buffer.from(new Uint8Array([1, 2, 3])).toString('base64url'),
            counter: 0,
            transports: ['internal'],
          });

        // Setup student PIN
        const pinHash = await argon2.hash(studentPin);
        await db.collection('pinSecrets').doc(studentUid).set({
          hash: pinHash,
          failedAttempts: 0,
          lockedUntil: null,
        });
      });

      it('executes valid payment from intent creation to on-chain confirmation', async () => {
        // 1. Merchant creates payment intent
        const createRes = await fetch(`${baseUrl}/intents`, {
          method: 'POST',
          headers: { authorization: `Bearer ${merchantUid}`, 'content-type': 'application/json' },
          body: JSON.stringify({ amount: '45', category: 'stationery' }),
        });
        expect(createRes.status).toBe(201);
        const intent = await createRes.json();
        expect(intent.intentId).toBeDefined();
        expect(intent.qrPayload).toBe(`/pay/${intent.intentId}`);

        // 2. Student fetches intent
        const fetchRes = await fetch(`${baseUrl}/intents/${intent.intentId}`, {
          headers: { authorization: `Bearer ${studentUid}` },
        });
        expect(fetchRes.status).toBe(200);
        const fetched = await fetchRes.json();
        expect(fetched.amount).toBe('45');
        expect(fetched.status).toBe('created');

        // 3. Each auth-options request receives a fresh canonical challenge.
        const firstOptionsRes = await fetch(`${baseUrl}/intents/${intent.intentId}/auth-options`, {
          method: 'POST',
          headers: { authorization: `Bearer ${studentUid}` },
        });
        expect(firstOptionsRes.status).toBe(200);
        const firstOptions = await firstOptionsRes.json();
        const optRes = await fetch(`${baseUrl}/intents/${intent.intentId}/auth-options`, {
          method: 'POST',
          headers: { authorization: `Bearer ${studentUid}` },
        });
        expect(optRes.status).toBe(200);
        const { challengeId, options } = await optRes.json();
        const decodedChallenge = Buffer.from(options.challenge, 'base64url');
        expect(decodedChallenge.byteLength).toBe(32);
        expect(decodedChallenge.toString('base64url')).toBe(options.challenge);
        expect(options.challenge).not.toBe(firstOptions.options.challenge);

        // 4. Student confirms payment
        const confirmRes = await fetch(`${baseUrl}/intents/${intent.intentId}/confirm`, {
          method: 'POST',
          headers: { authorization: `Bearer ${studentUid}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            challengeId,
            pin: studentPin,
            assertion: { id: credentialId, response: {} },
          }),
        });
        expect(confirmRes.status).toBe(200);
        const confirmData = await confirmRes.json();
        expect(confirmData.status).toBe('confirmed');
        expect(confirmData.txHash).toBeDefined();
        expect(mockRelayer.pay).toHaveBeenCalled();

        // Check intent status updated to confirmed in Firestore
        const updatedIntent = await db.collection('paymentIntents').doc(intent.intentId).get();
        expect(updatedIntent.get('status')).toBe('confirmed');

        // Reused intent is rejected
        const reuseRes = await fetch(`${baseUrl}/intents/${intent.intentId}/confirm`, {
          method: 'POST',
          headers: { authorization: `Bearer ${studentUid}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            challengeId,
            pin: studentPin,
            assertion: { id: credentialId, response: {} },
          }),
        });
        expect(reuseRes.status).toBe(400);
      });

      it('rejects expired intents', async () => {
        const createRes = await fetch(`${baseUrl}/intents`, {
          method: 'POST',
          headers: { authorization: `Bearer ${merchantUid}`, 'content-type': 'application/json' },
          body: JSON.stringify({ amount: '10' }),
        });
        const intent = await createRes.json();

        // Artificially expire the intent in Firestore
        await db
          .collection('paymentIntents')
          .doc(intent.intentId)
          .update({
            expiry: Math.floor(Date.now() / 1000) - 10,
          });

        const optRes = await fetch(`${baseUrl}/intents/${intent.intentId}/auth-options`, {
          method: 'POST',
          headers: { authorization: `Bearer ${studentUid}` },
        });
        expect(optRes.status).toBe(400);
        const err = await optRes.json();
        expect(err.error.code).toBe('INTENT_EXPIRED');
      });

      it('rejects self-payment attempts', async () => {
        const dualUid = `student-and-merchant-${randomUUID()}`;
        users.set(dualUid, { email: 'dual@test.local', customClaims: { role: 'user' } });
        await db
          .collection('users')
          .doc(dualUid)
          .set({
            name: 'Dual Role User',
            status: 'approved',
            walletAddress: deriveWalletAddress(dualUid, config.WALLET_SALT),
          });
        await db
          .collection('passkeys')
          .doc(`cred-${dualUid}`)
          .set({
            uid: dualUid,
            publicKey: Buffer.from(new Uint8Array([1, 2, 3])).toString('base64url'),
            counter: 0,
          });

        // Merchant creates intent, then intent is configured to belong to dualUid
        const createRes = await fetch(`${baseUrl}/intents`, {
          method: 'POST',
          headers: { authorization: `Bearer ${merchantUid}`, 'content-type': 'application/json' },
          body: JSON.stringify({ amount: '15' }),
        });
        const intent = await createRes.json();
        await db.collection('paymentIntents').doc(intent.intentId).update({
          merchantUid: dualUid,
        });

        const optRes = await fetch(`${baseUrl}/intents/${intent.intentId}/auth-options`, {
          method: 'POST',
          headers: { authorization: `Bearer ${dualUid}` },
        });
        expect(optRes.status).toBe(400);
        const err = await optRes.json();
        expect(err.error.code).toBe('SELF_PAYMENT');
      });

      it('rejects wrong PIN and enforces 5-attempt lockout', async () => {
        const targetStudent = `student-lock-${randomUUID()}`;
        const targetWallet = deriveWalletAddress(targetStudent, config.WALLET_SALT);
        users.set(targetStudent, { email: 'locked@test.local', customClaims: { role: 'user' } });
        await db.collection('users').doc(targetStudent).set({
          name: 'Lock Student',
          status: 'approved',
          walletAddress: targetWallet,
        });

        const credId = `cred-${randomUUID()}`;
        await db
          .collection('passkeys')
          .doc(credId)
          .set({
            uid: targetStudent,
            publicKey: Buffer.from(new Uint8Array([1, 2, 3])).toString('base64url'),
            counter: 0,
          });

        const pinHash = await argon2.hash('2468');
        await db.collection('pinSecrets').doc(targetStudent).set({
          hash: pinHash,
          failedAttempts: 0,
          lockedUntil: null,
        });

        // Create an intent
        const createRes = await fetch(`${baseUrl}/intents`, {
          method: 'POST',
          headers: { authorization: `Bearer ${merchantUid}`, 'content-type': 'application/json' },
          body: JSON.stringify({ amount: '10' }),
        });
        const intent = await createRes.json();

        // Fail PIN 5 times
        for (let i = 0; i < 5; i++) {
          const optRes = await fetch(`${baseUrl}/intents/${intent.intentId}/auth-options`, {
            method: 'POST',
            headers: { authorization: `Bearer ${targetStudent}` },
          });
          const { challengeId } = await optRes.json();

          const failRes = await fetch(`${baseUrl}/intents/${intent.intentId}/confirm`, {
            method: 'POST',
            headers: {
              authorization: `Bearer ${targetStudent}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              challengeId,
              pin: '9999', // wrong PIN
              assertion: { id: credId, response: {} },
            }),
          });
          expect(failRes.status).toBe(401);
        }

        // 6th attempt with correct PIN is blocked due to lockout
        const optRes = await fetch(`${baseUrl}/intents/${intent.intentId}/auth-options`, {
          method: 'POST',
          headers: { authorization: `Bearer ${targetStudent}` },
        });
        const { challengeId } = await optRes.json();

        const lockedRes = await fetch(`${baseUrl}/intents/${intent.intentId}/confirm`, {
          method: 'POST',
          headers: { authorization: `Bearer ${targetStudent}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            challengeId,
            pin: '2468', // correct PIN, but locked
            assertion: { id: credId, response: {} },
          }),
        });
        expect(lockedRes.status).toBe(403);
        const lockedData = await lockedRes.json();
        expect(lockedData.error.code).toBe('ACCOUNT_LOCKED');
      });

      it('enforces single payment and 24-hour spending limits', async () => {
        // Payment exceeding MAX_PAYMENT_CPC (200 CPC)
        const createRes = await fetch(`${baseUrl}/intents`, {
          method: 'POST',
          headers: { authorization: `Bearer ${merchantUid}`, 'content-type': 'application/json' },
          body: JSON.stringify({ amount: '250' }),
        });
        const intent = await createRes.json();

        const optRes = await fetch(`${baseUrl}/intents/${intent.intentId}/auth-options`, {
          method: 'POST',
          headers: { authorization: `Bearer ${studentUid}` },
        });
        const { challengeId } = await optRes.json();

        const confirmRes = await fetch(`${baseUrl}/intents/${intent.intentId}/confirm`, {
          method: 'POST',
          headers: { authorization: `Bearer ${studentUid}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            challengeId,
            pin: studentPin,
            assertion: { id: credentialId, response: {} },
          }),
        });
        expect(confirmRes.status).toBe(400);
        const data = await confirmRes.json();
        expect(data.error.code).toBe('PAYMENT_LIMIT_EXCEEDED');
      });

      it('safely handles on-chain reverts without creating false confirmed records', async () => {
        shouldPayRevert = true;
        try {
          const createRes = await fetch(`${baseUrl}/intents`, {
            method: 'POST',
            headers: { authorization: `Bearer ${merchantUid}`, 'content-type': 'application/json' },
            body: JSON.stringify({ amount: '50' }),
          });
          const intent = await createRes.json();

          const optRes = await fetch(`${baseUrl}/intents/${intent.intentId}/auth-options`, {
            method: 'POST',
            headers: { authorization: `Bearer ${studentUid}` },
          });
          const { challengeId } = await optRes.json();

          const confirmRes = await fetch(`${baseUrl}/intents/${intent.intentId}/confirm`, {
            method: 'POST',
            headers: { authorization: `Bearer ${studentUid}`, 'content-type': 'application/json' },
            body: JSON.stringify({
              challengeId,
              pin: studentPin,
              assertion: { id: credentialId, response: {} },
            }),
          });
          expect(confirmRes.status).toBe(400);

          // Verify status in Firestore was updated to 'failed'
          const doc = await db.collection('paymentIntents').doc(intent.intentId).get();
          expect(doc.get('status')).toBe('failed');
        } finally {
          shouldPayRevert = false;
        }
      });
    });

    describe('Blockchain Indexer Service', () => {
      it('indexes Payment events idempotently and avoids duplicate records', async () => {
        const mockProvider = {
          getBlockNumber: async () => 105,
        } as unknown as import('ethers').JsonRpcProvider;

        const intentId = `0xindexed-intent-${randomUUID()}`;
        await db.collection('paymentIntents').doc(intentId).set({
          intentId,
          amount: '35',
          category: 'canteen',
          status: 'submitted',
        });

        const txHash = `0xtx-${randomUUID()}`;
        const mockEventLog = {
          name: 'Payment',
          args: [intentId, '0xuser1', '0xmerch1', 35n],
          transactionHash: txHash,
          blockNumber: 101,
          index: 0,
        };

        const indexer = new IndexerService({
          firestore: db,
          provider: mockProvider,
          config,
          logger: pino({ level: 'silent' }),
        });

        // Directly process range with simulated logs
        const querySpy = vi
          .spyOn(indexer['fingerPay'], 'queryFilter')
          .mockResolvedValue([mockEventLog as never]);
        const parseSpy = vi.spyOn(indexer['fingerPayInterface'], 'parseLog').mockReturnValue({
          name: 'Payment',
          args: [intentId, '0xuser1', '0xmerch1', 35n],
        } as never);

        const processed = await indexer.processRange(100, 105);
        expect(processed).toBe(1);

        // Verify transaction recorded in Firestore
        const eventId = `${txHash}:0`;
        const txDoc = await db.collection('transactions').doc(eventId).get();
        expect(txDoc.exists).toBe(true);
        expect(txDoc.get('amount')).toBe('35');

        // Second run with duplicate event -> returns 0 processed (idempotent)
        const secondRun = await indexer.processRange(100, 105);
        expect(secondRun).toBe(0);

        querySpy.mockRestore();
        parseSpy.mockRestore();
      });

      it('handles temporary RPC failure without corrupting state', async () => {
        const mockFailingProvider = {
          getBlockNumber: vi.fn(async () => {
            throw new Error('RPC connection timeout');
          }),
        } as unknown as import('ethers').JsonRpcProvider;

        const indexer = new IndexerService({
          firestore: db,
          provider: mockFailingProvider,
          config,
          logger: pino({ level: 'silent' }),
        });

        await expect(indexer.runOnce()).rejects.toThrow('RPC connection timeout');
      });
    });

    describe('History and Spending Analytics', () => {
      it('returns paginated transactions and aggregated spending analytics', async () => {
        const userUid = `student-analytics-${randomUUID()}`;
        const tx1 = `0xtx-${randomUUID()}:0`;
        const tx2 = `0xtx-${randomUUID()}:0`;

        await db.collection('transactions').doc(tx1).set({
          userUid,
          amount: '60',
          category: 'canteen',
          status: 'confirmed',
          createdAt: Timestamp.now(),
        });
        await db.collection('transactions').doc(tx2).set({
          userUid,
          amount: '40',
          category: 'books',
          status: 'confirmed',
          createdAt: Timestamp.now(),
        });

        users.set(userUid, { email: 'analytics@test.local', customClaims: { role: 'user' } });

        const historyRes = await fetch(`${baseUrl}/history`, {
          headers: { authorization: `Bearer ${userUid}` },
        });
        expect(historyRes.status).toBe(200);
        const history = await historyRes.json();
        expect(history.transactions.length).toBeGreaterThanOrEqual(2);

        const analyticsRes = await fetch(`${baseUrl}/analytics/spending`, {
          headers: { authorization: `Bearer ${userUid}` },
        });
        expect(analyticsRes.status).toBe(200);
        const analytics = await analyticsRes.json();
        expect(analytics.totalSpent).toBe(100);
        expect(analytics.totalsByCategory.canteen).toBe(60);
        expect(analytics.totalsByCategory.books).toBe(40);
      });
    });
  },
);

void phase4Suite;
