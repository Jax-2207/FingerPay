import { randomUUID } from 'node:crypto';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { Router, type Response } from 'express';
import { z } from 'zod';
import { keccak256, toUtf8Bytes } from 'ethers';
import { HttpError } from '../errors.js';
import {
  requireAuthentication,
  requireRole,
  type IdTokenVerifier,
  type AuthenticatedUser,
} from '../middleware/auth.js';
import type { ChainService } from '../services/chain.js';
import type { RelayerService } from '../services/relayer.js';
import type { AuditLogger } from '../services/audit.js';
import type { AppConfig } from '../config.js';

const RefundInput = z
  .object({
    intentId: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  })
  .strict();

const CreateSettlementInput = z
  .object({
    amount: z.union([z.string().regex(/^[1-9][0-9]*$/), z.number().int().positive()]),
  })
  .strict();

const SettlementDecisionInput = z
  .object({
    decision: z.enum(['approve', 'reject']),
    rejectionReason: z.string().trim().max(200).optional(),
  })
  .strict();

const MarkPaidInput = z
  .object({
    externalReference: z.string().trim().min(1).max(128),
  })
  .strict();

export interface Phase5Dependencies {
  firestore: Firestore;
  verifier: IdTokenVerifier;
  chain: ChainService;
  relayer: RelayerService;
  audit: AuditLogger;
  config: AppConfig;
}

function actor(response: Response): AuthenticatedUser {
  const user = (response.locals as Record<string, unknown>).auth as AuthenticatedUser | undefined;
  if (user === undefined) throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required');
  return user;
}

function getParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] ?? '';
  return param ?? '';
}

function parseBody<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(400, 'INVALID_REQUEST', 'Request is invalid');
  return result.data;
}

