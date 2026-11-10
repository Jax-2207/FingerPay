import { NonceManager, Wallet, type TransactionRequest, type TransactionResponse } from 'ethers';
import type { AppConfig } from '../config.js';
import type { JsonRpcProvider } from 'ethers';

export class SerialRelayerQueue {
  private tail: Promise<void> = Promise.resolve();

  enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation, operation);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

export class RelayerService {
  private readonly queue = new SerialRelayerQueue();
  private readonly signer: NonceManager;

  constructor(config: AppConfig, provider: JsonRpcProvider) {
    this.signer = new NonceManager(new Wallet(config.RELAYER_PRIVATE_KEY, provider));
  }

  submit(transaction: TransactionRequest): Promise<TransactionResponse> {
    return this.queue.enqueue(() => this.signer.sendTransaction(transaction));
  }
}
