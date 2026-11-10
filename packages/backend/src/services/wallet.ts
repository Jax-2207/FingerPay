import { getAddress, solidityPackedKeccak256 } from 'ethers';

export function deriveWalletAddress(uid: string, walletSalt: string): string {
  if (uid.length === 0) throw new TypeError('User ID is required');
  if (walletSalt.length < 32)
    throw new TypeError('Wallet salt must contain at least 32 characters');

  const digest = solidityPackedKeccak256(
    ['string', 'string', 'string'],
    ['fingerpay:wallet:', uid, walletSalt],
  );
  return getAddress(`0x${digest.slice(-40)}`);
}
