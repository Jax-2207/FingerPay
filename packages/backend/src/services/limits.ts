import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { AppConfig } from '../config.js';
import { HttpError } from '../errors.js';

export interface LimitsServiceDependencies {
  firestore: Firestore;
  config: AppConfig;
}

export class LimitsService {
  constructor(
    private readonly firestore: Firestore,
    private readonly config: AppConfig,
  ) {}

  async enforcePaymentLimits(userUid: string, amount: bigint): Promise<void> {
    const maxPayment = BigInt(this.config.MAX_PAYMENT_CPC);
    if (amount > maxPayment) {
      throw new HttpError(
        400,
        'PAYMENT_LIMIT_EXCEEDED',
        `Payment amount of ${amount} CPC exceeds single payment limit of ${maxPayment} CPC`,
      );
    }

    const dailyLimit = BigInt(this.config.DAILY_LIMIT_CPC);
    const dayAgo = Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000);

    const snapshot = await this.firestore
      .collection('transactions')
      .where('userUid', '==', userUid)
      .where('status', '==', 'confirmed')
      .where('createdAt', '>=', dayAgo)
      .get();

    let spent24h = 0n;
    for (const doc of snapshot.docs) {
      const txAmount = doc.get('amount');
      if (typeof txAmount === 'string' || typeof txAmount === 'number') {
        spent24h += BigInt(txAmount);
      }
    }

    if (spent24h + amount > dailyLimit) {
      throw new HttpError(
        400,
        'DAILY_LIMIT_EXCEEDED',
        `Payment would exceed 24-hour spending limit of ${dailyLimit} CPC (already spent: ${spent24h} CPC)`,
      );
    }
  }
}
