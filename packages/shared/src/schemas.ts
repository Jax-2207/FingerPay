import { z } from 'zod';
import { APP_ROLES } from './constants.js';

export const AppRoleSchema = z.enum(APP_ROLES);
export const EvmAddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
export const Bytes32Schema = z.string().regex(/^0x[0-9a-fA-F]{64}$/);

export const CpcAmountSchema = z.string().regex(/^(0|[1-9][0-9]*)$/);
export const PositiveCpcAmountSchema = z.string().regex(/^[1-9][0-9]*$/);

export const ApiErrorResponseSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
  }),
});

export const HealthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  blockchain: z.object({
    connected: z.boolean(),
    chainId: z.string().optional(),
  }),
});

export const AuditMetadataSchema = z
  .object({
    amount: CpcAmountSchema.optional(),
    chainId: z
      .string()
      .regex(/^[1-9][0-9]*$/)
      .optional(),
    intentId: Bytes32Schema.optional(),
    reasonCode: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]{0,63}$/)
      .optional(),
    role: AppRoleSchema.optional(),
    status: z.enum(['success', 'failure', 'pending']).optional(),
    transactionHash: Bytes32Schema.optional(),
  })
  .strict();

export const AuditLogInputSchema = z.object({
  actorUid: z.string().min(1),
  action: z.string().regex(/^[a-z][a-z0-9._-]{0,99}$/),
  meta: AuditMetadataSchema.default({}),
});

export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type AuditLogInput = z.input<typeof AuditLogInputSchema>;
