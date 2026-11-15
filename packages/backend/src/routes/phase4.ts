import { randomBytes, randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';
import { Router, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { keccak256, toUtf8Bytes } from 'ethers';
import { computeIntentId } from '@fingerpay/shared';
import { HttpError } from '../errors.js';
import { getLockUntilMillis } from './phase3.js';
import {
  requireAuthentication,
  requireRole,
  type IdTokenVerifier,
  type AuthenticatedUser,
} from '../middleware/auth.js';
import { deriveWalletAddress } from '../services/wallet.js';
import type { ChainService } from '../services/chain.js';
import type { RelayerService } from '../services/relayer.js';
import type { AuditLogger } from '../services/audit.js';
import type { LimitsService } from '../services/limits.js';
import type { AppConfig } from '../config.js';

const MerchantApplyInput = z
  .object({
    shopName: z.string().trim().min(1).max(100),
    category: z.string().trim().min(1).max(50).default('general'),
  })
  .strict();

const AdminMerchantDecisionInput = z
  .object({
    decision: z.enum(['approve', 'reject']).optional(),
    approve: z.boolean().optional(),
  })
  .strict()
  .refine(
    (data) => data.decision !== undefined || data.approve !== undefined,
    'Either decision or approve must be provided',
  );

const AdminMintInput = z
  .object({
    prn: z.string().trim().min(1),
    amount: z.union([z.string().regex(/^[1-9][0-9]*$/), z.number().int().positive()]),
    receiptRef: z.string().trim().min(1).max(128),
  })
  .strict();

const CreateIntentInput = z
  .object({
    amount: z.union([z.string().regex(/^[1-9][0-9]*$/), z.number().int().positive()]),
    category: z.string().trim().min(1).max(50).optional(),
  })
  .strict();

const ConfirmIntentInput = z
  .object({
    challengeId: z.string().uuid(),
    pin: z.string().regex(/^\d{4,6}$/),
    assertion: z.unknown(),
  })
  .strict();

const confirmRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_request, response) => {
    response.status(429).json({
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many payment confirm requests; try again shortly',
      },
    });
  },
});

export interface Phase4Dependencies {
  auth: Auth;
  firestore: Firestore;
  verifier: IdTokenVerifier;
  chain: ChainService;
  relayer: RelayerService;
  limits: LimitsService;
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

function toUint8Array(data: unknown): Uint8Array<ArrayBuffer> {
  if (data instanceof Uint8Array) {
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    return copy;
  }
  if (typeof data === 'string') {
    const buf = Buffer.from(data, 'base64url');
    const copy = new Uint8Array(buf.byteLength);
    copy.set(buf);
    return copy;
  }
  return new Uint8Array(0);
}

function parseBody<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(400, 'INVALID_REQUEST', 'Request is invalid');
  return result.data;
}

export function sweepExpiredIntents(db: Firestore): Promise<number> {
  const now = Math.floor(Date.now() / 1000);
  return db.runTransaction(async (transaction) => {
    const expiredQuery = await db
      .collection('paymentIntents')
      .where('status', '==', 'created')
      .where('expiry', '<', now)
      .limit(50)
      .get();

    for (const doc of expiredQuery.docs) {
      transaction.update(doc.ref, {
        status: 'expired',
        expiredAt: FieldValue.serverTimestamp(),
      });
    }
    return expiredQuery.docs.length;
  });
}

