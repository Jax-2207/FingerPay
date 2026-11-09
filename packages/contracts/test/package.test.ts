import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from '../src/package.js';

describe('contracts workspace skeleton', () => {
  it('exposes its package identity without implementing contracts', () => {
    expect(PACKAGE_NAME).toBe('@fingerpay/contracts');
  });
});
