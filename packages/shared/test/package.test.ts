import { describe, expect, it } from 'vitest';
import { APP_ROLES, CPC_DECIMALS } from '../src/index.js';

describe('shared workspace skeleton', () => {
  it('exposes shared CPC constants and role definitions', () => {
    expect(CPC_DECIMALS).toBe(0);
    expect(APP_ROLES).toEqual(['user', 'merchant', 'admin']);
  });
});
