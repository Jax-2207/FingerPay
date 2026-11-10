import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { signInWithCustomToken, type Auth, type UserCredential } from 'firebase/auth';

export interface PasskeyOptions<T> {
  challengeId: string;
  options: T;
}

export async function registerPasskey(
  options: PasskeyOptions<Parameters<typeof startRegistration>[0]['optionsJSON']>,
) {
  return {
    challengeId: options.challengeId,
    response: await startRegistration({ optionsJSON: options.options }),
  };
}

export async function authenticateWithPasskey(
  options: PasskeyOptions<Parameters<typeof startAuthentication>[0]['optionsJSON']>,
) {
  return {
    challengeId: options.challengeId,
    response: await startAuthentication({ optionsJSON: options.options }),
  };
}

export function startFirebaseSession(auth: Auth, customToken: string): Promise<UserCredential> {
  return signInWithCustomToken(auth, customToken);
}
