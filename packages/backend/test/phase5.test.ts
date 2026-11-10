import { randomUUID } from 'node:crypto';
import express from 'express';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import pino from 'pino';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createErrorHandler } from '../src/errors.js';
import { loadConfig, type AppConfig } from '../src/config.js';
import { createPhase5Router } from '../src/routes/phase5.js';
import type { IdTokenVerifier } from '../src/middleware/auth.js';
import { deriveWalletAddress } from '../src/services/wallet.js';
import { IndexerService } from '../src/services/indexer.js';
import type { RelayerService } from '../src/services/relayer.js';
import type { ChainService } from '../src/services/chain.js';

const emulator = process.env.FIRESTORE_EMULATOR_HOST;

const phase5Suite = describe.skipIf(emulator === undefined)(
  'Phase 5 Refunds, Settlements & Controls',
  { timeout: 20_000 },
  () => {
    let db: Firestore;
    let config: AppConfig;
    let app: express.Express;
    let baseUrl: string;
    let adminApp: App;
    let server: ReturnType<express.Express['listen']>;
    const projectId = `fingerpay-phase5-${randomUUID()}`;
    const users = new Map<string, { email: string | null; role: string }>();

    const verifier: IdTokenVerifier = {
      verifyIdToken: async (token) => {
        if (token === 'bad') throw new Error('invalid token');
        const user = users.get(token);
        const role =
          user?.role ??
          (token.startsWith('admin')
            ? 'admin'
            : token.startsWith('merchant')
              ? 'merchant'
              : 'user');
        return { uid: token, role };
      },
    };

    const mockBalances = new Map<string, bigint>();
    let isPausedState = false;
    let shouldRefundRevert = false;
    let shouldSettleRevert = false;

    const mockChain = {
      getHealth: async () => ({ connected: true, chainId: '31337' }),
      getTokenBalance: async (addr: string) => mockBalances.get(addr.toLowerCase()) ?? 1000n,
      isPaused: async () => isPausedState,
      decodeCustomError: (err: unknown) => (err instanceof Error ? err.message : 'CUSTOM_REVERT'),
    } as unknown as ChainService;

    const mockRelayer = {
      refund: vi.fn(async () => {
        if (shouldRefundRevert) {
          throw new Error('InsufficientBalance');
        }
        return `0xrefund-${randomUUID()}`;
      }),
      settle: vi.fn(async (merchant: string, amount: bigint) => {
        if (shouldSettleRevert) {
          throw new Error('InsufficientBalance');
        }
        const current = mockBalances.get(merchant.toLowerCase()) ?? 1000n;
        mockBalances.set(merchant.toLowerCase(), current - amount);
        return `0xsettle-${randomUUID()}`;
      }),
      pause: vi.fn(async () => {
        isPausedState = true;
        return `0xpause-${randomUUID()}`;
      }),
      unpause: vi.fn(async () => {
        isPausedState = false;
        return `0xunpause-${randomUUID()}`;
      }),
    } as unknown as RelayerService;

    beforeAll(async () => {
      adminApp = initializeApp({ projectId }, `phase5-${randomUUID()}`);
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

      app = express();
      app.use(express.json());
      app.use(
        '/api',
        createPhase5Router({
          firestore: db,
          verifier,
          chain: mockChain,
          relayer: mockRelayer,
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

    describe('Payment Refunds', () => {
      it('executes valid admin refund, updates intent and transaction records', async () => {
        const intentId = `0x${'aa'.repeat(32)}`;
        await db.collection('paymentIntents').doc(intentId).set({
          intentId,
          amount: '50',
          status: 'confirmed',
          merchantUid: 'merch-1',
          userUid: 'user-1',
        });

        await db.collection('transactions').doc(`tx-${intentId}:0`).set({
          intentId,
          amount: '50',
          status: 'confirmed',
          refunded: false,
        });

        const res = await fetch(`${baseUrl}/admin/refund`, {
          method: 'POST',
          headers: { authorization: 'Bearer admin-user', 'content-type': 'application/json' },
          body: JSON.stringify({ intentId }),
        });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.status).toBe('refunded');
        expect(data.txHash).toBeDefined();
        expect(mockRelayer.refund).toHaveBeenCalledWith(intentId);

        // Verify Firestore records updated
        const updatedIntent = await db.collection('paymentIntents').doc(intentId).get();
        expect(updatedIntent.get('status')).toBe('refunded');
        expect(updatedIntent.get('refundTxHash')).toBe(data.txHash);

        const updatedTx = await db.collection('transactions').doc(`tx-${intentId}:0`).get();
        expect(updatedTx.get('refunded')).toBe(true);

        // Duplicate refund is rejected
        const dupRes = await fetch(`${baseUrl}/admin/refund`, {
          method: 'POST',
          headers: { authorization: 'Bearer admin-user', 'content-type': 'application/json' },
          body: JSON.stringify({ intentId }),
        });
        expect(dupRes.status).toBe(400);
        const dupData = await dupRes.json();
        expect(dupData.error.code).toBe('ALREADY_REFUNDED');
      });

      it('rejects unauthorized refund requests', async () => {
        const intentId = `0x${'bb'.repeat(32)}`;
        await db.collection('paymentIntents').doc(intentId).set({
          intentId,
          amount: '20',
          status: 'confirmed',
        });

        const res = await fetch(`${baseUrl}/admin/refund`, {
          method: 'POST',
          headers: { authorization: 'Bearer student-user', 'content-type': 'application/json' },
          body: JSON.stringify({ intentId }),
        });
        expect(res.status).toBe(403);
      });

      it('prevents refund of unconfirmed payments', async () => {
        const intentId = `0x${'cc'.repeat(32)}`;
        await db.collection('paymentIntents').doc(intentId).set({
          intentId,
          amount: '30',
          status: 'created', // not confirmed
        });

        const res = await fetch(`${baseUrl}/admin/refund`, {
          method: 'POST',
          headers: { authorization: 'Bearer admin-user', 'content-type': 'application/json' },
          body: JSON.stringify({ intentId }),
        });
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error.code).toBe('CANNOT_REFUND');
      });

      it('handles failed blockchain refund safely without marking success', async () => {
        shouldRefundRevert = true;
        try {
          const intentId = `0x${'dd'.repeat(32)}`;
          await db.collection('paymentIntents').doc(intentId).set({
            intentId,
            amount: '100',
            status: 'confirmed',
          });

          const res = await fetch(`${baseUrl}/admin/refund`, {
            method: 'POST',
            headers: { authorization: 'Bearer admin-user', 'content-type': 'application/json' },
            body: JSON.stringify({ intentId }),
          });
          expect(res.status).toBe(400);

          // Ensure intent status was not changed to refunded
          const doc = await db.collection('paymentIntents').doc(intentId).get();
          expect(doc.get('status')).toBe('confirmed');
        } finally {
          shouldRefundRevert = false;
        }
      });
    });

    describe('Merchant Settlement', () => {
      let merchantUid: string;
      let merchantWallet: string;

      beforeAll(async () => {
        merchantUid = `merchant-settle-${randomUUID()}`;
        merchantWallet = deriveWalletAddress(merchantUid, config.WALLET_SALT);
        users.set(merchantUid, { email: 'settle@merchant.test', role: 'merchant' });

        await db.collection('merchants').doc(merchantUid).set({
          shopName: 'Cafeteria',
          status: 'approved',
          walletAddress: merchantWallet,
        });

        mockBalances.set(merchantWallet.toLowerCase(), 400n);
      });

      it('allows valid merchant settlement request and prevents requests exceeding available balance', async () => {
        // Request 150 CPC out of 400 CPC balance
        const req1 = await fetch(`${baseUrl}/settlements`, {
          method: 'POST',
          headers: { authorization: `Bearer ${merchantUid}`, 'content-type': 'application/json' },
          body: JSON.stringify({ amount: '150' }),
        });
        expect(req1.status).toBe(201);
        const settle1 = await req1.json();
        expect(settle1.amount).toBe('150');
        expect(settle1.status).toBe('requested');

        // Request 300 CPC -> Exceeds (150 pending + 300 = 450 > 400) -> 400 Bad Request
        const req2 = await fetch(`${baseUrl}/settlements`, {
          method: 'POST',
          headers: { authorization: `Bearer ${merchantUid}`, 'content-type': 'application/json' },
          body: JSON.stringify({ amount: '300' }),
        });
        expect(req2.status).toBe(400);
        const err2 = await req2.json();
        expect(err2.error.code).toBe('INSUFFICIENT_BALANCE');

        // Merchant views their settlement requests
        const listRes = await fetch(`${baseUrl}/settlements`, {
          headers: { authorization: `Bearer ${merchantUid}` },
        });
        expect(listRes.status).toBe(200);
        const listData = await listRes.json();
        expect(listData.settlements.length).toBeGreaterThanOrEqual(1);
      });

      it('prevents inactive merchants from requesting settlements', async () => {
        const inactiveUid = `merchant-inactive-${randomUUID()}`;
        users.set(inactiveUid, { email: 'inactive@test.local', role: 'merchant' });
        await db
          .collection('merchants')
          .doc(inactiveUid)
          .set({
            shopName: 'Inactive Merchant',
            status: 'pending',
            walletAddress: deriveWalletAddress(inactiveUid, config.WALLET_SALT),
          });

        const res = await fetch(`${baseUrl}/settlements`, {
          method: 'POST',
          headers: { authorization: `Bearer ${inactiveUid}`, 'content-type': 'application/json' },
          body: JSON.stringify({ amount: '50' }),
        });
        expect(res.status).toBe(403);
      });

      it('enforces admin approval, token burning, and mark-paid state transition', async () => {
        // Setup settlement request
        const settleId = `settle-${randomUUID()}`;
        await db.collection('settlements').doc(settleId).set({
          id: settleId,
          merchantUid,
          merchantAddress: merchantWallet,
          amount: '100',
          status: 'requested',
        });

        // Non-admin cannot decide -> 403
        const unauth = await fetch(`${baseUrl}/admin/settlements/${settleId}/decision`, {
          method: 'POST',
          headers: { authorization: `Bearer ${merchantUid}`, 'content-type': 'application/json' },
          body: JSON.stringify({ decision: 'approve' }),
        });
        expect(unauth.status).toBe(403);

        // Cannot mark paid before approval -> 400
        const earlyPaid = await fetch(`${baseUrl}/admin/settlements/${settleId}/mark-paid`, {
          method: 'POST',
          headers: { authorization: 'Bearer admin-user', 'content-type': 'application/json' },
          body: JSON.stringify({ externalReference: 'BANK-UTR-123456' }),
        });
        expect(earlyPaid.status).toBe(400);

        // Admin approves settlement -> burns CPC on-chain
        const approveRes = await fetch(`${baseUrl}/admin/settlements/${settleId}/decision`, {
          method: 'POST',
          headers: { authorization: 'Bearer admin-user', 'content-type': 'application/json' },
          body: JSON.stringify({ decision: 'approve' }),
        });
        expect(approveRes.status).toBe(200);
        const approved = await approveRes.json();
        expect(approved.status).toBe('approved');
        expect(approved.settlementRef).toBeDefined();
        expect(mockRelayer.settle).toHaveBeenCalledWith(merchantWallet, 100n, expect.any(String));

        // Admin marks paid after external payment completed
        const markPaidRes = await fetch(`${baseUrl}/admin/settlements/${settleId}/mark-paid`, {
          method: 'POST',
          headers: { authorization: 'Bearer admin-user', 'content-type': 'application/json' },
          body: JSON.stringify({ externalReference: 'BANK-UTR-123456' }),
        });
        expect(markPaidRes.status).toBe(200);
        const paidData = await markPaidRes.json();
        expect(paidData.status).toBe('paid');
        expect(paidData.externalReference).toBe('BANK-UTR-123456');

        const finalDoc = await db.collection('settlements').doc(settleId).get();
        expect(finalDoc.get('status')).toBe('paid');
        expect(finalDoc.get('externalReference')).toBe('BANK-UTR-123456');
      });

      it('safely handles on-chain settlement failure', async () => {
        shouldSettleRevert = true;
        try {
          const settleId = `settle-fail-${randomUUID()}`;
          await db.collection('settlements').doc(settleId).set({
            id: settleId,
            merchantUid,
            merchantAddress: merchantWallet,
            amount: '50',
            status: 'requested',
          });

          const res = await fetch(`${baseUrl}/admin/settlements/${settleId}/decision`, {
            method: 'POST',
            headers: { authorization: 'Bearer admin-user', 'content-type': 'application/json' },
            body: JSON.stringify({ decision: 'approve' }),
          });
          expect(res.status).toBe(400);

          const doc = await db.collection('settlements').doc(settleId).get();
          expect(doc.get('status')).toBe('requested');
        } finally {
          shouldSettleRevert = false;
        }
      });
    });

    describe('Contract Controls (Pause / Unpause)', () => {
      it('allows authorized admin to pause and unpause, rejecting unauthorized callers', async () => {
        // Non-admin cannot pause -> 403
        const unauthPause = await fetch(`${baseUrl}/admin/pause`, {
          method: 'POST',
          headers: { authorization: 'Bearer student-user' },
        });
        expect(unauthPause.status).toBe(403);

        // Admin pauses -> 200
        const pauseRes = await fetch(`${baseUrl}/admin/pause`, {
          method: 'POST',
          headers: { authorization: 'Bearer admin-user' },
        });
        expect(pauseRes.status).toBe(200);
        expect(mockRelayer.pause).toHaveBeenCalled();
        expect(isPausedState).toBe(true);

        // Operations while paused return 503 SYSTEM_PAUSED
        const refundRes = await fetch(`${baseUrl}/admin/refund`, {
          method: 'POST',
          headers: { authorization: 'Bearer admin-user', 'content-type': 'application/json' },
          body: JSON.stringify({ intentId: `0x${'ee'.repeat(32)}` }),
        });
        expect(refundRes.status).toBe(503);
        const refundErr = await refundRes.json();
        expect(refundErr.error.code).toBe('SYSTEM_PAUSED');

        // Non-admin cannot unpause -> 403
        const unauthUnpause = await fetch(`${baseUrl}/admin/unpause`, {
          method: 'POST',
          headers: { authorization: 'Bearer merchant-user' },
        });
        expect(unauthUnpause.status).toBe(403);

        // Admin unpauses -> 200
        const unpauseRes = await fetch(`${baseUrl}/admin/unpause`, {
          method: 'POST',
          headers: { authorization: 'Bearer admin-user' },
        });
        expect(unpauseRes.status).toBe(200);
        expect(mockRelayer.unpause).toHaveBeenCalled();
        expect(isPausedState).toBe(false);
      });
    });

    describe('Indexer Processing for Phase 5 Events', () => {
      it('correctly indexes Refunded and Settled events', async () => {
        const mockProvider = {
          getBlockNumber: async () => 200,
        } as unknown as import('ethers').JsonRpcProvider;

        const intentId = `0x${'ff'.repeat(32)}`;
        await db.collection('paymentIntents').doc(intentId).set({
          intentId,
          amount: '80',
          status: 'confirmed',
        });
        await db.collection('transactions').doc(`tx-${intentId}:0`).set({
          intentId,
          amount: '80',
          status: 'confirmed',
          refunded: false,
        });

        const indexer = new IndexerService({
          firestore: db,
          provider: mockProvider,
          config,
          logger: pino({ level: 'silent' }),
        });

        const refundEventLog = {
          name: 'Refunded',
          args: [intentId, '0xuser1', '0xmerchant1', 80n],
          transactionHash: `0xreftx-${randomUUID()}`,
          blockNumber: 150,
          index: 0,
        };

        const settleEventLog = {
          name: 'Settled',
          args: ['0xmerchant1', 200n, 'SETTLE-ref-1'],
          transactionHash: `0xsettletx-${randomUUID()}`,
          blockNumber: 151,
          index: 0,
        };

        vi.spyOn(indexer['fingerPay'], 'queryFilter').mockResolvedValue([
          refundEventLog as never,
          settleEventLog as never,
        ]);
        vi.spyOn(indexer['fingerPayInterface'], 'parseLog').mockImplementation((log: unknown) => {
          const l = log as { transactionHash?: string };
          if (l.transactionHash?.startsWith('0xreftx')) {
            return { name: 'Refunded', args: [intentId, '0xuser1', '0xmerchant1', 80n] } as never;
          }
          return { name: 'Settled', args: ['0xmerchant1', 200n, 'SETTLE-ref-1'] } as never;
        });

        const processed = await indexer.processRange(140, 160);
        expect(processed).toBe(2);

        // Verify refund updated paymentIntent & transaction in Firestore
        const intentDoc = await db.collection('paymentIntents').doc(intentId).get();
        expect(intentDoc.get('status')).toBe('refunded');

        const txDoc = await db.collection('transactions').doc(`tx-${intentId}:0`).get();
        expect(txDoc.get('refunded')).toBe(true);

        // Verify settled recorded in indexedEvents
        const settleDoc = await db
          .collection('indexedEvents')
          .doc(`${settleEventLog.transactionHash}:0`)
          .get();
        expect(settleDoc.exists).toBe(true);
        expect(settleDoc.get('type')).toBe('Settled');
      });
    });

    describe('Admin Audit Logs', () => {
      it('returns paginated audit log entries to authorized admins', async () => {
        await db.collection('adminLogs').add({
          actorUid: 'admin-user',
          action: 'test.action',
          meta: { status: 'success' },
          createdAt: Timestamp.now(),
        });

        const res = await fetch(`${baseUrl}/admin/logs?limit=10`, {
          headers: { authorization: 'Bearer admin-user' },
        });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.logs).toBeDefined();
        expect(data.logs.length).toBeGreaterThanOrEqual(1);

        // Non-admin rejected -> 403
        const unauth = await fetch(`${baseUrl}/admin/logs`, {
          headers: { authorization: 'Bearer student-user' },
        });
        expect(unauth.status).toBe(403);
      });
    });
  },
);

void phase5Suite;
