import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

const backendRequire = createRequire(new URL('../packages/backend/package.json', import.meta.url));
const { initializeApp, cert, getApps } = backendRequire('firebase-admin/app');
const { getAuth } = backendRequire('firebase-admin/auth');
const { getFirestore, FieldValue } = backendRequire('firebase-admin/firestore');
const { Contract, JsonRpcProvider, Wallet, getAddress, solidityPackedKeccak256, keccak256, toUtf8Bytes } = backendRequire('ethers');
const argon2 = backendRequire('argon2');

// 1. Load environment
function loadEnv() {
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), 'packages/backend/.env'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      const content = readFileSync(candidate, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnv();

const WALLET_SALT = process.env.WALLET_SALT || 'fingerpay-demo-salt-at-least-32-chars-long';
const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8545';
const ADMIN_KEY = process.env.ADMIN_PRIVATE_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

function deriveWalletAddress(uid, salt) {
  const digest = solidityPackedKeccak256(
    ['string', 'string', 'string'],
    ['fingerpay:wallet:', uid, salt]
  );
  return getAddress(`0x${digest.slice(-40)}`);
}

async function main() {
  console.log('--- FingerPay Demo Seeding ---');

  // Firebase initialization
  const projectId = process.env.FIREBASE_PROJECT_ID || 'fingerpay-48317';
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined;

  let app;
  if (getApps().length > 0) {
    app = getApps()[0];
  } else if (process.env.FIREBASE_AUTH_EMULATOR_HOST && process.env.FIRESTORE_EMULATOR_HOST) {
    console.log(`Connecting to Firebase Emulators at Auth:${process.env.FIREBASE_AUTH_EMULATOR_HOST}, Firestore:${process.env.FIRESTORE_EMULATOR_HOST}`);
    app = initializeApp({ projectId });
  } else if (clientEmail && privateKey) {
    console.log(`Connecting to Cloud Firebase Project: ${projectId} (Service Account: ${clientEmail})`);
    app = initializeApp({
      projectId,
      credential: cert({ projectId, clientEmail, privateKey }),
    });
  } else {
    console.log(`Using Firebase applicationDefault for project: ${projectId}`);
    app = initializeApp({ projectId });
  }

  const auth = getAuth(app);
  const db = getFirestore(app);

  // Contracts & Signers
  const provider = new JsonRpcProvider(RPC_URL);
  let networkReady = false;
  try {
    const net = await provider.getNetwork();
    console.log(`Connected to blockchain at ${RPC_URL} (Chain ID: ${net.chainId})`);
    networkReady = true;
  } catch (err) {
    console.warn(`[WARN] Blockchain node at ${RPC_URL} not reachable: ${err.message}. On-chain seeding will be skipped.`);
  }

  // Load contract addresses
  let fingerPayAddress = process.env.FINGERPAY_ADDRESS;
  let campusCoinAddress = process.env.CAMPUSCOIN_ADDRESS;
  const deploymentFile = resolve(process.cwd(), 'deployments/localhost.json');
  if (existsSync(deploymentFile)) {
    try {
      const dep = JSON.parse(readFileSync(deploymentFile, 'utf8'));
      if (dep.contracts?.fingerPay) fingerPayAddress = dep.contracts.fingerPay;
      if (dep.contracts?.campusCoin) campusCoinAddress = dep.contracts.campusCoin;
    } catch {
      // ignore
    }
  }

  const fingerPayAbi = JSON.parse(readFileSync(resolve(process.cwd(), 'packages/shared/src/abi/FingerPay.json'), 'utf8'));
  const adminSigner = new Wallet(ADMIN_KEY, provider);

  const fingerPay = networkReady && fingerPayAddress ? new Contract(fingerPayAddress, fingerPayAbi, adminSigner) : null;

  // 1. PRN Allowlist
  console.log('\n[1/5] Seeding PRN Allowlist...');
  const prns = [
    { prn: 'PRN2026001', name: 'Aarav Sharma', studentUid: 'student-aarav-demo' },
    { prn: 'PRN2026002', name: 'Ananya Rao', studentUid: 'student-ananya-demo' },
    { prn: 'PRN2026003', name: 'Rohan Gupta', studentUid: 'student-rohan-demo' },
    { prn: 'PRN2026004', name: 'Priya Nair', studentUid: 'student-priya-demo' },
    { prn: 'PRN2026005', name: 'Devansh Verma', studentUid: 'student-devansh-demo' },
    // Available PRNs for manual signup testing
    { prn: 'PRN2026006', name: 'Kavita Iyer', studentUid: null },
    { prn: 'PRN2026007', name: 'Vikram Malhotra', studentUid: null },
    { prn: 'PRN2026008', name: 'Neha Joshi', studentUid: null },
    { prn: 'PRN2026009', name: 'Aditya Singhania', studentUid: null },
    { prn: 'PRN2026010', name: 'Pooja Reddy', studentUid: null },
  ];

  for (const item of prns) {
    const prnRef = db.collection('prnAllowlist').doc(item.prn);
    await prnRef.set({
      prn: item.prn,
      name: item.name,
      used: item.studentUid !== null,
      usedBy: item.studentUid,
      usedAt: item.studentUid !== null ? FieldValue.serverTimestamp() : null,
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  console.log(`Seeded ${prns.length} PRNs in prnAllowlist (5 assigned, 5 free for live signup).`);

  // Helper to create or update auth user
  async function upsertAuthUser(uid, email, password, displayName) {
    try {
      await auth.createUser({
        uid,
        email,
        password,
        displayName,
        emailVerified: true,
      });
    } catch (err) {
      if (err.code === 'auth/uid-already-exists' || err.code === 'auth/email-already-exists') {
        await auth.updateUser(uid, {
          email,
          password,
          displayName,
          emailVerified: true,
        }).catch(() => {});
      } else {
        throw err;
      }
    }
  }

  // 2. Demo Admin
  console.log('\n[2/5] Seeding Demo Admin...');
  const adminUid = 'admin-fingerpay-demo';
  const adminEmail = 'admin@campus.edu';
  await upsertAuthUser(adminUid, adminEmail, 'Password123!', 'Campus Accounts Admin');
  await auth.setCustomUserClaims(adminUid, { role: 'admin' });
  await db.collection('users').doc(adminUid).set({
    name: 'Campus Accounts Admin',
    email: adminEmail,
    role: 'admin',
    status: 'approved',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  console.log(`Admin ready: ${adminEmail} (role: admin)`);

  // 3. Demo Merchants
  console.log('\n[3/5] Seeding Demo Merchants...');
  const merchants = [
    {
      uid: 'merchant-canteen-demo',
      email: 'canteen@campus.edu',
      name: 'Central Canteen Manager',
      shopName: 'Campus Central Canteen',
      category: 'food',
    },
    {
      uid: 'merchant-bookstore-demo',
      email: 'bookstore@campus.edu',
      name: 'University Bookstore Mgr',
      shopName: 'University Bookstore',
      category: 'stationery',
    },
  ];

  for (const m of merchants) {
    await upsertAuthUser(m.uid, m.email, 'Password123!', m.name);
    await auth.setCustomUserClaims(m.uid, { role: 'merchant' });
    const walletAddress = deriveWalletAddress(m.uid, WALLET_SALT);

    let onChainTx = null;
    if (fingerPay) {
      try {
        const isRegistered = await fingerPay.merchantRegistered(walletAddress);
        if (!isRegistered) {
          const metaHash = keccak256(toUtf8Bytes(m.shopName));
          const tx = await fingerPay.registerMerchant(walletAddress, metaHash);
          const receipt = await tx.wait();
          onChainTx = receipt.hash;
          console.log(`Registered merchant ${m.shopName} on-chain (tx: ${onChainTx.slice(0, 10)}...)`);
        } else {
          console.log(`Merchant ${m.shopName} already registered on-chain.`);
        }
      } catch (e) {
        console.warn(`Failed on-chain merchant registration for ${m.shopName}: ${e.message}`);
      }
    }

    await db.collection('merchants').doc(m.uid).set({
      shopName: m.shopName,
      category: m.category,
      walletAddress,
      status: 'approved',
      onChainRegisteredTx: onChainTx,
      approvedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    await db.collection('users').doc(m.uid).set({
      name: m.name,
      email: m.email,
      role: 'merchant',
      status: 'approved',
      walletAddress,
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    console.log(`Merchant ready: ${m.shopName} (${m.email}) -> wallet: ${walletAddress}`);
  }

  // 4. Five Demo Students
  console.log('\n[4/5] Seeding Demo Students & Token Balances...');
  const pinHash = await argon2.hash('9512', {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  const students = [
    { uid: 'student-aarav-demo', email: 'student1@campus.edu', name: 'Aarav Sharma', prn: 'PRN2026001', amount: 150n },
    { uid: 'student-ananya-demo', email: 'student2@campus.edu', name: 'Ananya Rao', prn: 'PRN2026002', amount: 100n },
    { uid: 'student-rohan-demo', email: 'student3@campus.edu', name: 'Rohan Gupta', prn: 'PRN2026003', amount: 75n },
    { uid: 'student-priya-demo', email: 'student4@campus.edu', name: 'Priya Nair', prn: 'PRN2026004', amount: 50n },
    { uid: 'student-devansh-demo', email: 'student5@campus.edu', name: 'Devansh Verma', prn: 'PRN2026005', amount: 200n },
  ];

  for (const s of students) {
    await upsertAuthUser(s.uid, s.email, 'Password123!', s.name);
    await auth.setCustomUserClaims(s.uid, { role: 'user' });
    const walletAddress = deriveWalletAddress(s.uid, WALLET_SALT);

    // Set PIN secret (PIN: 9512)
    await db.collection('pinSecrets').doc(s.uid).set({
      hash: pinHash,
      failedAttempts: 0,
      lockedUntil: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    // User document
    await db.collection('users').doc(s.uid).set({
      name: s.name,
      email: s.email,
      prn: s.prn,
      role: 'user',
      status: 'approved',
      walletAddress,
      passkeyRegistered: false,
      pinSet: true,
      webAuthnUserId: randomBytes(32).toString('base64url'),
      createdAt: FieldValue.serverTimestamp(),
      approvedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    // On-chain Minting
    if (fingerPay) {
      try {
        const campusCoinAbi = JSON.parse(readFileSync(resolve(process.cwd(), 'packages/shared/src/abi/CampusCoin.json'), 'utf8'));
        const campusCoin = new Contract(campusCoinAddress, campusCoinAbi, provider);
        const currentBal = await campusCoin.balanceOf(walletAddress);
        if (currentBal === 0n) {
          const receiptRef = `seed-mint-${s.prn}-${Date.now()}`;
          const receiptHash = keccak256(toUtf8Bytes(receiptRef));
          const tx = await fingerPay.mint(walletAddress, s.amount, receiptHash);
          const receipt = await tx.wait();
          console.log(`Minted ${s.amount} CPC to ${s.name} (${s.prn}) (tx: ${receipt.hash.slice(0, 10)}...)`);

          await db.collection('mints').doc(receipt.hash).set({
            adminUid,
            userUid: s.uid,
            prn: s.prn,
            amount: s.amount.toString(),
            receiptRef,
            txHash: receipt.hash,
            createdAt: FieldValue.serverTimestamp(),
          });
        } else {
          console.log(`${s.name} already has ${currentBal} CPC.`);
        }
      } catch (e) {
        console.warn(`Failed on-chain mint for ${s.name}: ${e.message}`);
      }
    }
    console.log(`Student ready: ${s.name} (${s.email}, PIN: 9512) -> wallet: ${walletAddress}`);
  }

  console.log('\n[5/5] Demo Seeding Complete!');
  console.log('\n================ DEMO ACCOUNTS SUMMARY ================');
  console.log('Password for all demo accounts: Password123!');
  console.log('Default Student PIN: 9512');
  console.log('-------------------------------------------------------');
  console.log('1. Admin:');
  console.log('   Email: admin@campus.edu');
  console.log('   Role: admin (Full access to mint, approvals, controls)');
  console.log('2. Merchants:');
  console.log('   - canteen@campus.edu (Campus Central Canteen)');
  console.log('   - bookstore@campus.edu (University Bookstore)');
  console.log('3. Students (Pre-minted CPC & PIN configured):');
  console.log('   - student1@campus.edu (PRN2026001, 150 CPC)');
  console.log('   - student2@campus.edu (PRN2026002, 100 CPC)');
  console.log('   - student3@campus.edu (PRN2026003, 75 CPC)');
  console.log('   - student4@campus.edu (PRN2026004, 50 CPC)');
  console.log('   - student5@campus.edu (PRN2026005, 200 CPC)');
  console.log('4. Available Free PRNs for Fresh Registration Test:');
  console.log('   - PRN2026006 to PRN2026010');
  console.log('=======================================================\n');
}

main().catch((err) => {
  console.error('Seed script encountered error:', err);
  process.exit(1);
});
