import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from '../src/package.js';

describe('frontend workspace skeleton', () => {
  it('exposes its package identity without product flows', () => {
    expect(PACKAGE_NAME).toBe('@fingerpay/frontend');
  });
});
