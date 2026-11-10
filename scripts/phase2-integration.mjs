import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const sharedRequire = createRequire(new URL('../packages/shared/package.json', import.meta.url));
const { Contract, JsonRpcProvider } = sharedRequire('ethers');

const root = process.cwd();
const rpcUrl = 'http://127.0.0.1:8545';
const backendPort = 4100;
const backendUrl = `http://127.0.0.1:${backendPort}`;
const children = new Set();
let temporaryConfigDirectory;
const corepackCli = join(
  dirname(process.execPath),
  'node_modules',
  'corepack',
  'dist',
  'corepack.js',
);
const command = (args, options = {}) =>
  spawn(process.execPath, [corepackCli, 'pnpm', ...args], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
    ...options,
  });

function start(args, env = {}, options = {}) {
  const child = command(args, { env: { ...process.env, ...env }, ...options });
  children.add(child);
  child.once('exit', () => children.delete(child));
  return child;
}

async function run(args) {
  const child = command(args);
  const [code] = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (exitCode, signal) => resolve([exitCode, signal]));
  });
  if (code !== 0) throw new Error(`Command failed: pnpm ${args.join(' ')}`);
}

async function waitFor(label, check, child) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`${label} exited with code ${child.exitCode}`);
    try {
      if (await check()) return;
    } catch {
      // Service is still starting.
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string')
    throw new Error('Could not allocate a local port');
  const port = address.port;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

async function cleanup() {
  for (const child of children) {
    if (child.pid === undefined) continue;
    if (process.platform === 'win32') {
      try {
        execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      } catch {
        // The child already exited.
      }
    } else {
      child.kill('SIGTERM');
    }
  }
}

try {
  temporaryConfigDirectory = await mkdtemp(join(tmpdir(), 'fingerpay-phase2-'));
  const authPort = await availablePort();
  const firestorePort = await availablePort();
  const emulatorConfigPath = join(temporaryConfigDirectory, 'firebase.json');
  await writeFile(
    emulatorConfigPath,
    JSON.stringify({
      emulators: {
        singleProjectMode: true,
        auth: { host: '127.0.0.1', port: authPort },
        firestore: { host: '127.0.0.1', port: firestorePort },
        ui: { enabled: false },
      },
    }),
  );

  const node = start(['--filter', '@fingerpay/contracts', 'node'], {}, { stdio: 'ignore' });
  await waitFor(
    'Hardhat node',
    async () => {
      const provider = new JsonRpcProvider(rpcUrl);
      try {
        return (await provider.send('eth_chainId', [])) === '0x7a69';
      } finally {
        await provider.destroy();
      }
    },
    node,
  );

  await run(['--filter', '@fingerpay/contracts', 'run', 'deploy', '--network', 'localhost']);
  await run(['--filter', '@fingerpay/shared', 'build']);
  await run(['--filter', '@fingerpay/backend', 'build']);
  const deployment = JSON.parse(
    await readFile('packages/contracts/deployments/localhost.json', 'utf8'),
  );
  const artifact = JSON.parse(
    await readFile('packages/contracts/artifacts/contracts/FingerPay.sol/FingerPay.json', 'utf8'),
  );
  const { computeIntentId } = await import('../packages/shared/dist/src/index.js');
  const provider = new JsonRpcProvider(rpcUrl);
  const contract = new Contract(deployment.contracts.fingerPay, artifact.abi, provider);
  const values = {
    chainId: BigInt(deployment.chainId),
    contract: deployment.contracts.fingerPay,
    merchant: '0x0000000000000000000000000000000000000002',
    amount: 17n,
    nonce: `0x${'34'.repeat(32)}`,
    expiry: 1_900_000_000n,
  };
  const onChain = await contract
    .getFunction('computeIntentId')
    .staticCall(values.merchant, values.amount, values.nonce, values.expiry);
  if (onChain !== computeIntentId(values))
    throw new Error('Shared intent hash differs from contract result');
  await provider.destroy();

  const firebase = start([
    'dlx',
    'firebase-tools@15.35.0',
    'emulators:start',
    '--config',
    emulatorConfigPath,
    '--project',
    'demo-fingerpay',
    '--only',
    'auth,firestore',
  ]);
  await waitFor(
    'Firebase Auth emulator',
    async () => {
      const response = await fetch(`http://127.0.0.1:${authPort}`);
      return response.status < 500;
    },
    firebase,
  );
  await waitFor(
    'Firestore emulator',
    async () => {
      const response = await fetch(`http://127.0.0.1:${firestorePort}`);
      return response.status < 500;
    },
    firebase,
  );

  const server = start(['exec', 'node', 'packages/backend/dist/src/server.js'], {
    NODE_ENV: 'test',
    PORT: String(backendPort),
    FIREBASE_PROJECT_ID: 'demo-fingerpay',
    FIREBASE_AUTH_EMULATOR_HOST: `127.0.0.1:${authPort}`,
    FIRESTORE_EMULATOR_HOST: `127.0.0.1:${firestorePort}`,
    CORS_ORIGINS: 'http://localhost:5173',
    RPC_URL: rpcUrl,
    CHAIN_ID: deployment.chainId,
    RELAYER_PRIVATE_KEY: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    FINGERPAY_ADDRESS: deployment.contracts.fingerPay,
    CAMPUSCOIN_ADDRESS: deployment.contracts.campusCoin,
    WALLET_SALT: 'phase-two-local-only-wallet-salt-1234567890',
    WEBAUTHN_RP_ID: 'localhost',
    WEBAUTHN_RP_NAME: 'FingerPay',
    WEBAUTHN_ORIGIN: 'http://localhost:5173',
  });
  await waitFor(
    'backend health endpoint',
    async () => {
      const response = await fetch(`${backendUrl}/health`);
      if (!response.ok) return false;
      const body = await response.json();
      return body.status === 'ok' && body.blockchain.connected === true;
    },
    server,
  );
  console.log(
    'Phase 2 integration passed: local contract hash, Firebase emulators, and backend health.',
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Phase 2 integration failed');
  process.exitCode = 1;
} finally {
  await cleanup();
  if (temporaryConfigDirectory !== undefined) {
    await rm(temporaryConfigDirectory, { recursive: true, force: true });
  }
}