export function createPhase5Router(deps: Phase5Dependencies): Router {
  const { firestore: db, verifier, chain, relayer, audit, config } = deps;
  const router = Router();
  const authenticated = requireAuthentication(verifier);
  const adminOnly = [authenticated, requireRole('admin')];
  const merchantOnly = [authenticated, requireRole('merchant')];

  // ----------------------------------------------------
  // A. Payment Refunds
  // ----------------------------------------------------

  router.post('/admin/refund', ...adminOnly, async (request, response, next) => {
    try {
      if (await chain.isPaused()) {
        throw new HttpError(503, 'SYSTEM_PAUSED', 'System is currently paused');
      }

      const input = parseBody(RefundInput, request.body);
      const caller = actor(response);
      const intentRef = db.collection('paymentIntents').doc(input.intentId);
      const intentDoc = await intentRef.get();

      if (!intentDoc.exists) {
        throw new HttpError(404, 'INTENT_NOT_FOUND', 'Payment intent not found');
      }

      const intent = intentDoc.data()!;
      if (intent.status === 'refunded') {
        throw new HttpError(400, 'ALREADY_REFUNDED', 'Payment has already been refunded');
      }

      if (intent.status !== 'confirmed') {
        throw new HttpError(400, 'CANNOT_REFUND', 'Only confirmed payments can be refunded');
      }

      let txHash: string;
      try {
        txHash = await relayer.refund(input.intentId);
      } catch (chainError) {
        const decoded = chain.decodeCustomError(chainError);
        const reason = decoded ?? 'Refund reverted on chain';
        throw new HttpError(400, decoded ?? 'REFUND_FAILED', reason);
      }

      await intentRef.update({
        status: 'refunded',
        refundTxHash: txHash,
        refundedAt: FieldValue.serverTimestamp(),
      });

      const txQuery = await db
        .collection('transactions')
        .where('intentId', '==', input.intentId)
        .get();

      for (const doc of txQuery.docs) {
        await doc.ref.update({
          refunded: true,
          refundTxHash: txHash,
          refundedAt: FieldValue.serverTimestamp(),
        });
      }

      await audit.write({
        actorUid: caller.uid,
        action: 'payment.refund',
        meta: {
          intentId: input.intentId as `0x${string}`,
          transactionHash: txHash as `0x${string}`,
          status: 'success',
        },
      });

      response.json({
        status: 'refunded',
        txHash,
        intentId: input.intentId,
      });
    } catch (error) {
      next(error);
    }
  });

  // ----------------------------------------------------
  // B. Merchant Settlement
  // ----------------------------------------------------

  router.post('/settlements', ...merchantOnly, async (request, response, next) => {
    try {
      const input = parseBody(CreateSettlementInput, request.body);
      const caller = actor(response);
      const merchantDoc = await db.collection('merchants').doc(caller.uid).get();

      if (!merchantDoc.exists || merchantDoc.get('status') !== 'approved') {
        throw new HttpError(403, 'MERCHANT_NOT_ACTIVE', 'Merchant is not active');
      }

      const merchant = merchantDoc.data()!;
      const merchantAddress = String(merchant.walletAddress);
      const requestedAmount = BigInt(input.amount);
      if (requestedAmount <= 0n) {
        throw new HttpError(400, 'INVALID_AMOUNT', 'Settlement amount must be positive');
      }

      const currentBalance = await chain.getTokenBalance(merchantAddress);
      if (requestedAmount > currentBalance) {
        throw new HttpError(
          400,
          'INSUFFICIENT_BALANCE',
          `Requested settlement amount (${requestedAmount} CPC) exceeds current balance (${currentBalance} CPC)`,
        );
      }

      // Check open pending settlement requests
      const pendingSnap = await db
        .collection('settlements')
        .where('merchantUid', '==', caller.uid)
        .where('status', '==', 'requested')
        .get();

      let pendingTotal = 0n;
      for (const doc of pendingSnap.docs) {
        pendingTotal += BigInt(doc.get('amount') || 0);
      }

      if (pendingTotal + requestedAmount > currentBalance) {
        throw new HttpError(
          400,
          'INSUFFICIENT_BALANCE',
          `Requested amount plus open requests (${pendingTotal + requestedAmount} CPC) exceeds available balance (${currentBalance} CPC)`,
        );
      }

      const settlementId = randomUUID();
      const settlementRecord = {
        id: settlementId,
        merchantUid: caller.uid,
        merchantAddress,
        merchantName: String(merchant.shopName),
        amount: input.amount.toString(),
        status: 'requested',
        requestedAt: FieldValue.serverTimestamp(),
      };

      await db.collection('settlements').doc(settlementId).set(settlementRecord);

      await audit.write({
        actorUid: caller.uid,
        action: 'settlement.request',
        meta: {
          amount: input.amount.toString(),
          status: 'pending',
        },
      });

      response.status(201).json(settlementRecord);
    } catch (error) {
      next(error);
    }
  });

  router.get('/settlements', ...merchantOnly, async (_request, response, next) => {
    try {
      const caller = actor(response);
      let settlements: Array<Record<string, unknown>> = [];
      try {
        const snapshot = await db
          .collection('settlements')
          .where('merchantUid', '==', caller.uid)
          .orderBy('requestedAt', 'desc')
          .limit(100)
          .get();
        settlements = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
      } catch {
        // Fall back to in-memory sort if Firestore composite index is missing
        const snapshot = await db
          .collection('settlements')
          .where('merchantUid', '==', caller.uid)
          .get();
        settlements = snapshot.docs
          .map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }))
          .sort((a, b) => {
            const rawA = a as Record<string, unknown>;
            const rawB = b as Record<string, unknown>;
            const timeA =
              (rawA.requestedAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
            const timeB =
              (rawB.requestedAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
            return timeB - timeA;
          })
          .slice(0, 100);
      }

      response.json({ settlements });
    } catch (error) {
      next(error);
    }
  });

  router.get('/admin/settlements', ...adminOnly, async (request, response, next) => {
    try {
      const status = typeof request.query.status === 'string' ? request.query.status : undefined;
      let query = db.collection('settlements').limit(100);
      if (status !== undefined) {
        query = query.where('status', '==', status);
      }

      const snapshot = await query.get();
      const settlements = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      response.json({ settlements });
    } catch (error) {
      next(error);
    }
  });

  router.post('/admin/settlements/:id/decision', ...adminOnly, async (request, response, next) => {
    try {
      if (await chain.isPaused()) {
        throw new HttpError(503, 'SYSTEM_PAUSED', 'System is currently paused');
      }

      const settlementId = getParam(request.params.id);
      const input = parseBody(SettlementDecisionInput, request.body);
      const caller = actor(response);
      const settleRef = db.collection('settlements').doc(settlementId);
      const settleDoc = await settleRef.get();

      if (!settleDoc.exists) {
        throw new HttpError(404, 'SETTLEMENT_NOT_FOUND', 'Settlement request not found');
      }

      const settlement = settleDoc.data()!;
      if (settlement.status !== 'requested') {
        throw new HttpError(
          400,
          'INVALID_SETTLEMENT_STATE',
          `Cannot decide on settlement with status ${settlement.status}`,
        );
      }

      if (input.decision === 'approve') {
        const settlementRefCode = `SETTLE-${settlementId}`;
        const settlementHash = keccak256(toUtf8Bytes(settlementRefCode));

        let txHash: string;
        try {
          txHash = await relayer.settle(
            String(settlement.merchantAddress),
            BigInt(settlement.amount),
            settlementHash,
          );
        } catch (chainError) {
          const decoded = chain.decodeCustomError(chainError);
          const reason = decoded ?? 'Settlement burn reverted on chain';
          throw new HttpError(400, decoded ?? 'SETTLEMENT_FAILED', reason);
        }

        await settleRef.update({
          status: 'approved',
          settlementRef: settlementRefCode,
          txHash,
          approvedAt: FieldValue.serverTimestamp(),
        });

        await audit.write({
          actorUid: caller.uid,
          action: 'settlement.approve',
          meta: {
            amount: settlement.amount,
            transactionHash: txHash as `0x${string}`,
            status: 'success',
          },
        });

        response.json({
          status: 'approved',
          settlementRef: settlementRefCode,
          txHash,
        });
      } else {
        await settleRef.update({
          status: 'rejected',
          rejectionReason: input.rejectionReason ?? 'Rejected by admin',
          decidedAt: FieldValue.serverTimestamp(),
        });

        await audit.write({
          actorUid: caller.uid,
          action: 'settlement.reject',
          meta: {
            amount: settlement.amount,
            status: 'failure',
          },
        });

        response.json({ status: 'rejected' });
      }
    } catch (error) {
      next(error);
    }
  });

  router.post('/admin/settlements/:id/mark-paid', ...adminOnly, async (request, response, next) => {
    try {
      const settlementId = getParam(request.params.id);
      const input = parseBody(MarkPaidInput, request.body);
      const caller = actor(response);
      const settleRef = db.collection('settlements').doc(settlementId);
      const settleDoc = await settleRef.get();

      if (!settleDoc.exists) {
        throw new HttpError(404, 'SETTLEMENT_NOT_FOUND', 'Settlement request not found');
      }

      const settlement = settleDoc.data()!;
      if (settlement.status !== 'approved') {
        throw new HttpError(
          400,
          'INVALID_SETTLEMENT_STATE',
          'Only approved settlements can be marked as paid',
        );
      }

      await settleRef.update({
        status: 'paid',
        externalReference: input.externalReference,
        paidAt: FieldValue.serverTimestamp(),
      });

      await audit.write({
        actorUid: caller.uid,
        action: 'settlement.markPaid',
        meta: {
          amount: settlement.amount,
          status: 'success',
        },
      });

      response.json({
        status: 'paid',
        externalReference: input.externalReference,
      });
    } catch (error) {
      next(error);
    }
  });

  // ----------------------------------------------------
  // C. Contract Controls (Pause / Unpause)
  // ----------------------------------------------------

  router.post('/admin/pause', ...adminOnly, async (_request, response, next) => {
    try {
      const caller = actor(response);
      const txHash = await relayer.pause();

      await audit.write({
        actorUid: caller.uid,
        action: 'circuitBreaker.pause',
        meta: {
          transactionHash: txHash as `0x${string}`,
          status: 'success',
        },
      });

      response.json({ status: 'paused', txHash });
    } catch (error) {
      next(error);
    }
  });

  router.post('/admin/unpause', ...adminOnly, async (_request, response, next) => {
    try {
      const caller = actor(response);
      const txHash = await relayer.unpause();

      await audit.write({
        actorUid: caller.uid,
        action: 'circuitBreaker.unpause',
        meta: {
          transactionHash: txHash as `0x${string}`,
          status: 'success',
        },
      });

      response.json({ status: 'unpaused', txHash });
    } catch (error) {
      next(error);
    }
  });

  // ----------------------------------------------------
  // D. Admin Audit Logs
  // ----------------------------------------------------

  router.get('/admin/logs', ...adminOnly, async (request, response, next) => {
    try {
      const limit = Math.min(100, Math.max(1, Number(request.query.limit) || 50));
      const snapshot = await db
        .collection('adminLogs')
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

      const logs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      response.json({ logs });
    } catch (error) {
      next(error);
    }
  });

  router.get('/admin/chain', ...adminOnly, async (_request, response, next) => {
    try {
      const paused = typeof chain.isPaused === 'function' ? await chain.isPaused() : false;
      const eventsSnap = await db
        .collection('indexedEvents')
        .orderBy('blockNumber', 'desc')
        .limit(20)
        .get();
      const events = eventsSnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      response.json({
        fingerPayAddress: config.FINGERPAY_ADDRESS,
        campusCoinAddress: config.CAMPUSCOIN_ADDRESS,
        chainId: config.CHAIN_ID,
        paused,
        recentEvents: events,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/admin/stats', ...adminOnly, async (_request, response, next) => {
    try {
      const [usersSnap, merchantsSnap, txSnap, settlementsSnap, paused] = await Promise.all([
        db.collection('users').get(),
        db.collection('merchants').get(),
        db.collection('transactions').get(),
        db.collection('settlements').get(),
        typeof chain.isPaused === 'function' ? chain.isPaused() : Promise.resolve(false),
      ]);

      const totalSpent = txSnap.docs
        .filter((d) => d.get('status') === 'confirmed')
        .reduce((sum, d) => sum + (Number(d.get('amount')) || 0), 0);

      const pendingSettlements = settlementsSnap.docs.filter(
        (d) => d.get('status') === 'requested',
      ).length;

      const pendingUsers = usersSnap.docs.filter((d) => d.get('status') === 'pending').length;

      response.json({
        totalUsers: usersSnap.size,
        pendingUsers,
        totalMerchants: merchantsSnap.size,
        activeMerchants: merchantsSnap.docs.filter((d) => d.get('status') === 'approved').length,
        totalTransactions: txSnap.size,
        totalSpentCpc: totalSpent,
        totalSettlements: settlementsSnap.size,
        pendingSettlements,
        paused,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
