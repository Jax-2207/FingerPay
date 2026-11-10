import { createServer, type Server } from 'node:http';
import express from 'express';
import pino from 'pino';
import { getAddress, solidityPackedKeccak256 } from 'ethers';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { ConfigurationError, loadConfig } from '../src/config.js';
import { createErrorHandler } from '../src/errors.js';
import {
  requireAuthentication,
  requireRole,
  type IdTokenVerifier,
} from '../src/middleware/auth.js';
import { SerialRelayerQueue } from '../src/services/relayer.js';
import { deriveWalletAddress } from '../src/services/wallet.js';

const validEnvironment = {
  FIREBASE_PROJECT_ID: 'demo-fingerpay',
  CORS_ORIGINS: 'http://localhost:5173',
  RPC_URL: 'http://127.0.0.1:8545',
  CHAIN_ID: '31337',
  RELAYER_PRIVATE_KEY: `0x${'11'.repeat(32)}`,
  FINGERPAY_ADDRESS: '0x0000000000000000000000000000000000000001',
  CAMPUSCOIN_ADDRESS: '0x0000000000000000000000000000000000000002',
  WALLET_SALT: 'a-secure-local-wallet-salt-value-123456',
  NODE_ENV: 'test',
};

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          ),
      ),
  );
});

async function listen(app: express.Express): Promise<string> {
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string')
    throw new Error('Expected TCP server address');
  return `http://127.0.0.1:${address.port}`;
}

describe('Phase 2 backend foundation', () => {
  it('/health reports application and blockchain connectivity', async () => {
    const config = loadConfig(validEnvironment);
    const app = createApp({
      config,
      chain: { getHealth: async () => ({ connected: true, chainId: '31337' }) },
      logger: pino({ level: 'silent' }),
    });
    const response = await fetch(`${await listen(app)}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'ok',
      blockchain: { connected: true, chainId: '31337' },
    });
  });

  it('rejects missing and invalid tokens, denies the wrong role, and accepts an authorized role', async () => {
    const verifier: IdTokenVerifier = {
      verifyIdToken: async (token) => {
        if (token === 'invalid') throw new Error('verification failed');
        return { uid: 'uid-1', role: token === 'user' ? 'user' : 'admin' };
      },
    };
    const app = express();
    app.get(
      '/admin',
      requireAuthentication(verifier),
      requireRole('admin'),
      (_request, response) => {
        response.status(200).json({ accepted: true });
      },
    );
    app.use(createErrorHandler(pino({ level: 'silent' })));
    const url = `${await listen(app)}/admin`;

    expect((await fetch(url)).status).toBe(401);
    expect((await fetch(url, { headers: { authorization: 'Bearer invalid' } })).status).toBe(401);
    expect((await fetch(url, { headers: { authorization: 'Bearer user' } })).status).toBe(403);
    expect((await fetch(url, { headers: { authorization: 'Bearer admin' } })).status).toBe(200);
  });

  it('serializes queued operations even after a rejected operation', async () => {
    const queue = new SerialRelayerQueue();
    const order: string[] = [];
    let active = 0;
    let maxActive = 0;
    const run = (name: string, fail = false) =>
      queue.enqueue(async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        order.push(`${name}:start`);
        await new Promise((resolve) => setTimeout(resolve, 5));
        order.push(`${name}:end`);
        active -= 1;
        if (fail) throw new Error(name);
        return name;
      });

    const first = run('first', true);
    const second = run('second');
    await expect(first).rejects.toThrow('first');
    await expect(second).resolves.toBe('second');
    expect(maxActive).toBe(1);
    expect(order).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
  });

  it('rejects missing or invalid environment configuration without exposing values', () => {
    expect(() => loadConfig({})).toThrow(ConfigurationError);
    const error = (() => {
      try {
        loadConfig({ ...validEnvironment, RELAYER_PRIVATE_KEY: 'sensitive-value' });
      } catch (caught) {
        return caught;
      }
      throw new Error('Expected invalid configuration');
    })();
    expect(error).toBeInstanceOf(ConfigurationError);
    expect((error as Error).message).not.toContain('sensitive-value');
  });

  it('derives the approved deterministic wallet address', () => {
    const uid = 'campus-user-123';
    const salt = 'a-secure-local-wallet-salt-value-123456';
    const digest = solidityPackedKeccak256(
      ['string', 'string', 'string'],
      ['fingerpay:wallet:', uid, salt],
    );
    expect(deriveWalletAddress(uid, salt)).toBe(getAddress(`0x${digest.slice(-40)}`));
  });
});
