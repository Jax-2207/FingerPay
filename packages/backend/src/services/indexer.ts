import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import {
  Contract,
  Interface,
  type EventLog,
  type InterfaceAbi,
  type JsonRpcProvider,
} from 'ethers';
import FingerPayAbi from '@fingerpay/shared/abi/FingerPay.json' with { type: 'json' };
import type { AppConfig } from '../config.js';
import type { Logger } from 'pino';

export interface IndexerDependencies {
  firestore: Firestore;
  provider: JsonRpcProvider;
  config: AppConfig;
  logger: Logger;
}

export class IndexerService {
  private readonly db: Firestore;
  private readonly provider: JsonRpcProvider;
  private readonly fingerPay: Contract;
  private readonly fingerPayInterface: Interface;
  private readonly logger: Logger;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor({ firestore, provider, config, logger }: IndexerDependencies) {
    this.db = firestore;
    this.provider = provider;
    this.logger = logger;
    this.fingerPayInterface = new Interface(FingerPayAbi as InterfaceAbi);
    this.fingerPay = new Contract(config.FINGERPAY_ADDRESS, FingerPayAbi as InterfaceAbi, provider);
  }

  async runOnce(): Promise<{ fromBlock: number; toBlock: number; processed: number }> {
    let currentBlock: number;
    try {
      currentBlock = await this.provider.getBlockNumber();
    } catch (error) {
      this.logger.warn({ error }, 'Indexer failed to fetch current block from RPC');
      throw error;
    }

    const stateRef = this.db.collection('indexerState').doc('main');
    const stateDoc = await stateRef.get();
    let fromBlock: number;

    if (stateDoc.exists && typeof stateDoc.get('lastProcessedBlock') === 'number') {
      fromBlock = stateDoc.get('lastProcessedBlock') + 1;
    } else {
      fromBlock = Math.max(0, currentBlock - 50);
    }

    if (fromBlock > currentBlock) {
      return { fromBlock, toBlock: currentBlock, processed: 0 };
    }

    // Process up to 500 blocks per iteration
    const toBlock = Math.min(currentBlock, fromBlock + 500);
    const processed = await this.processRange(fromBlock, toBlock);

    await stateRef.set(
      {
        lastProcessedBlock: toBlock,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return { fromBlock, toBlock, processed };
  }

  async processRange(fromBlock: number, toBlock: number): Promise<number> {
    let logs: (EventLog | import('ethers').Log)[];
    try {
      logs = await this.fingerPay.queryFilter('*', fromBlock, toBlock);
    } catch (error) {
      this.logger.warn({ fromBlock, toBlock, error }, 'Failed to query smart contract events');
      throw error;
    }

    let processedCount = 0;
    for (const log of logs) {
      let parsed;
      try {
        parsed = this.fingerPayInterface.parseLog(log);
      } catch {
        continue;
      }
      if (parsed === null) continue;

      const txHash = log.transactionHash;
      const logIndex = log.index;
      const eventId = `${txHash}:${logIndex}`;

      if (parsed.name === 'Payment') {
        const intentId = String(parsed.args[0]);
        const userAddress = String(parsed.args[1]);
        const merchantAddress = String(parsed.args[2]);
        const amount = String(parsed.args[3]);

        const txRef = this.db.collection('transactions').doc(eventId);
        const existingTx = await txRef.get();
        if (!existingTx.exists) {
          // Find intent doc if present to get category, userUid, merchantUid
          const intentDoc = await this.db.collection('paymentIntents').doc(intentId).get();
          const category = (intentDoc.exists ? intentDoc.get('category') : undefined) ?? 'general';
          const userUid = (intentDoc.exists ? intentDoc.get('userUid') : undefined) ?? null;
          const merchantUid = (intentDoc.exists ? intentDoc.get('merchantUid') : undefined) ?? null;

          await txRef.set({
            intentId,
            userUid,
            merchantUid,
            userAddress,
            merchantAddress,
            amount,
            category,
            txHash,
            blockNumber: log.blockNumber,
            logIndex,
            status: 'confirmed',
            createdAt: FieldValue.serverTimestamp(),
          });

          if (intentDoc.exists && intentDoc.get('status') !== 'confirmed') {
            await intentDoc.ref.update({
              status: 'confirmed',
              txHash,
              confirmedAt: FieldValue.serverTimestamp(),
            });
          }
          processedCount++;
        }
      } else if (parsed.name === 'Minted') {
        const toAddress = String(parsed.args[0]);
        const amount = String(parsed.args[1]);
        const receiptRef = String(parsed.args[2]);

        const mintDocRef = this.db.collection('indexedEvents').doc(eventId);
        const existing = await mintDocRef.get();
        if (!existing.exists) {
          await mintDocRef.set({
            type: 'Minted',
            toAddress,
            amount,
            receiptRef,
            txHash,
            blockNumber: log.blockNumber,
            logIndex,
            createdAt: FieldValue.serverTimestamp(),
          });
          processedCount++;
        }
      } else if (parsed.name === 'Refunded') {
        const intentId = String(parsed.args[0]);
        const userAddress = String(parsed.args[1]);
        const merchantAddress = String(parsed.args[2]);
        const amount = String(parsed.args[3]);

        const refundDocRef = this.db.collection('indexedEvents').doc(eventId);
        const existing = await refundDocRef.get();
        if (!existing.exists) {
          await refundDocRef.set({
            type: 'Refunded',
            intentId,
            userAddress,
            merchantAddress,
            amount,
            txHash,
            blockNumber: log.blockNumber,
            logIndex,
            createdAt: FieldValue.serverTimestamp(),
          });

          const intentDoc = await this.db.collection('paymentIntents').doc(intentId).get();
          if (intentDoc.exists) {
            await intentDoc.ref.update({
              status: 'refunded',
              refundTxHash: txHash,
              refundedAt: FieldValue.serverTimestamp(),
            });
          }

          const txQuery = await this.db
            .collection('transactions')
            .where('intentId', '==', intentId)
            .get();
          for (const doc of txQuery.docs) {
            await doc.ref.update({
              refunded: true,
              refundTxHash: txHash,
            });
          }
          processedCount++;
        }
      } else if (parsed.name === 'Settled') {
        const merchantAddress = String(parsed.args[0]);
        const amount = String(parsed.args[1]);
        const settlementRef = String(parsed.args[2]);

        const settleDocRef = this.db.collection('indexedEvents').doc(eventId);
        const existing = await settleDocRef.get();
        if (!existing.exists) {
          await settleDocRef.set({
            type: 'Settled',
            merchantAddress,
            amount,
            settlementRef,
            txHash,
            blockNumber: log.blockNumber,
            logIndex,
            createdAt: FieldValue.serverTimestamp(),
          });
          processedCount++;
        }
      }
    }

    return processedCount;
  }

  startPolling(intervalMs = 3000): void {
    if (this.running) return;
    this.running = true;

    const poll = async () => {
      if (!this.running) return;
      try {
        await this.runOnce();
      } catch (error) {
        this.logger.error({ error }, 'Unhandled error in indexer poll');
      }
      if (this.running) {
        this.timer = setTimeout(() => void poll(), intervalMs);
      }
    };

    void poll();
  }

  stopPolling(): void {
    this.running = false;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
