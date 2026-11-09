import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from '../src/package.js';

describe('shared workspace skeleton', () => {
  it('exposes its package identity without adding product schemas', () => {
    expect(PACKAGE_NAME).toBe('@fingerpay/shared');
  });
});
