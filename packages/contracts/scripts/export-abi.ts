import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

interface ArtifactWithAbi {
  abi: unknown[];
}

async function readAbi(contractName: string): Promise<unknown[]> {
  const artifactPath = resolve(
    process.cwd(),
    'artifacts',
    'contracts',
    `${contractName}.sol`,
    `${contractName}.json`,
  );
  const artifact: unknown = JSON.parse(await readFile(artifactPath, 'utf8'));
  if (typeof artifact !== 'object' || artifact === null || !('abi' in artifact)) {
    throw new Error(`Artifact at ${artifactPath} does not contain an ABI`);
  }
  const withAbi = artifact as ArtifactWithAbi;
  if (!Array.isArray(withAbi.abi))
    throw new Error(`Artifact at ${artifactPath} has an invalid ABI`);
  return withAbi.abi;
}

async function main(): Promise<void> {
  const outputDirectory = resolve(process.cwd(), '..', 'shared', 'src', 'abi');
  await mkdir(outputDirectory, { recursive: true });
  for (const contractName of ['CampusCoin', 'FingerPay']) {
    const abi = await readAbi(contractName);
    await writeFile(
      resolve(outputDirectory, `${contractName}.json`),
      `${JSON.stringify(abi, null, 2)}\n`,
    );
  }
  console.log(`Exported CampusCoin and FingerPay ABIs to ${outputDirectory}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