export function createPhase4Router(deps: Phase4Dependencies): Router {
  const { auth, firestore: db, verifier, chain, relayer, limits, audit, config } = deps;
  const router = Router();
  const authenticated = requireAuthentication(verifier);
  const adminOnly = [authenticated, requireRole('admin')];
  const merchantOnly = [authenticated, requireRole('merchant')];
  const userOnly = [authenticated, requireRole('user')];

  // ----------------------------------------------------
  // A. Merchant Management
  // ----------------------------------------------------

  router.post('/merchant/apply', authenticated, async (request, response, next) => {
    try {
      const input = parseBody(MerchantApplyInput, request.body);
      const user = actor(response);
      const merchantRef = db.collection('merchants').doc(user.uid);
      const existing = await merchantRef.get();
      if (existing.exists) {
        throw new HttpError(409, 'MERCHANT_EXISTS', 'Merchant application already exists');
      }

      const walletAddress = deriveWalletAddress(user.uid, config.WALLET_SALT);
      const record = {
        shopName: input.shopName,
        category: input.category,
        walletAddress,
        status: 'pending',
        createdAt: FieldValue.serverTimestamp(),
      };
      await merchantRef.set(record);
      await audit.write({ actorUid: user.uid, action: 'merchant.apply', meta: {} });
      response.status(201).json({ uid: user.uid, ...record });
    } catch (error) {
      next(error);
    }
  });

  router.get('/merchant/profile', authenticated, async (_request, response, next) => {
    try {
      const user = actor(response);
      const merchantDoc = await db.collection('merchants').doc(user.uid).get();
      if (!merchantDoc.exists) {
        throw new HttpError(404, 'MERCHANT_NOT_FOUND', 'Merchant profile not found');
      }
      const data = merchantDoc.data()!;
      let balance = '0';
      let onChainActive = false;
      try {
        const bal = await chain.getTokenBalance(String(data.walletAddress));
        balance = bal.toString();
        onChainActive = await chain.isMerchantActive(String(data.walletAddress));
      } catch {
        // chain call error fallback
      }
      response.json({
        uid: user.uid,
        ...data,
        balance,
        onChainActive,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/admin/merchants', ...adminOnly, async (request, response, next) => {
    try {
      const status = typeof request.query.status === 'string' ? request.query.status : undefined;
      let query = db.collection('merchants').limit(100);
      if (status !== undefined) {
        query = query.where('status', '==', status);
      }
      const snapshot = await query.get();
      const merchants = snapshot.docs.map((doc) => ({
        uid: doc.id,
        ...doc.data(),
      }));
      response.json({ merchants });
    } catch (error) {
      next(error);
    }
  });

  router.post('/admin/merchants/:uid/decision', ...adminOnly, async (request, response, next) => {
    try {
      const input = parseBody(AdminMerchantDecisionInput, request.body);
      const approve =
        input.decision !== undefined ? input.decision === 'approve' : Boolean(input.approve);
      const merchantUid = getParam(request.params.uid);
      const merchantRef = db.collection('merchants').doc(merchantUid);
      const doc = await merchantRef.get();
      if (!doc.exists) {
        throw new HttpError(404, 'MERCHANT_NOT_FOUND', 'Merchant not found');
      }

      const merchant = doc.data()!;
      const caller = actor(response);

      if (approve) {
        const metaHash = keccak256(toUtf8Bytes(String(merchant.shopName)));
        const txHash = await relayer.registerMerchant(String(merchant.walletAddress), metaHash);

        await merchantRef.update({
          status: 'approved',
          onChainRegisteredTx: txHash,
          approvedAt: FieldValue.serverTimestamp(),
        });

        await auth.setCustomUserClaims(merchantUid, { role: 'merchant' });
        await audit.write({
          actorUid: caller.uid,
          action: 'merchant.approve',
          meta: { transactionHash: txHash as `0x${string}` },
        });

        response.json({ status: 'approved', txHash });
      } else {
        await merchantRef.update({
          status: 'rejected',
          decidedAt: FieldValue.serverTimestamp(),
        });
        await audit.write({ actorUid: caller.uid, action: 'merchant.reject', meta: {} });
        response.json({ status: 'rejected' });
      }
    } catch (error) {
      next(error);
    }
  });

  router.post('/admin/merchants/:uid/deactivate', ...adminOnly, async (request, response, next) => {
    try {
      const merchantUid = getParam(request.params.uid);
      const merchantRef = db.collection('merchants').doc(merchantUid);
      const doc = await merchantRef.get();
      if (!doc.exists) {
        throw new HttpError(404, 'MERCHANT_NOT_FOUND', 'Merchant not found');
      }

      const merchant = doc.data()!;
      const caller = actor(response);
      const txHash = await relayer.deactivateMerchant(String(merchant.walletAddress));

      await merchantRef.update({
        status: 'deactivated',
        deactivatedAt: FieldValue.serverTimestamp(),
      });
      await audit.write({
        actorUid: caller.uid,
        action: 'merchant.deactivate',
        meta: { transactionHash: txHash as `0x${string}` },
      });

      response.json({ status: 'deactivated', txHash });
    } catch (error) {
      next(error);
    }
  });

  router.post('/admin/merchants/:uid/activate', ...adminOnly, async (request, response, next) => {
    try {
      const merchantUid = getParam(request.params.uid);
      const merchantRef = db.collection('merchants').doc(merchantUid);
      const doc = await merchantRef.get();
      if (!doc.exists) {
        throw new HttpError(404, 'MERCHANT_NOT_FOUND', 'Merchant not found');
      }

      const merchant = doc.data()!;
      const caller = actor(response);
      const metaHash = keccak256(toUtf8Bytes(String(merchant.shopName)));
      const txHash = await relayer.registerMerchant(String(merchant.walletAddress), metaHash);

      await merchantRef.update({
        status: 'approved',
        activatedAt: FieldValue.serverTimestamp(),
      });
      await audit.write({
        actorUid: caller.uid,
        action: 'merchant.activate',
        meta: { transactionHash: txHash as `0x${string}` },
      });

      response.json({ status: 'approved', txHash });
    } catch (error) {
      next(error);
    }
  });

  // ----------------------------------------------------
  // B. CPC Minting
  // ----------------------------------------------------

  router.post('/admin/mint', ...adminOnly, async (request, response, next) => {
    try {
      if (typeof chain.isPaused === 'function' && (await chain.isPaused())) {
        throw new HttpError(503, 'SYSTEM_PAUSED', 'System is currently paused');
      }
      const input = parseBody(AdminMintInput, request.body);
      const caller = actor(response);
      const amountBigInt = BigInt(input.amount);
      if (amountBigInt <= 0n) {
        throw new HttpError(400, 'INVALID_AMOUNT', 'Amount must be greater than zero');
      }

      // Check student with PRN exists and is approved
      const studentQuery = await db
        .collection('users')
        .where('prn', '==', input.prn)
        .where('status', '==', 'approved')
        .limit(1)
        .get();

      if (studentQuery.empty) {
        throw new HttpError(404, 'STUDENT_NOT_FOUND', 'Approved student with this PRN not found');
      }

      const studentDoc = studentQuery.docs[0]!;
      const studentUid = studentDoc.id;
      const studentWallet = String(studentDoc.get('walletAddress'));

      // Check duplicate receipt reference
      const duplicateMint = await db
        .collection('mints')
        .where('receiptRef', '==', input.receiptRef)
        .limit(1)
        .get();

      if (!duplicateMint.empty) {
        throw new HttpError(409, 'DUPLICATE_MINT', 'Receipt reference has already been minted');
      }

      const receiptHash = keccak256(toUtf8Bytes(input.receiptRef));
      const txHash = await relayer.mint(studentWallet, amountBigInt, receiptHash);

      const mintDocRef = db.collection('mints').doc(txHash);
      await mintDocRef.set({
        adminUid: caller.uid,
        userUid: studentUid,
        prn: input.prn,
        amount: input.amount.toString(),
        receiptRef: input.receiptRef,
        txHash,
        createdAt: FieldValue.serverTimestamp(),
      });

      await audit.write({
        actorUid: caller.uid,
        action: 'mint.cpc',
        meta: {
          amount: input.amount.toString(),
          transactionHash: txHash as `0x${string}`,
          status: 'success',
        },
      });

      response.status(201).json({
        txHash,
        receiptRef: input.receiptRef,
        amount: input.amount.toString(),
        userUid: studentUid,
      });
    } catch (error) {
      next(error);
    }
  });

  // ----------------------------------------------------
  // C. Payment Intent Creation
  // ----------------------------------------------------

  router.post('/intents', ...merchantOnly, async (request, response, next) => {
    try {
      if (typeof chain.isPaused === 'function' && (await chain.isPaused())) {
        throw new HttpError(503, 'SYSTEM_PAUSED', 'System is currently paused');
      }
      const input = parseBody(CreateIntentInput, request.body);
      const caller = actor(response);
      const merchantDoc = await db.collection('merchants').doc(caller.uid).get();
      if (!merchantDoc.exists || merchantDoc.get('status') !== 'approved') {
        throw new HttpError(403, 'MERCHANT_NOT_ACTIVE', 'Merchant is not active');
      }

      const merchant = merchantDoc.data()!;
      const merchantAddress = String(merchant.walletAddress);
      const activeOnChain = await chain.isMerchantActive(merchantAddress);
      if (!activeOnChain) {
        throw new HttpError(403, 'MERCHANT_NOT_ACTIVE', 'Merchant is not active on chain');
      }

      const amountBigInt = BigInt(input.amount);
      if (amountBigInt <= 0n) {
        throw new HttpError(400, 'INVALID_AMOUNT', 'Amount must be positive');
      }

      const nonce = `0x${randomBytes(32).toString('hex')}`;
      const expiry = Math.floor(Date.now() / 1000) + config.INTENT_TTL_SECONDS;

      const intentId = computeIntentId({
        chainId: BigInt(config.CHAIN_ID),
        contract: config.FINGERPAY_ADDRESS,
        merchant: merchantAddress,
        amount: amountBigInt,
        nonce,
        expiry: BigInt(expiry),
      });

      const intentRecord = {
        intentId,
        merchantUid: caller.uid,
        merchantAddress,
        merchantName: String(merchant.shopName),
        category: input.category ?? (merchant.category as string | undefined) ?? 'general',
        amount: input.amount.toString(),
        nonce,
        expiry,
        status: 'created',
        createdAt: FieldValue.serverTimestamp(),
      };

      await db.collection('paymentIntents').doc(intentId).set(intentRecord);

      response.status(201).json({
        id: intentId,
        intentId,
        amount: input.amount.toString(),
        expiry,
        nonce,
        qrPayload: `/pay/${intentId}`,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/intents/:id', authenticated, async (request, response, next) => {
    try {
      const intentId = getParam(request.params.id);
      const doc = await db.collection('paymentIntents').doc(intentId).get();
      if (!doc.exists) {
        throw new HttpError(404, 'INTENT_NOT_FOUND', 'Payment intent not found');
      }

      const data = doc.data()!;
      const now = Math.floor(Date.now() / 1000);
      if (data.status === 'created' && Number(data.expiry) < now) {
        await doc.ref.update({ status: 'expired' });
        data.status = 'expired';
      }

      response.json({
        id: doc.id,
        intentId: data.intentId,
        merchantUid: data.merchantUid,
        merchantAddress: data.merchantAddress,
        merchantName: data.merchantName,
        category: data.category,
        amount: data.amount,
        expiry: data.expiry,
        status: data.status,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/intents/:id/cancel', ...merchantOnly, async (request, response, next) => {
    try {
      const intentId = getParam(request.params.id);
      const caller = actor(response);
      const intentRef = db.collection('paymentIntents').doc(intentId);
      const doc = await intentRef.get();
      if (!doc.exists) {
        throw new HttpError(404, 'INTENT_NOT_FOUND', 'Payment intent not found');
      }

      if (doc.get('merchantUid') !== caller.uid) {
        throw new HttpError(403, 'FORBIDDEN', 'You can only cancel your own intents');
      }

      if (doc.get('status') !== 'created') {
        throw new HttpError(
          400,
          'CANNOT_CANCEL',
          `Cannot cancel intent with status ${doc.get('status')}`,
        );
      }

      await intentRef.update({
        status: 'cancelled',
        cancelledAt: FieldValue.serverTimestamp(),
      });

      response.json({ status: 'cancelled' });
    } catch (error) {
      next(error);
    }
  });

  // ----------------------------------------------------
  // D. WebAuthn Auth Options Bound to Intent
  // ----------------------------------------------------

  router.post('/intents/:id/auth-options', ...userOnly, async (request, response, next) => {
    try {
      const intentId = getParam(request.params.id);
      const caller = actor(response);

      const userDoc = await db.collection('users').doc(caller.uid).get();
      if (!userDoc.exists || userDoc.get('status') !== 'approved') {
        throw new HttpError(403, 'ACCOUNT_NOT_APPROVED', 'Account is not approved');
      }

      const intentDoc = await db.collection('paymentIntents').doc(intentId).get();
      if (!intentDoc.exists) {
        throw new HttpError(404, 'INTENT_NOT_FOUND', 'Payment intent not found');
      }

      const intent = intentDoc.data()!;
      if (intent.status !== 'created') {
        throw new HttpError(400, 'INTENT_NOT_AVAILABLE', `Intent is already ${intent.status}`);
      }

      const now = Math.floor(Date.now() / 1000);
      if (Number(intent.expiry) < now) {
        await intentDoc.ref.update({ status: 'expired' });
        throw new HttpError(400, 'INTENT_EXPIRED', 'Payment intent has expired');
      }

      if (intent.merchantUid === caller.uid) {
        throw new HttpError(400, 'SELF_PAYMENT', 'Cannot pay your own intent');
      }

      const keysQuery = await db.collection('passkeys').where('uid', '==', caller.uid).get();
      if (keysQuery.empty) {
        throw new HttpError(400, 'PASSKEY_REQUIRED', 'No passkey registered for user');
      }

      const challenge = randomBytes(32);

      const options = await generateAuthenticationOptions({
        rpID: config.WEBAUTHN_RP_ID,
        challenge,
        userVerification: 'required',
        allowCredentials: keysQuery.docs.map((doc) => ({
          id: doc.id,
          transports: (doc.get('transports') as string[] | undefined) ?? [],
        })),
      });

      const challengeId = randomUUID();
      await db
        .collection('webauthnChallenges')
        .doc(challengeId)
        .set({
          uid: caller.uid,
          intentId: intent.intentId,
          challenge: options.challenge,
          purpose: 'payment',
          expiresAt: Timestamp.fromMillis(Number(intent.expiry) * 1000),
          createdAt: FieldValue.serverTimestamp(),
        });

      response.json({ challengeId, options });
    } catch (error) {
      next(error);
    }
  });

  // ----------------------------------------------------
  // E. Payment Authorization Pipeline (15 Steps)
  // ----------------------------------------------------

  router.post(
    '/intents/:id/confirm',
    confirmRateLimit,
    ...userOnly,
    async (request, response, next) => {
      try {
        if (typeof chain.isPaused === 'function' && (await chain.isPaused())) {
          throw new HttpError(503, 'SYSTEM_PAUSED', 'System is currently paused');
        }
        const intentId = getParam(request.params.id);
        const caller = actor(response);
        const input = parseBody(ConfirmIntentInput, request.body);

        // 1. Confirm payment intent exists and is in created state
        const intentRef = db.collection('paymentIntents').doc(intentId);
        const intentSnap = await intentRef.get();
        if (!intentSnap.exists) {
          throw new HttpError(404, 'INTENT_NOT_FOUND', 'Payment intent not found');
        }
        const intent = intentSnap.data()!;
        if (intent.status !== 'created') {
          throw new HttpError(400, 'INTENT_NOT_AVAILABLE', `Intent status is ${intent.status}`);
        }

        // 2. Confirm intent has not expired
        const now = Math.floor(Date.now() / 1000);
        if (Number(intent.expiry) < now) {
          await intentRef.update({ status: 'expired' });
          throw new HttpError(400, 'INTENT_EXPIRED', 'Payment intent has expired');
        }

        // 3. Confirm authenticated student is not the merchant
        if (intent.merchantUid === caller.uid) {
          throw new HttpError(400, 'SELF_PAYMENT', 'Cannot pay yourself');
        }

        // 4. Verify student identity and registered passkey
        const studentDoc = await db.collection('users').doc(caller.uid).get();
        if (!studentDoc.exists || studentDoc.get('status') !== 'approved') {
          throw new HttpError(403, 'ACCOUNT_NOT_APPROVED', 'Student account is not approved');
        }
        const student = studentDoc.data()!;

        // 5. Verify explicit user approval & WebAuthn assertion
        // 6. Atomically consume the per-attempt challenge bound to this student and intent
        const challengeRef = db.collection('webauthnChallenges').doc(input.challengeId);
        const challengeData = await db.runTransaction(async (transaction) => {
          const challengeSnap = await transaction.get(challengeRef);
          if (!challengeSnap.exists) {
            throw new HttpError(
              400,
              'CHALLENGE_EXPIRED',
              'Authentication challenge expired or invalid',
            );
          }
          const data = challengeSnap.data()!;
          const expiresAt = data.expiresAt;
          if (
            data.uid !== caller.uid ||
            data.intentId !== intent.intentId ||
            data.purpose !== 'payment'
          ) {
            throw new HttpError(400, 'CHALLENGE_MISMATCH', 'Challenge does not match this intent');
          }
          if (expiresAt instanceof Timestamp && expiresAt.toMillis() <= Date.now()) {
            transaction.delete(challengeRef);
            throw new HttpError(
              400,
              'CHALLENGE_EXPIRED',
              'Authentication challenge expired or invalid',
            );
          }
          transaction.delete(challengeRef);
          return data;
        });

        // 7. Validate challenge, origin, RP ID, user verification, and counter
        const assertion = input.assertion as { id?: string; response?: unknown };
        if (typeof assertion?.id !== 'string') {
          throw new HttpError(400, 'PASSKEY_INVALID', 'Assertion format is invalid');
        }

        const keyRef = db.collection('passkeys').doc(assertion.id);
        const keyDoc = await keyRef.get();
        if (!keyDoc.exists || keyDoc.get('uid') !== caller.uid) {
          throw new HttpError(401, 'AUTHENTICATION_FAILED', 'Passkey not recognized');
        }

        const keyData = keyDoc.data()!;
        const verification = await verifyAuthenticationResponse({
          response: input.assertion as never,
          expectedChallenge: challengeData.challenge,
          expectedOrigin: config.WEBAUTHN_ORIGIN,
          expectedRPID: config.WEBAUTHN_RP_ID,
          credential: {
            id: keyDoc.id,
            publicKey: toUint8Array(keyData.publicKey),
            counter: Number(keyData.counter ?? 0),
            transports: keyData.transports,
          },
          requireUserVerification: true,
        });

        if (!verification.verified) {
          throw new HttpError(401, 'AUTHENTICATION_FAILED', 'Passkey verification failed');
        }

        // Update passkey counter
        await keyRef.update({
          counter: verification.authenticationInfo.newCounter,
          lastUsedAt: FieldValue.serverTimestamp(),
        });

        // 8. Verify PIN using Argon2id and enforce lockout policy
        const pinRef = db.collection('pinSecrets').doc(caller.uid);
        const pinSnap = await pinRef.get();
        if (!pinSnap.exists) {
          throw new HttpError(400, 'PIN_NOT_SET', 'PIN is not configured');
        }
        const pinData = pinSnap.data()!;
        const lockUntilMillis = getLockUntilMillis(pinData.lockedUntil);
        if (lockUntilMillis !== null && lockUntilMillis > Date.now()) {
          throw new HttpError(
            403,
            'ACCOUNT_LOCKED',
            'Account is locked due to failed PIN attempts',
          );
        }

        const pinValid = await argon2.verify(String(pinData.hash), input.pin);
        if (!pinValid) {
          const lockExpired = lockUntilMillis !== null && lockUntilMillis <= Date.now();
          const failures = lockExpired ? 1 : (Number(pinData.failedAttempts) || 0) + 1;
          const lockUpdates: Record<string, unknown> = {
            failedAttempts: failures,
            lockedUntil: failures >= 5 ? Timestamp.fromMillis(Date.now() + 15 * 60 * 1000) : null,
          };
          await pinRef.update(lockUpdates);
          throw new HttpError(401, 'INVALID_PIN', 'Invalid application PIN');
        }

        // Reset PIN failure counter
        await pinRef.update({ failedAttempts: 0, lockedUntil: null });

        // 9. Check on-chain student CPC balance
        const studentWallet = String(student.walletAddress);
        const amountBigInt = BigInt(intent.amount);
        const studentBalance = await chain.getTokenBalance(studentWallet);
        if (studentBalance < amountBigInt) {
          throw new HttpError(400, 'INSUFFICIENT_BALANCE', 'Insufficient CPC balance');
        }

        // 10. Enforce payment and daily spending limits
        await limits.enforcePaymentLimits(caller.uid, amountBigInt);

        // 11. Atomically claim intent in Firestore transaction
        await db.runTransaction(async (transaction) => {
          const currentIntent = await transaction.get(intentRef);
          if (!currentIntent.exists || currentIntent.get('status') !== 'created') {
            throw new HttpError(409, 'INTENT_ALREADY_USED', 'Intent has already been processed');
          }
          transaction.update(intentRef, {
            status: 'approved',
            userUid: caller.uid,
            claimedAt: FieldValue.serverTimestamp(),
          });
        });

        // 12. Submit payment through authorized relayer
        // 13. Update status to submitted
        await intentRef.update({ status: 'submitted' });

        let payResult;
        try {
          payResult = await relayer.pay(
            studentWallet,
            String(intent.merchantAddress),
            amountBigInt,
            String(intent.nonce),
            BigInt(intent.expiry),
          );
        } catch (chainError) {
          const decodedError = chain.decodeCustomError(chainError);
          const reason = decodedError ?? 'Transaction failed on chain';
          await intentRef.update({
            status: 'failed',
            failureReason: reason,
            failedAt: FieldValue.serverTimestamp(),
          });
          throw new HttpError(400, decodedError ?? 'PAYMENT_FAILED', reason);
        }

        // 14. Confirm final transaction result and update status to confirmed
        const logIndex = 0; // standard primary event index or from receipt
        const eventId = `${payResult.txHash}:${logIndex}`;
        await db.collection('transactions').doc(eventId).set({
          intentId: intent.intentId,
          userUid: caller.uid,
          merchantUid: intent.merchantUid,
          userAddress: studentWallet,
          merchantAddress: intent.merchantAddress,
          amount: intent.amount,
          category: intent.category,
          txHash: payResult.txHash,
          blockNumber: payResult.blockNumber,
          logIndex,
          status: 'confirmed',
          createdAt: FieldValue.serverTimestamp(),
        });

        await intentRef.update({
          status: 'confirmed',
          txHash: payResult.txHash,
          confirmedAt: FieldValue.serverTimestamp(),
        });

        // 15. Record audit information
        await audit.write({
          actorUid: caller.uid,
          action: 'payment.confirm',
          meta: {
            intentId: intent.intentId as `0x${string}`,
            amount: intent.amount,
            transactionHash: payResult.txHash as `0x${string}`,
            status: 'success',
          },
        });

        response.json({
          status: 'confirmed',
          txHash: payResult.txHash,
          intentId: intent.intentId,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  // ----------------------------------------------------
  // F. History & Analytics
  // ----------------------------------------------------

  router.get('/history', authenticated, async (request, response, next) => {
    try {
      const user = actor(response);
      const limit = Math.min(100, Math.max(1, Number(request.query.limit) || 20));

      let query = db.collection('transactions');
      if (user.role === 'merchant') {
        query = query.where('merchantUid', '==', user.uid) as never;
      } else {
        query = query.where('userUid', '==', user.uid) as never;
      }

      let transactions: Array<Record<string, unknown>> = [];
      try {
        const snapshot = await query.orderBy('createdAt', 'desc').limit(limit).get();
        transactions = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
      } catch {
        // Fall back to in-memory sort if Firestore composite index is missing
        const snapshot = await query.get();
        transactions = snapshot.docs
          .map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }))
          .sort((a, b) => {
            const rawA = a as Record<string, unknown>;
            const rawB = b as Record<string, unknown>;
            const timeA =
              (rawA.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
            const timeB =
              (rawB.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
            return timeB - timeA;
          })
          .slice(0, limit);
      }

      response.json({ transactions });
    } catch (error) {
      next(error);
    }
  });

  router.get('/analytics/spending', ...userOnly, async (_request, response, next) => {
    try {
      const user = actor(response);
      const thirtyDaysAgo = Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000);

      let docs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
      try {
        const snapshot = await db
          .collection('transactions')
          .where('userUid', '==', user.uid)
          .where('status', '==', 'confirmed')
          .where('createdAt', '>=', thirtyDaysAgo)
          .get();
        docs = snapshot.docs;
      } catch {
        // Fall back to in-memory filter if Firestore composite index is missing
        const snapshot = await db.collection('transactions').where('userUid', '==', user.uid).get();
        const thirtyDaysAgoMillis = thirtyDaysAgo.toMillis();
        docs = snapshot.docs.filter((doc) => {
          if (doc.get('status') !== 'confirmed') return false;
          const createdAt = doc.get('createdAt');
          const time =
            createdAt && typeof (createdAt as { toMillis?: () => number }).toMillis === 'function'
              ? (createdAt as { toMillis: () => number }).toMillis()
              : 0;
          return time >= thirtyDaysAgoMillis;
        });
      }

      const totalsByCategory: Record<string, number> = {};
      const totalsByDay: Record<string, number> = {};
      let totalSpent = 0;

      for (const doc of docs) {
        const amt = Number(doc.get('amount')) || 0;
        const cat = (doc.get('category') as string | undefined) ?? 'general';
        totalsByCategory[cat] = (totalsByCategory[cat] ?? 0) + amt;
        totalSpent += amt;

        const created = doc.get('createdAt') as Timestamp | undefined;
        if (created !== undefined && typeof created.toDate === 'function') {
          const dateStr = created.toDate().toISOString().split('T')[0]!;
          totalsByDay[dateStr] = (totalsByDay[dateStr] ?? 0) + amt;
        }
      }

      response.json({
        totalSpent,
        totalsByCategory,
        totalsByDay,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
