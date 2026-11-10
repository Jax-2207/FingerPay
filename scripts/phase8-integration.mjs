import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const root = process.cwd();
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

async function run(args, env = {}) {
  const child = command(args, { env: { ...process.env, ...env } });
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
      // Service starting
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to allocate port')));
        return;
      }
      const { port } = address;
      server.close((closeError) => (closeError ? reject(closeError) : resolve(port)));
    });
  });
}

async function cleanup() {
  for (const child of children) {
    if (child.exitCode === null) {
      if (process.platform === 'win32' && child.pid !== undefined) {
        try {
          execFileSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
        } catch {
          // Process already ended
        }
      } else {
        child.kill('SIGTERM');
      }
    }
  }
}

process.on('SIGINT', async () => {
  await cleanup();
  process.exit(1);
});

process.on('SIGTERM', async () => {
  await cleanup();
  process.exit(1);
});

try {
  const authPort = await getAvailablePort();
  const firestorePort = await getAvailablePort();
  temporaryConfigDirectory = await mkdtemp(join(tmpdir(), 'fingerpay-phase8-firebase-'));
  const configPath = join(temporaryConfigDirectory, 'firebase.json');

  await writeFile(
    configPath,
    JSON.stringify(
      {
        firestore: {
          rules: join(root, 'firebase', 'firestore.rules'),
        },
        emulators: {
          singleProjectMode: true,
          auth: { host: '127.0.0.1', port: authPort },
          firestore: { host: '127.0.0.1', port: firestorePort },
          ui: { enabled: false },
        },
      },
      null,
      2,
    ),
  );

  console.log('Starting Firebase emulators for Phase 8 security suite...');
  const firebase = start([
    'dlx',
    'firebase-tools@15.35.0',
    'emulators:start',
    '--config',
    configPath,
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

  console.log(`Emulators ready. Running Phase 8 Security test suite...`);
  await run(['test', 'packages/backend/test/phase8.security.test.ts'], {
    FIRESTORE_EMULATOR_HOST: `127.0.0.1:${firestorePort}`,
    FIREBASE_AUTH_EMULATOR_HOST: `127.0.0.1:${authPort}`,
  });
  console.log('Phase 8 security tests passed successfully.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Phase 8 test execution failed');
  process.exitCode = 1;
} finally {
  await cleanup();
  if (temporaryConfigDirectory !== undefined) {
    await rm(temporaryConfigDirectory, { recursive: true, force: true });
  }
}
