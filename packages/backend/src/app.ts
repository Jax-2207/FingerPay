import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { HEALTH_PATH, MAX_JSON_BODY_BYTES, type HealthResponse } from '@fingerpay/shared';
import type { AppConfig } from './config.js';
import { createErrorHandler } from './errors.js';
import { createHttpLogger } from './logger.js';
import type { ChainHealth } from './services/chain.js';
import { createPhase3Router } from './routes/phase3.js';
import { createPhase4Router } from './routes/phase4.js';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import type { IdTokenVerifier } from './middleware/auth.js';
import type { AuditLogger } from './services/audit.js';
import type { ChainService } from './services/chain.js';
import type { RelayerService } from './services/relayer.js';
import { LimitsService } from './services/limits.js';

export interface HealthProvider {
  getHealth(): Promise<ChainHealth>;
}

export interface AppDependencies {
  config: AppConfig;
  chain: HealthProvider & Pick<ChainService, 'getTokenBalance'>;
  logger: Logger;
  auth: Auth;
  firestore: Firestore;
  tokenVerifier: IdTokenVerifier;
  audit: AuditLogger;
  relayer?: RelayerService;
  limits?: LimitsService;
}

export function createApp({
  config,
  chain,
  logger,
  auth,
  firestore,
  tokenVerifier,
  audit,
  relayer,
  limits,
}: AppDependencies): Express {
  const app = express();
  const allowedOrigins = new Set(config.CORS_ORIGINS);

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        if (origin === undefined || allowedOrigins.has(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error('Origin is not allowed'));
      },
      credentials: false,
    }),
  );
  app.use('/api/admin/prn/import', express.text({ type: 'text/csv', limit: MAX_JSON_BODY_BYTES }));
  app.use(express.json({ limit: MAX_JSON_BODY_BYTES }));
  app.use(createHttpLogger(logger));

  app.get(HEALTH_PATH, async (_request, response) => {
    try {
      const chainHealth = await chain.getHealth();
      const body: HealthResponse = {
        status: chainHealth.connected ? 'ok' : 'degraded',
        blockchain: {
          connected: chainHealth.connected,
          ...(chainHealth.chainId === undefined ? {} : { chainId: chainHealth.chainId }),
        },
      };
      response.status(chainHealth.connected ? 200 : 503).json(body);
    } catch {
      response.status(503).json({
        status: 'degraded',
        blockchain: { connected: false },
      });
    }
  });

  app.use(
    '/api',
    createPhase3Router({ auth, firestore, verifier: tokenVerifier, chain, audit, config }),
  );

  if (relayer !== undefined) {
    const limitsService = limits ?? new LimitsService(firestore, config);
    app.use(
      '/api',
      createPhase4Router({
        auth,
        firestore,
        verifier: tokenVerifier,
        chain: chain as ChainService,
        relayer,
        limits: limitsService,
        audit,
        config,
      }),
    );
  }

  app.use(createErrorHandler(logger));
  return app;
}
