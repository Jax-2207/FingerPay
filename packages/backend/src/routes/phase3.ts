import { randomBytes, randomUUID } from 'node:crypto';
import { parse as parseCsv } from 'csv-parse/sync';
import argon2 from 'argon2';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { HttpError } from '../errors.js';
import {
  requireAuthentication,
  requireRole,
  type IdTokenVerifier,
  type AuthenticatedUser,
} from '../middleware/auth.js';
import { deriveWalletAddress } from '../services/wallet.js';
import type { ChainService } from '../services/chain.js';
import type { AuditLogger } from '../services/audit.js';
import type { AppConfig } from '../config.js';

const PrnRow = z
  .object({
    prn: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .refine((v) => !v.includes('/')),
    name: z.string().trim().min(1).max(120),
  })
  .strict();
const PrnInput = z.object({ records: z.array(PrnRow).min(1).max(400) }).strict();
const SignupInput = z.object({ prn: PrnRow.shape.prn }).strict();
const DecisionInput = z.object({ decision: z.enum(['approve', 'reject']) }).strict();
const PinInput = z.object({ pin: z.string().regex(/^\d{4,6}$/) }).strict();
const PasskeyVerifyInput = z
  .object({ challengeId: z.string().uuid(), response: z.unknown() })
  .strict();
const LoginOptionsInput = z.object({ prn: PrnRow.shape.prn }).strict();
const AdminParams = z.object({ uid: z.string().min(1) });
const ChallengeTtlMs = 5 * 60 * 1000;
const challengeRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_request, response) => {
    response.status(429).json({
      error: { code: 'RATE_LIMITED', message: 'Too many passkey requests; try again shortly' },
    });
  },
});

interface Phase3Dependencies {
  auth: Auth;
  firestore: Firestore;
  verifier: IdTokenVerifier;
  chain: Pick<ChainService, 'getTokenBalance'>;
  audit: AuditLogger;
  config: AppConfig;
}

interface ApiUser {
  uid: string;
  role?: string;
  authTime?: number;
}

function actor(response: Response): ApiUser {
  const user = (response.locals as Record<string, unknown>).auth as AuthenticatedUser | undefined;
  if (user === undefined) throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required');
  return user;
}

function body<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(400, 'INVALID_REQUEST', 'Request is invalid');
  return result.data;
}

