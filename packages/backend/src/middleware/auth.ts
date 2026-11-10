import type { RequestHandler } from 'express';
import type { Auth } from 'firebase-admin/auth';
import { AppRoleSchema, API_ERROR_CODES, type AppRole } from '@fingerpay/shared';
import { HttpError } from '../errors.js';

export interface VerifiedToken {
  uid: string;
  role?: unknown;
  authTime?: number;
}

export interface IdTokenVerifier {
  verifyIdToken(token: string): Promise<VerifiedToken>;
}

export class FirebaseIdTokenVerifier implements IdTokenVerifier {
  constructor(private readonly auth: Auth) {}

  async verifyIdToken(token: string): Promise<VerifiedToken> {
    const claims = await this.auth.verifyIdToken(token);
    return { uid: claims.uid, role: claims.role, authTime: claims.auth_time };
  }
}

export interface AuthenticatedUser {
  uid: string;
  role?: AppRole;
  authTime?: number;
}

export function requireAuthentication(verifier: IdTokenVerifier): RequestHandler {
  return async (request, response, next) => {
    const authorization = request.get('authorization');
    const match = authorization?.match(/^Bearer\s+([^\s]+)$/i);
    const token = match?.[1];
    if (token === undefined) {
      next(new HttpError(401, API_ERROR_CODES.unauthorized, 'Authentication required'));
      return;
    }

    try {
      const claims = await verifier.verifyIdToken(token);
      if (claims.uid.length === 0) {
        next(new HttpError(401, API_ERROR_CODES.unauthorized, 'Invalid authentication token'));
        return;
      }

      const role = AppRoleSchema.safeParse(claims.role);
      const localState = response.locals as Record<string, unknown>;
      localState.auth = {
        uid: claims.uid,
        ...(role.success ? { role: role.data } : {}),
        ...(claims.authTime === undefined ? {} : { authTime: claims.authTime }),
      };
      next();
    } catch {
      next(new HttpError(401, API_ERROR_CODES.unauthorized, 'Invalid authentication token'));
    }
  };
}

export function requireRole(...roles: AppRole[]): RequestHandler {
  return (_request, response, next) => {
    const auth = (response.locals as Record<string, unknown>).auth as AuthenticatedUser | undefined;
    if (auth === undefined) {
      next(new HttpError(401, API_ERROR_CODES.unauthorized, 'Authentication required'));
      return;
    }
    if (auth.role === undefined || !roles.includes(auth.role)) {
      next(new HttpError(403, API_ERROR_CODES.forbidden, 'Insufficient role'));
      return;
    }
    next();
  };
}
