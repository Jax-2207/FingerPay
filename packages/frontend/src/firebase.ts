import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'fake-api-key-for-emulator',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'localhost',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'demo-fingerpay',
};

const app: FirebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]!;

export const auth: Auth = getAuth(app);

// In emulator / demo mode, connect to Auth emulator
const authEmulatorHost =
  import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST ||
  (firebaseConfig.projectId.startsWith('demo-') ? 'http://127.0.0.1:9099' : undefined);

if (authEmulatorHost && !auth.emulatorConfig) {
  try {
    connectAuthEmulator(auth, authEmulatorHost, { disableWarnings: true });
  } catch {
    // Already connected or in test environment
  }
}

export { app };
