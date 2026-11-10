import { z } from 'zod';
import { EvmAddressSchema } from '@fingerpay/shared';

const optionalText = z.preprocess(
  (value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().min(1).optional(),
);

const EnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    FIREBASE_PROJECT_ID: z.string().trim().min(1),
    FIREBASE_CLIENT_EMAIL: optionalText.pipe(z.email().optional()),
    FIREBASE_PRIVATE_KEY: optionalText,
    FIREBASE_AUTH_EMULATOR_HOST: optionalText,
    FIRESTORE_EMULATOR_HOST: optionalText,
    CORS_ORIGINS: z
      .string()
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      )
      .pipe(z.array(z.url()).min(1)),
    RPC_URL: z.url(),
    CHAIN_ID: z.coerce.number().int().positive().safe(),
    RELAYER_PRIVATE_KEY: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
    FINGERPAY_ADDRESS: EvmAddressSchema,
    CAMPUSCOIN_ADDRESS: EvmAddressSchema,
    WALLET_SALT: z.string().min(32),
    WEBAUTHN_RP_ID: z.string().trim().min(1),
    WEBAUTHN_RP_NAME: z.string().trim().min(1).max(64),
    WEBAUTHN_ORIGIN: z.url(),
  })
  .superRefine((config, context) => {
    if (Boolean(config.FIREBASE_CLIENT_EMAIL) !== Boolean(config.FIREBASE_PRIVATE_KEY)) {
      context.addIssue({
        code: 'custom',
        path: ['FIREBASE_CLIENT_EMAIL'],
        message: 'Firebase service account email and private key must be supplied together',
      });
    }
    const rpcProtocol = new URL(config.RPC_URL).protocol;
    if (rpcProtocol !== 'http:' && rpcProtocol !== 'https:') {
      context.addIssue({
        code: 'custom',
        path: ['RPC_URL'],
        message: 'RPC_URL must use HTTP or HTTPS',
      });
    }
    const webAuthnOrigin = new URL(config.WEBAUTHN_ORIGIN);
    const rpMatchesOrigin =
      webAuthnOrigin.hostname === config.WEBAUTHN_RP_ID ||
      webAuthnOrigin.hostname.endsWith(`.${config.WEBAUTHN_RP_ID}`);
    if (
      webAuthnOrigin.pathname !== '/' ||
      webAuthnOrigin.search !== '' ||
      webAuthnOrigin.hash !== '' ||
      !rpMatchesOrigin ||
      (webAuthnOrigin.protocol !== 'https:' && webAuthnOrigin.hostname !== 'localhost')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['WEBAUTHN_ORIGIN'],
        message: 'WEBAUTHN_ORIGIN must be a secure origin valid for WEBAUTHN_RP_ID',
      });
    }
  });

export type AppConfig = z.infer<typeof EnvironmentSchema>;

export class ConfigurationError extends Error {
  constructor(keys: string[]) {
    super(`Invalid environment configuration: ${[...new Set(keys)].join(', ')}`);
    this.name = 'ConfigurationError';
  }
}

export function loadConfig(environment: NodeJS.ProcessEnv): AppConfig {
  const parsed = EnvironmentSchema.safeParse(environment);
  if (parsed.success) return parsed.data;

  const invalidKeys = parsed.error.issues.map((issue) => String(issue.path[0] ?? 'environment'));
  throw new ConfigurationError(invalidKeys);
}
