import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { HEALTH_PATH, MAX_JSON_BODY_BYTES, type HealthResponse } from '@fingerpay/shared';
import type { AppConfig } from './config.js';
import { createErrorHandler } from './errors.js';
import { createHttpLogger } from './logger.js';
import type { ChainHealth } from './services/chain.js';

export interface HealthProvider {
  getHealth(): Promise<ChainHealth>;
}

export interface AppDependencies {
  config: AppConfig;
  chain: HealthProvider;
  logger: Logger;
}

export function createApp({ config, chain, logger }: AppDependencies): Express {
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

  app.use(createErrorHandler(logger));
  return app;
}
