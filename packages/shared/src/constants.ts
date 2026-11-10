export const CPC_SYMBOL = 'CPC';
export const CPC_DECIMALS = 0;
export const API_PREFIX = '/api';
export const HEALTH_PATH = '/health';
export const MAX_JSON_BODY_BYTES = 32 * 1024;

export const APP_ROLES = ['user', 'merchant', 'admin'] as const;
export type AppRole = (typeof APP_ROLES)[number];

export const API_ERROR_CODES = {
  unauthorized: 'UNAUTHORIZED',
  forbidden: 'FORBIDDEN',
  invalidRequest: 'INVALID_REQUEST',
  internal: 'INTERNAL_ERROR',
  chainUnavailable: 'CHAIN_UNAVAILABLE',
} as const;
