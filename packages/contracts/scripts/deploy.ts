import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import '@nomicfoundation/hardhat-ethers';
import { ethers, network } from 'hardhat';

interface DeploymentRecord {
  network: string;
  chainId: string;
  adminAddress: string;
  relayerAddress: string;
  contracts: {
    campusCoin: string;
    fingerPay: string;
  };
}

async function main(): Promise<void> {
  const signers = await ethers.getSigners();
  const admin = signers[0];
  const relayer = signers[1];
  if (admin === undefined || relayer === undefined) {
    throw new Error('Deployment requires an admin and a relayer signer');
  }

  const token = await ethers.deployContract('CampusCoin');
  await token.waitForDeployment();

  const app = await ethers.deployContract('FingerPay', [await token.getAddress()]);
  await app.waitForDeployment();

  await (await token.setController(await app.getAddress())).wait();
  await (await app.grantRole(await app.RELAYER_ROLE(), relayer.address)).wait();

  const { chainId } = await ethers.provider.getNetwork();
  const record: DeploymentRecord = {
    network: network.name,
    chainId: chainId.toString(),
    adminAddress: admin.address,
    relayerAddress: relayer.address,
    contracts: {
      campusCoin: await token.getAddress(),
      fingerPay: await app.getAddress(),
    },
  };
  const outputDirectory = resolve(process.cwd(), 'deployments');
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    resolve(outputDirectory, `${network.name}.json`),
    `${JSON.stringify(record, null, 2)}\n`,
  );
  console.log(`Deployed CampusCoin and FingerPay to ${network.name}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
