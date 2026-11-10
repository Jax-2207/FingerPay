import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
        // Child exited.
      }
    } else {
      child.kill('SIGTERM');
    }
  }
}

try {
  temporaryConfigDirectory = await mkdtemp(join(tmpdir(), 'fingerpay-phase3-'));
  const authPort = await availablePort();
  const firestorePort = await availablePort();
  const emulatorConfigPath = join(temporaryConfigDirectory, 'firebase.json');
  await writeFile(
    emulatorConfigPath,
    JSON.stringify({
      firestore: {
        rules: join(root, 'firebase', 'firestore.rules'),
      },
      emulators: {
        singleProjectMode: true,
        auth: { host: '127.0.0.1', port: authPort },
        firestore: { host: '127.0.0.1', port: firestorePort },
        ui: { enabled: false },
      },
    }),
  );

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

  console.log(`Emulators ready. Running Phase 3 test suites...`);
  await run(['test', 'packages/backend/test/phase3.test.ts', 'packages/backend/test/phase3.rules.test.ts'], {
    FIRESTORE_EMULATOR_HOST: `127.0.0.1:${firestorePort}`,
    FIREBASE_AUTH_EMULATOR_HOST: `127.0.0.1:${authPort}`,
  });
  console.log('Phase 3 tests passed successfully.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Phase 3 integration failed');
  process.exitCode = 1;
} finally {
  await cleanup();
  if (temporaryConfigDirectory !== undefined) {
    await rm(temporaryConfigDirectory, { recursive: true, force: true });
  }
}
