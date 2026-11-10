import { AbiCoder, getAddress, keccak256 } from 'ethers';
import { EvmAddressSchema, Bytes32Schema } from './schemas.js';

const coder = AbiCoder.defaultAbiCoder();

export interface IntentHashInput {
  chainId: bigint;
  contract: string;
  merchant: string;
  amount: bigint;
  nonce: string;
  expiry: bigint;
}

export function computeIntentId(input: IntentHashInput): string {
  const contract = getAddress(EvmAddressSchema.parse(input.contract));
  const merchant = getAddress(EvmAddressSchema.parse(input.merchant));
  const nonce = Bytes32Schema.parse(input.nonce);

  if (
    input.chainId < 0n ||
    input.amount < 0n ||
    input.expiry < 0n ||
    input.expiry > 0xffff_ffff_ffff_ffffn
  ) {
    throw new RangeError('Intent fields are outside their unsigned integer ranges');
  }

  const encoded = coder.encode(
    ['uint256', 'address', 'address', 'uint256', 'bytes32', 'uint64'],
    [input.chainId, contract, merchant, input.amount, nonce, input.expiry],
  );
  return keccak256(encoded);
}
