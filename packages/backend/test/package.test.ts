import { describe, expect, it } from 'vitest';
import { deriveWalletAddress, SerialRelayerQueue } from '../src/package.js';

describe('backend workspace skeleton', () => {
  it('exports the backend foundation services', () => {
    expect(typeof deriveWalletAddress).toBe('function');
    expect(typeof SerialRelayerQueue).toBe('function');
  });
});
