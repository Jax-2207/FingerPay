import pino, { type LoggerOptions } from 'pino';
import { pinoHttp } from 'pino-http';
import { randomUUID } from 'node:crypto';
import type { AppConfig } from './config.js';

export function createLogger(config: AppConfig) {
  const options: LoggerOptions = {
    level: config.NODE_ENV === 'test' ? 'silent' : 'info',
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers.x-api-key',
        'relayerPrivateKey',
        'walletSalt',
        'pin',
        'assertion',
      ],
      censor: '[REDACTED]',
    },
  };
  return pino(options);
}

export function createHttpLogger(logger: ReturnType<typeof createLogger>) {
  return pinoHttp({ logger, genReqId: () => randomUUID() });
}
