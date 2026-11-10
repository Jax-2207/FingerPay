import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, describe, it } from 'vitest';

const emulator = process.env.FIRESTORE_EMULATOR_HOST;
const rulesSuite = describe.skipIf(emulator === undefined)('Phase 3 Firestore rules', () => {
  let environment: RulesTestEnvironment;
  const uid = 'student-1';

  beforeAll(async () => {
    const [host, portText] = emulator!.split(':');
    environment = await initializeTestEnvironment({
      projectId: `fingerpay-rules-${randomUUID()}`,
      firestore: {
        host: host!,
        port: Number(portText),
        rules: await readFile(join(process.cwd(), 'firebase/firestore.rules'), 'utf8'),
      },
    });
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', uid), {
        name: 'Student',
        role: 'user',
        status: 'approved',
        walletAddress: '0x123',
      });
      await setDoc(doc(context.firestore(), 'passkeys', 'credential-1'), {
        uid,
        publicKey: 'secret',
      });
      await setDoc(doc(context.firestore(), 'pinSecrets', uid), { hash: 'secret' });
      await setDoc(doc(context.firestore(), 'prnAllowlist', 'PRN-1'), { used: false });
    });
  });

  afterAll(async () => {
    await environment?.cleanup();
  });

  it('allows only the owner to read their profile and prevents client profile writes', async () => {
    const own = doc(environment.authenticatedContext(uid).firestore(), 'users', uid);
    await assertSucceeds(getDoc(own));
    await assertFails(
      getDoc(doc(environment.authenticatedContext('other').firestore(), 'users', uid)),
    );
    await assertFails(updateDoc(own, { role: 'admin' }));
    await assertFails(updateDoc(own, { status: 'approved' }));
    await assertFails(updateDoc(own, { walletAddress: '0x456' }));
    await assertFails(
      setDoc(doc(environment.authenticatedContext(uid).firestore(), 'users', 'other'), {
        role: 'admin',
      }),
    );
  });

  it('denies client reads and writes for passkeys, PIN secrets, and PRN allowlist', async () => {
    const db = environment.authenticatedContext(uid).firestore();
    await assertFails(getDoc(doc(db, 'passkeys', 'credential-1')));
    await assertFails(getDoc(doc(db, 'pinSecrets', uid)));
    await assertFails(getDoc(doc(db, 'prnAllowlist', 'PRN-1')));
    await assertFails(setDoc(doc(db, 'pinSecrets', uid), { hash: 'attack' }));
  });
});

void rulesSuite;
