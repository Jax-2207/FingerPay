import { describe, expect, it } from 'vitest';
import { AbiCoder, keccak256 } from 'ethers';
import { computeIntentId } from '../src/intent.js';

describe('computeIntentId', () => {
  it('matches the contract ABI encoding for all intent fields', () => {
    const input = {
      chainId: 31337n,
      contract: '0x0000000000000000000000000000000000000001',
      merchant: '0x0000000000000000000000000000000000000002',
      amount: 42n,
      nonce: `0x${'ab'.repeat(32)}`,
      expiry: 1_900_000_000n,
    };
    const expected = keccak256(
      AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'address', 'uint256', 'bytes32', 'uint64'],
        [input.chainId, input.contract, input.merchant, input.amount, input.nonce, input.expiry],
      ),
    );

    expect(computeIntentId(input)).toBe(expected);
  });
});
