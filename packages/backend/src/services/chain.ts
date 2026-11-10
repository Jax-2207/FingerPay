import { Contract, Interface, JsonRpcProvider, type InterfaceAbi } from 'ethers';
import CampusCoinAbi from '@fingerpay/shared/abi/CampusCoin.json' with { type: 'json' };
import FingerPayAbi from '@fingerpay/shared/abi/FingerPay.json' with { type: 'json' };
import { EvmAddressSchema } from '@fingerpay/shared';
import type { AppConfig } from '../config.js';

export interface ChainHealth {
  connected: boolean;
  chainId?: string;
}

export class ChainService {
  readonly provider: JsonRpcProvider;
  readonly token: Contract;
  readonly fingerPay: Contract;
  private readonly fingerPayInterface: Interface;

  constructor(private readonly config: AppConfig) {
    this.provider = new JsonRpcProvider(config.RPC_URL, config.CHAIN_ID, {
      staticNetwork: true,
    });
    this.token = new Contract(
      config.CAMPUSCOIN_ADDRESS,
      CampusCoinAbi as InterfaceAbi,
      this.provider,
    );
    this.fingerPay = new Contract(
      config.FINGERPAY_ADDRESS,
      FingerPayAbi as InterfaceAbi,
      this.provider,
    );
    this.fingerPayInterface = new Interface(FingerPayAbi as InterfaceAbi);
  }

  async getHealth(): Promise<ChainHealth> {
    try {
      const result: unknown = await this.provider.send('eth_chainId', []);
      if (typeof result !== 'string' || !/^0x[\da-f]+$/i.test(result)) {
        return { connected: false };
      }
      const chainId = BigInt(result);
      return { connected: chainId === BigInt(this.config.CHAIN_ID), chainId: chainId.toString() };
    } catch {
      return { connected: false };
    }
  }

  async getTokenBalance(address: string): Promise<bigint> {
    const validatedAddress = EvmAddressSchema.parse(address);
    const result: unknown = await this.token.getFunction('balanceOf').staticCall(validatedAddress);
    if (typeof result !== 'bigint') throw new TypeError('Unexpected token balance result');
    return result;
  }

  decodeCustomError(error: unknown): string | undefined {
    const data = findErrorData(error);
    if (data === undefined) return undefined;
    try {
      return this.fingerPayInterface.parseError(data)?.name;
    } catch {
      return undefined;
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function findErrorData(value: unknown, seen = new Set<object>()): string | undefined {
  if (typeof value === 'string' && /^0x[\da-f]{8,}$/i.test(value)) return value;
  if (!isRecord(value) || seen.has(value)) return undefined;
  seen.add(value);

  for (const key of ['data', 'error', 'info', 'cause', 'value']) {
    const nested = value[key];
    const found = findErrorData(nested, seen);
    if (found !== undefined) return found;
  }
  return undefined;
}
