import type { AppConfig } from './config.js';
import { createApp } from './app.js';
import { initializeFirebase } from './firebase.js';
import { createLogger } from './logger.js';
import { AuditLogger } from './services/audit.js';
import { ChainService } from './services/chain.js';
import { RelayerService } from './services/relayer.js';
import { LimitsService } from './services/limits.js';
import { IndexerService } from './services/indexer.js';
import { FirebaseIdTokenVerifier } from './middleware/auth.js';

export function createRuntime(config: AppConfig) {
  const logger = createLogger(config);
  const firebase = initializeFirebase(config);
  const tokenVerifier = new FirebaseIdTokenVerifier(firebase.auth);
  const chain = new ChainService(config);
  const relayer = new RelayerService(config, chain.provider);
  const audit = new AuditLogger(firebase.firestore, logger);
  const limits = new LimitsService(firebase.firestore, config);
  const indexer = new IndexerService({
    firestore: firebase.firestore,
    provider: chain.provider,
    config,
    logger,
  });
  const app = createApp({
    config,
    chain,
    logger,
    auth: firebase.auth,
    firestore: firebase.firestore,
    tokenVerifier,
    audit,
    relayer,
    limits,
  });
  return { app, audit, chain, firebase, indexer, limits, logger, relayer, tokenVerifier };
}
