import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import '@nomicfoundation/hardhat-ethers';
import { ethers, network } from 'hardhat';

interface DeploymentRecord {
  network: string;
  contracts: {
    campusCoin: string;
    fingerPay: string;
  };
}

async function readDeployment(): Promise<DeploymentRecord> {
  const file = resolve(process.cwd(), 'deployments', `${network.name}.json`);
  const value: unknown = JSON.parse(await readFile(file, 'utf8'));
  if (typeof value !== 'object' || value === null || !('contracts' in value)) {
    throw new Error(`Invalid deployment record at ${file}`);
  }
  const contracts = value.contracts;
  if (
    typeof contracts !== 'object' ||
    contracts === null ||
    !('campusCoin' in contracts) ||
    !('fingerPay' in contracts) ||
    typeof contracts.campusCoin !== 'string' ||
    typeof contracts.fingerPay !== 'string'
  ) {
    throw new Error(`Deployment record at ${file} is missing contract addresses`);
  }
  return {
    network: 'network' in value && typeof value.network === 'string' ? value.network : network.name,
    contracts: { campusCoin: contracts.campusCoin, fingerPay: contracts.fingerPay },
  };
}

async function main(): Promise<void> {
  const deployment = await readDeployment();
  const signers = await ethers.getSigners();
  const merchant = signers[2];
  const user = signers[3];
  if (merchant === undefined || user === undefined) {
    throw new Error('Seed requires merchant and user signers in addition to the admin and relayer');
  }

  const app = await ethers.getContractAt('FingerPay', deployment.contracts.fingerPay);
  if (!(await app.merchantRegistered(merchant.address))) {
    await (
      await app.registerMerchant(merchant.address, ethers.id('FingerPay local demo merchant'))
    ).wait();
  }
  const receiptRef = ethers.id(`FingerPay local seed ${merchant.address} ${user.address}`);
  await (await app.mint(user.address, 100n, receiptRef)).wait();
  console.log(`Seeded 100 CPC for ${user.address}; merchant ${merchant.address}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
