import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from '../src/package.js';

describe('backend workspace skeleton', () => {
  it('exposes its package identity without adding API behavior', () => {
    expect(PACKAGE_NAME).toBe('@fingerpay/backend');
  });
});