function requireProfile(db: Firestore, allowed: string[] = ['approved']) {
  return async (_request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const user = actor(response);
      const snapshot = await db.collection('users').doc(user.uid).get();
      if (!snapshot.exists || !allowed.includes(String(snapshot.get('status')))) {
        next(new HttpError(403, 'ACCOUNT_NOT_APPROVED', 'Account is not approved'));
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

function challengeId(): string {
  return randomUUID();
}
export function isTrivialPin(pin: string): boolean {
  const digits = [...pin].map(Number);
  if (digits.every((digit) => digit === digits[0])) return true;
  const ascending = digits.every((digit, index) => index === 0 || digit === digits[index - 1]! + 1);
  const descending = digits.every(
    (digit, index) => index === 0 || digit === digits[index - 1]! - 1,
  );
  return ascending || descending;
}

export function getLockUntilMillis(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (
    value &&
    typeof value === 'object' &&
    'toMillis' in value &&
    typeof (value as { toMillis: () => number }).toMillis === 'function'
  ) {
    return (value as { toMillis: () => number }).toMillis();
  }
  return null;
}

export function createPhase3Router(deps: Phase3Dependencies): Router {
  const { auth, firestore: db, verifier, chain, audit, config } = deps;
  const router = Router();
  const authenticated = requireAuthentication(verifier);
  const admin = [authenticated, requireRole('admin')];
  const user = [authenticated, requireRole('user')];

  router.post('/admin/prn/import', ...admin, async (request, response, next) => {
    try {
      let records: z.infer<typeof PrnRow>[];
      if (typeof request.body === 'string') {
        try {
          records = body(
            z.array(PrnRow).min(1).max(400),
            parseCsv(request.body, {
              columns: true,
              skip_empty_lines: true,
              trim: true,
            }) as unknown,
          );
        } catch {
          throw new HttpError(400, 'INVALID_REQUEST', 'CSV must contain prn and name columns');
        }
      } else records = body(PrnInput, request.body).records;
      if (new Set(records.map((row) => row.prn)).size !== records.length)
        throw new HttpError(400, 'DUPLICATE_PRN', 'Import contains duplicate PRNs');
      const importer = actor(response);
      await db.runTransaction(async (transaction) => {
        const refs = records.map((row) => db.collection('prnAllowlist').doc(row.prn));
        const snapshots = await transaction.getAll(...refs);
        if (snapshots.some((snapshot) => snapshot.exists))
          throw new HttpError(409, 'PRN_EXISTS', 'One or more PRNs already exist');
        records.forEach((row, index) =>
          transaction.create(refs[index]!, {
            name: row.name,
            used: false,
            importedBy: importer.uid,
            importedAt: FieldValue.serverTimestamp(),
          }),
        );
      });
      await audit.write({
        actorUid: importer.uid,
        action: 'prn.import',
        meta: { status: 'success' },
      });
      response.status(201).json({ imported: records.length });
    } catch (error) {
      next(error);
    }
  });

  router.post('/auth/signup-profile', authenticated, async (request, response, next) => {
    try {
      const input = body(SignupInput, request.body);
      const signedIn = actor(response);
      const authUser = await auth.getUser(signedIn.uid);
      const prnRef = db.collection('prnAllowlist').doc(input.prn);
      const userRef = db.collection('users').doc(signedIn.uid);
      const walletAddress = deriveWalletAddress(signedIn.uid, config.WALLET_SALT);
      await db.runTransaction(async (transaction) => {
        const prn = await transaction.get(prnRef);
        const existing = await transaction.get(userRef);
        if (!prn.exists || prn.get('used') === true)
          throw new HttpError(403, 'PRN_INVALID', 'PRN is unavailable');
        if (existing.exists) throw new HttpError(409, 'PROFILE_EXISTS', 'Profile already exists');
        transaction.update(prnRef, {
          used: true,
          usedBy: signedIn.uid,
          usedAt: FieldValue.serverTimestamp(),
        });
        transaction.create(userRef, {
          name: prn.get('name'),
          email: authUser.email ?? null,
          prn: input.prn,
          role: 'user',
          status: 'pending',
          walletAddress,
          passkeyRegistered: false,
          pinSet: false,
          webAuthnUserId: randomBytes(32).toString('base64url'),
          createdAt: FieldValue.serverTimestamp(),
        });
      });
      await audit.write({ actorUid: signedIn.uid, action: 'profile.signup', meta: {} });
      response.status(201).json({ status: 'pending' });
    } catch (error) {
      next(error);
    }
  });

  router.get('/admin/users', ...admin, async (request, response, next) => {
    try {
      const status = typeof request.query.status === 'string' ? request.query.status : undefined;
      if (status !== undefined && !['pending', 'approved', 'rejected'].includes(status))
        throw new HttpError(400, 'INVALID_REQUEST', 'Status filter is invalid');
      let query: FirebaseFirestore.Query = db.collection('users');
      if (status !== undefined) query = query.where('status', '==', status);
      const result = await query.limit(100).get();
      response.json({
        users: result.docs.map((doc) => ({
          uid: doc.id,
          name: doc.get('name'),
          email: doc.get('email'),
          prn: doc.get('prn'),
          role: doc.get('role'),
          status: doc.get('status'),
          createdAt: doc.get('createdAt')?.toDate?.().toISOString(),
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/admin/users/:uid/decision', ...admin, async (request, response, next) => {
    try {
      const { uid } = body(AdminParams, request.params);
      const { decision } = body(DecisionInput, request.body);
      const userRef = db.collection('users').doc(uid);
      const snap = await userRef.get();
      if (!snap.exists || snap.get('status') !== 'pending')
        throw new HttpError(404, 'USER_NOT_PENDING', 'Pending user was not found');
      const role = decision === 'approve' ? 'user' : null;
      const firebaseUser = await auth.getUser(uid);
      await auth.setCustomUserClaims(uid, {
        ...firebaseUser.customClaims,
        ...(role === null ? { role: null } : { role }),
      });
      await userRef.update({
        status: decision === 'approve' ? 'approved' : 'rejected',
        decidedAt: FieldValue.serverTimestamp(),
        decidedBy: actor(response).uid,
      });
      await audit.write({ actorUid: actor(response).uid, action: `user.${decision}`, meta: {} });
      response.json({ uid, status: decision === 'approve' ? 'approved' : 'rejected' });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    '/passkey/register/options',
    challengeRateLimit,
    ...user,
    requireProfile(db),
    async (_request, response, next) => {
      try {
        const signedIn = actor(response);
        const profile = await db.collection('users').doc(signedIn.uid).get();
        if (profile.get('status') !== 'approved')
          throw new HttpError(403, 'ACCOUNT_NOT_APPROVED', 'Account is not approved');
        const keys = await db.collection('passkeys').where('uid', '==', signedIn.uid).get();
        const options = await generateRegistrationOptions({
          rpName: config.WEBAUTHN_RP_NAME,
          rpID: config.WEBAUTHN_RP_ID,
          userName: String(profile.get('prn')),
          userDisplayName: String(profile.get('name')),
          userID: Buffer.from(String(profile.get('webAuthnUserId')), 'base64url'),
          authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
          excludeCredentials: keys.docs.map((doc) => ({
            id: doc.id,
            transports: (doc.get('transports') as string[] | undefined) ?? [],
          })),
        });
        const id = challengeId();
        await db
          .collection('webauthnChallenges')
          .doc(id)
          .create({
            uid: signedIn.uid,
            challenge: options.challenge,
            purpose: 'registration',
            expiresAt: Timestamp.fromMillis(Date.now() + ChallengeTtlMs),
            createdAt: FieldValue.serverTimestamp(),
          });
        response.json({ challengeId: id, options });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/passkey/register/verify',
    ...user,
    requireProfile(db),
    async (request, response, next) => {
      try {
        const signedIn = actor(response);
        const input = body(PasskeyVerifyInput, request.body);
        const challenge = await consumeChallenge(
          db,
          input.challengeId,
          signedIn.uid,
          'registration',
        );
        const verified = await verifyRegistrationResponse({
          response: input.response as Parameters<typeof verifyRegistrationResponse>[0]['response'],
          expectedChallenge: challenge.challenge,
          expectedOrigin: config.WEBAUTHN_ORIGIN,
          expectedRPID: config.WEBAUTHN_RP_ID,
          requireUserVerification: true,
        });
        if (!verified.verified || verified.registrationInfo === undefined)
          throw new HttpError(400, 'PASSKEY_INVALID', 'Passkey registration could not be verified');
        const credential = verified.registrationInfo.credential;
        const keyRef = db.collection('passkeys').doc(credential.id);
        await db.runTransaction(async (transaction) => {
          const key = await transaction.get(keyRef);
          if (key.exists)
            throw new HttpError(409, 'PASSKEY_EXISTS', 'Passkey is already registered');
          transaction.create(keyRef, {
            uid: signedIn.uid,
            publicKey: Buffer.from(credential.publicKey).toString('base64url'),
            counter: credential.counter,
            transports: credential.transports ?? [],
            deviceType: verified.registrationInfo.credentialDeviceType,
            backedUp: verified.registrationInfo.credentialBackedUp,
            createdAt: FieldValue.serverTimestamp(),
          });
          transaction.update(db.collection('users').doc(signedIn.uid), { passkeyRegistered: true });
        });
        response.json({ verified: true });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post('/passkey/auth/options', challengeRateLimit, async (request, response, next) => {
    try {
      const { prn } = body(LoginOptionsInput, request.body);
      const matches = await db.collection('users').where('prn', '==', prn).limit(1).get();
      const profile = matches.docs[0];
      const keys =
        profile === undefined
          ? []
          : (await db.collection('passkeys').where('uid', '==', profile.id).get()).docs;
      if (profile === undefined || profile.get('status') !== 'approved' || keys.length === 0)
        throw new HttpError(401, 'AUTHENTICATION_FAILED', 'Unable to authenticate');
      const options = await generateAuthenticationOptions({
        rpID: config.WEBAUTHN_RP_ID,
        userVerification: 'required',
        allowCredentials: keys.map((doc) => ({
          id: doc.id,
          transports: (doc.get('transports') as string[] | undefined) ?? [],
        })),
      });
      const id = challengeId();
      await db
        .collection('webauthnChallenges')
        .doc(id)
        .create({
          uid: profile.id,
          challenge: options.challenge,
          purpose: 'authentication',
          expiresAt: Timestamp.fromMillis(Date.now() + ChallengeTtlMs),
          createdAt: FieldValue.serverTimestamp(),
        });
      response.json({ challengeId: id, options });
    } catch (error) {
      next(error);
    }
  });

  router.post('/passkey/auth/verify', async (request, response, next) => {
    try {
      const input = body(PasskeyVerifyInput, request.body);
      const credentialResponse = input.response as { id?: unknown };
      if (typeof credentialResponse.id !== 'string')
        throw new HttpError(400, 'PASSKEY_INVALID', 'Passkey response is invalid');
      const keyRef = db.collection('passkeys').doc(credentialResponse.id);
      const key = await keyRef.get();
      if (!key.exists) throw new HttpError(401, 'AUTHENTICATION_FAILED', 'Unable to authenticate');
      const challenge = await consumeChallenge(
        db,
        input.challengeId,
        String(key.get('uid')),
        'authentication',
      );
      const profileRef = db.collection('users').doc(String(key.get('uid')));
      const profile = await profileRef.get();
      if (!profile.exists || profile.get('status') !== 'approved')
        throw new HttpError(401, 'AUTHENTICATION_FAILED', 'Unable to authenticate');
      const credential = {
        id: key.id,
        publicKey: Buffer.from(String(key.get('publicKey')), 'base64url'),
        counter: Number(key.get('counter')),
        transports: (key.get('transports') as string[] | undefined) ?? [],
      };
      const verified = await verifyAuthenticationResponse({
        response: input.response as Parameters<typeof verifyAuthenticationResponse>[0]['response'],
        expectedChallenge: challenge.challenge,
        expectedOrigin: config.WEBAUTHN_ORIGIN,
        expectedRPID: config.WEBAUTHN_RP_ID,
        credential,
        requireUserVerification: true,
      });
      if (!verified.verified)
        throw new HttpError(401, 'AUTHENTICATION_FAILED', 'Unable to authenticate');
      await db.runTransaction(async (transaction) => {
        const fresh = await transaction.get(keyRef);
        if (!fresh.exists || Number(fresh.get('counter')) !== credential.counter)
          throw new HttpError(401, 'AUTHENTICATION_FAILED', 'Unable to authenticate');
        transaction.update(keyRef, {
          counter: verified.authenticationInfo.newCounter,
          lastUsedAt: FieldValue.serverTimestamp(),
        });
      });
      const customToken = await auth.createCustomToken(profile.id, { role: 'user' });
      response.json({ token: customToken });
    } catch (error) {
      next(error);
    }
  });

  router.post('/pin/set', ...user, requireProfile(db), async (request, response, next) => {
    try {
      const signedIn = actor(response);
      const { pin } = body(PinInput, request.body);
      if (isTrivialPin(pin))
        throw new HttpError(400, 'PIN_TOO_WEAK', 'Choose a less predictable PIN');
      const secretRef = db.collection('pinSecrets').doc(signedIn.uid);
      const hash = await argon2.hash(pin, {
        type: argon2.argon2id,
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1,
      });
      await db.runTransaction(async (transaction) => {
        const secret = await transaction.get(secretRef);
        if (secret.exists) throw new HttpError(409, 'PIN_ALREADY_SET', 'PIN is already set');
        transaction.create(secretRef, {
          hash,
          failedAttempts: 0,
          lockedUntil: null,
          createdAt: FieldValue.serverTimestamp(),
        });
        transaction.update(db.collection('users').doc(signedIn.uid), { pinSet: true });
      });
      response.status(201).json({ pinSet: true });
    } catch (error) {
      next(error);
    }
  });

  router.post('/pin/verify', ...user, requireProfile(db), async (request, response, next) => {
    try {
      const signedIn = actor(response);
      const { pin } = body(PinInput, request.body);
      const secretRef = db.collection('pinSecrets').doc(signedIn.uid);
      const snapshot = await secretRef.get();
      if (!snapshot.exists) throw new HttpError(404, 'PIN_NOT_SET', 'PIN has not been set');
      const now = Date.now();
      const lockedUntilMillis = getLockUntilMillis(snapshot.get('lockedUntil'));
      if (lockedUntilMillis !== null && lockedUntilMillis > now)
        throw new HttpError(423, 'PIN_LOCKED', 'PIN verification is temporarily locked');
      const matches = await argon2.verify(String(snapshot.get('hash')), pin);
      await db.runTransaction(async (transaction) => {
        const fresh = await transaction.get(secretRef);
        if (!fresh.exists) throw new HttpError(404, 'PIN_NOT_SET', 'PIN has not been set');
        const freshLockMillis = getLockUntilMillis(fresh.get('lockedUntil'));
        if (freshLockMillis !== null && freshLockMillis > Date.now())
          throw new HttpError(423, 'PIN_LOCKED', 'PIN verification is temporarily locked');
        const lockExpired = freshLockMillis !== null && freshLockMillis <= Date.now();
        if (matches) transaction.update(secretRef, { failedAttempts: 0, lockedUntil: null });
        else {
          const failures = lockExpired ? 1 : Number(fresh.get('failedAttempts') ?? 0) + 1;
          transaction.update(secretRef, {
            failedAttempts: failures,
            lockedUntil: failures >= 5 ? Timestamp.fromMillis(Date.now() + 15 * 60 * 1000) : null,
          });
        }
      });
      if (!matches) throw new HttpError(401, 'PIN_INVALID', 'PIN is incorrect');
      response.json({ verified: true });
    } catch (error) {
      next(error);
    }
  });

  router.get('/me', authenticated, async (_request, response, next) => {
    try {
      const signedIn = actor(response);
      const snapshot = await db.collection('users').doc(signedIn.uid).get();
      if (signedIn.role === 'admin') {
        const name = snapshot.exists ? snapshot.get('name') : 'Campus Accounts Admin';
        const email = snapshot.exists ? snapshot.get('email') : 'admin@campus.edu';
        response.json({
          uid: signedIn.uid,
          name,
          email,
          prn: 'ADMIN',
          role: 'admin',
          status: 'approved',
          walletAddress: '',
          balance: '0',
          passkeyRegistered: true,
          pinSet: true,
        });
        return;
      }
      if (!snapshot.exists) throw new HttpError(404, 'PROFILE_NOT_FOUND', 'Profile was not found');
      const walletAddress = String(snapshot.get('walletAddress'));
      const balance = await chain.getTokenBalance(walletAddress);
      response.json({
        uid: signedIn.uid,
        name: snapshot.get('name'),
        email: snapshot.get('email'),
        prn: snapshot.get('prn'),
        role: snapshot.get('role'),
        status: snapshot.get('status'),
        walletAddress,
        balance: balance.toString(),
        passkeyRegistered: snapshot.get('passkeyRegistered') === true,
        pinSet: snapshot.get('pinSet') === true,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

async function consumeChallenge(
  db: Firestore,
  id: string,
  uid: string,
  purpose: string,
): Promise<{ challenge: string }> {
  const ref = db.collection('webauthnChallenges').doc(id);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const expiresAt = snapshot.get('expiresAt');
    if (
      !snapshot.exists ||
      snapshot.get('uid') !== uid ||
      snapshot.get('purpose') !== purpose ||
      !(expiresAt instanceof Timestamp) ||
      expiresAt.toMillis() <= Date.now()
    )
      throw new HttpError(401, 'CHALLENGE_INVALID', 'Challenge is expired or invalid');
    transaction.delete(ref);
    return { challenge: String(snapshot.get('challenge')) };
  });
}
