import {
  Contract,
  Interface,
  NonceManager,
  Wallet,
  type InterfaceAbi,
  type JsonRpcProvider,
  type TransactionRequest,
  type TransactionResponse,
} from 'ethers';
import FingerPayAbi from '@fingerpay/shared/abi/FingerPay.json' with { type: 'json' };
import type { AppConfig } from '../config.js';

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

export interface PayResult {
  txHash: string;
  intentId: string;
  blockNumber: number;
}

export class RelayerService {
  private readonly queue = new SerialRelayerQueue();
  readonly relayerSigner: NonceManager;
  readonly adminSigner: NonceManager;
  private readonly fingerPayRelayer: Contract;
  private readonly fingerPayAdmin: Contract;
  private readonly fingerPayInterface: Interface;

  constructor(config: AppConfig, provider: JsonRpcProvider) {
    this.relayerSigner = new NonceManager(new Wallet(config.RELAYER_PRIVATE_KEY, provider));
    const adminKey = config.ADMIN_PRIVATE_KEY ?? config.RELAYER_PRIVATE_KEY;
    this.adminSigner = new NonceManager(new Wallet(adminKey, provider));

    this.fingerPayInterface = new Interface(FingerPayAbi as InterfaceAbi);
    this.fingerPayRelayer = new Contract(
      config.FINGERPAY_ADDRESS,
      FingerPayAbi as InterfaceAbi,
      this.relayerSigner,
    );
    this.fingerPayAdmin = new Contract(
      config.FINGERPAY_ADDRESS,
      FingerPayAbi as InterfaceAbi,
      this.adminSigner,
    );
  }

  submit(transaction: TransactionRequest): Promise<TransactionResponse> {
    return this.queue.enqueue(() => this.relayerSigner.sendTransaction(transaction));
  }

  registerMerchant(merchantAddress: string, metaHash: string): Promise<string> {
    return this.queue.enqueue(async () => {
      const tx = (await this.fingerPayAdmin.getFunction('registerMerchant')(
        merchantAddress,
        metaHash,
      )) as TransactionResponse;
      const receipt = await tx.wait(1);
      if (receipt === null) throw new Error('Transaction failed or dropped');
      return receipt.hash;
    });
  }

  deactivateMerchant(merchantAddress: string): Promise<string> {
    return this.queue.enqueue(async () => {
      const tx = (await this.fingerPayAdmin.getFunction('deactivateMerchant')(
        merchantAddress,
      )) as TransactionResponse;
      const receipt = await tx.wait(1);
      if (receipt === null) throw new Error('Transaction failed or dropped');
      return receipt.hash;
    });
  }

  mint(toAddress: string, amount: bigint, receiptRef: string): Promise<string> {
    return this.queue.enqueue(async () => {
      const tx = (await this.fingerPayAdmin.getFunction('mint')(
        toAddress,
        amount,
        receiptRef,
      )) as TransactionResponse;
      const receipt = await tx.wait(1);
      if (receipt === null) throw new Error('Transaction failed or dropped');
      return receipt.hash;
    });
  }

  refund(intentId: string): Promise<string> {
    return this.queue.enqueue(async () => {
      const tx = (await this.fingerPayAdmin.getFunction('refund')(intentId)) as TransactionResponse;
      const receipt = await tx.wait(1);
      if (receipt === null) throw new Error('Transaction failed or dropped');
      return receipt.hash;
    });
  }

  settle(merchantAddress: string, amount: bigint, settlementRef: string): Promise<string> {
    return this.queue.enqueue(async () => {
      const tx = (await this.fingerPayAdmin.getFunction('settle')(
        merchantAddress,
        amount,
        settlementRef,
      )) as TransactionResponse;
      const receipt = await tx.wait(1);
      if (receipt === null) throw new Error('Transaction failed or dropped');
      return receipt.hash;
    });
  }

  pause(): Promise<string> {
    return this.queue.enqueue(async () => {
      const tx = (await this.fingerPayAdmin.getFunction('pause')()) as TransactionResponse;
      const receipt = await tx.wait(1);
      if (receipt === null) throw new Error('Transaction failed or dropped');
      return receipt.hash;
    });
  }

  unpause(): Promise<string> {
    return this.queue.enqueue(async () => {
      const tx = (await this.fingerPayAdmin.getFunction('unpause')()) as TransactionResponse;
      const receipt = await tx.wait(1);
      if (receipt === null) throw new Error('Transaction failed or dropped');
      return receipt.hash;
    });
  }

  pay(
    userAddress: string,
    merchantAddress: string,
    amount: bigint,
    nonce: string,
    expiry: bigint,
  ): Promise<PayResult> {
    return this.queue.enqueue(async () => {
      const tx = (await this.fingerPayRelayer.getFunction('pay')(
        userAddress,
        merchantAddress,
        amount,
        nonce,
        expiry,
      )) as TransactionResponse;
      const receipt = await tx.wait(1);
      if (receipt === null) throw new Error('Transaction failed or dropped');

      let intentId = '';
      for (const log of receipt.logs) {
        try {
          const parsed = this.fingerPayInterface.parseLog(log);
          if (parsed !== null && parsed.name === 'Payment') {
            intentId = String(parsed.args[0]);
            break;
          }
        } catch {
          // not a FingerPay log
        }
      }

      return {
        txHash: receipt.hash,
        intentId,
        blockNumber: receipt.blockNumber,
      };
    });
  }
}
