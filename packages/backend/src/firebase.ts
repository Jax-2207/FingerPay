import { applicationDefault, cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import type { AppConfig } from './config.js';

export interface FirebaseServices {
  app: App;
  auth: Auth;
  firestore: Firestore;
}

export function initializeFirebase(config: AppConfig): FirebaseServices {
  // Ensure emulator variables are cleared so the SDK never diverts to local emulators
  delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
  delete process.env.FIRESTORE_EMULATOR_HOST;

  const existingApp = getApps().find((app) => app.name === '[DEFAULT]');
  const accountCredential =
    config.FIREBASE_CLIENT_EMAIL !== undefined && config.FIREBASE_PRIVATE_KEY !== undefined
      ? cert({
          projectId: config.FIREBASE_PROJECT_ID,
          clientEmail: config.FIREBASE_CLIENT_EMAIL,
          privateKey: config.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        })
      : undefined;

  const app =
    existingApp ??
    initializeApp({
      projectId: config.FIREBASE_PROJECT_ID,
      ...(accountCredential !== undefined
        ? { credential: accountCredential }
        : { credential: applicationDefault() }),
    });

  const firestore = getFirestore(app);
  try {
    firestore.settings({ ignoreUndefinedProperties: true });
  } catch {
    // settings already initialized
  }

  return { app, auth: getAuth(app), firestore };
}
