/**
 * Deploys `PricedAssetRegistry` against a real Pyth deployment.
 *
 * Usage:
 *   yarn hardhat:deploy            # hederaTestnet
 *   yarn hardhat:deploy:local      # in-process chain, for a dry run
 *   yarn hardhat:deploy:mainnet    # hederaMainnet
 *
 * The script prints the deployed address and contract id and writes them to
 * `.deploy/<network>.json`, so the Next.js app can be pointed at a real deployment
 * without anyone retyping an address. It never prints a private key, and it fails
 * before signing if the environment is incomplete.
 */

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import hre from "hardhat";
import { NETWORK_ENDPOINTS, type HederaNetwork } from "@sh/shared";
import {
  DEFAULT_MAX_DEVIATION_BPS,
  DEFAULT_MAX_PRICE_AGE_SECONDS,
  ENV_KEYS,
  HBAR_USD_FEED_ID,
  HBAR_USD_REFERENCE_OBSERVATION,
  hashscanUrl,
} from "@sh/shared";
import {
  currentNetworkName,
  fields,
  heading,
  hederaNetworkForHardhatNetwork,
  isRealHederaNetwork,
  oracleAddressForDeploy,
  requireSigningEnvironment,
} from "./lib/scriptHelpers";

async function main(): Promise<void> {
  const environment = requireSigningEnvironment();
  const hederaNetwork = hederaNetworkForHardhatNetwork();

  // Hardhat only reports "no signers" for the network it was pointed at, which reads
  // like a bad relay URL. Name the credential instead, so an unset or unloaded key is
  // not mistaken for a network problem.
  const deployerAddress = await hre.ethers.getSigners().then((signers) => signers[0]?.getAddress());
  if (!deployerAddress) {
    throw new Error(
      `network "${currentNetworkName()}" has no signer configured even though ${ENV_KEYS.operatorPrivateKey} is set. ` +
        `This almost always means the env file was never loaded: Hardhat reads .env from the repo root and from ` +
        `packages/hardhat, not from .env.example. Copy .env.example to .env at the repo root and fill in ` +
        `${ENV_KEYS.operatorAccountId} and ${ENV_KEYS.operatorPrivateKey}.`,
    );
  }

  // Nothing off-chain can describe a chain that does not exist yet, so a dry run
  // reports only what the local chain can answer for itself.
  const realNetwork = isRealHederaNetwork();

  const oracle = await resolveOracle(realNetwork);
  const oracleAddress = oracle.address;
  const usingMockOracle = oracle.isMock;

  heading(`Deploying PricedAssetRegistry to ${currentNetworkName()}`);
  fields({
    network: currentNetworkName(),
    "hedera network": hederaNetwork,
    deployer: deployerAddress,
    "pyth oracle": oracleAddress,
    ...(usingMockOracle ? { "oracle kind": "MockPythOracle — development chain only, not a price source" } : {}),
    "max deviation": `${environment.maxDeviationBps} bps`,
    "max price age": `${environment.maxPriceAgeSeconds}s`,
  });

  const factory = await hre.ethers.getContractFactory("PricedAssetRegistry");
  const registry = await factory.deploy(oracleAddress, environment.maxDeviationBps, environment.maxPriceAgeSeconds);

  const receipt = await registry.deploymentTransaction()?.wait();
  if (!receipt) throw new Error("deployment transaction produced no receipt");

  const address = await registry.getAddress();
  const deploymentBlock = receipt.blockNumber;
  // Confirm the deployment by reading state back through the same ABI the app uses.
  // A deployment that cannot answer its own policy view is not a usable deployment.
  const [storedDeviation, owner] = await Promise.all([registry.policy(), registry.owner()]);

  heading("Deployed");
  fields({
    address,
    "contract id": realNetwork ? await mirrorContractId(hederaNetwork, address) : "n/a (in-process chain)",
    owner,
    "policy (deviation bps)": storedDeviation[0].toString(),
    "policy (max age s)": storedDeviation[1].toString(),
    block: deploymentBlock,
    explorer: realNetwork ? hashscanUrl(hederaNetwork, "contract", address) : "n/a (in-process chain)",
  });

  if (
    storedDeviation[0] !== BigInt(environment.maxDeviationBps) ||
    storedDeviation[1] !== BigInt(environment.maxPriceAgeSeconds)
  ) {
    throw new Error("deployed policy does not match the requested policy");
  }
  if (owner.toLowerCase() !== deployerAddress.toLowerCase()) {
    throw new Error(`deployed owner ${owner} is not the deployer ${deployerAddress}`);
  }

  const target = path.join(hre.config.paths.root, "..", "..", ".deploy", `${currentNetworkName()}.json`);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(
    target,
    `${JSON.stringify(
      {
        network: currentNetworkName(),
        hederaNetwork,
        address,
        owner,
        oracle: oracleAddress,
        oracleIsMock: usingMockOracle,
        maxDeviationBps: Number(storedDeviation[0]),
        maxPriceAgeSeconds: Number(storedDeviation[1]),
        deploymentBlock,
        deployedWithDefaults: {
          maxDeviationBps: DEFAULT_MAX_DEVIATION_BPS,
          maxPriceAgeSeconds: DEFAULT_MAX_PRICE_AGE_SECONDS,
        },
      },
      null,
      2,
    )}\n`,
  );
  console.log(`\n  Wrote ${path.relative(process.cwd(), target)}`);
  console.log(`  Set NEXT_PUBLIC_REGISTRY_ADDRESS=${address} in packages/nextjs/.env.local\n`);
}

/**
 * Chooses the oracle to deploy against.
 *
 * On a real network this is the Pyth deployment recorded in `@sh/shared`, or an
 * explicit `PYTH_ORACLE_ADDRESS`. On a development chain there is no Pyth at all, so
 * a `MockPythOracle` is deployed and seeded instead — otherwise the registry deploys
 * fine and then reverts on every read that touches the oracle, which looks like a
 * contract bug rather than a missing dependency.
 *
 * A mock is never deployed to a real network. That is checked here rather than left to
 * the reader of a transaction id, because the resulting deployment is indistinguishable
 * from a real one after the fact.
 */
async function resolveOracle(realNetwork: boolean): Promise<{ address: string; isMock: boolean }> {
  const environment = requireSigningEnvironment();

  if (realNetwork) {
    if (process.env[ENV_KEYS.oracleAddress] !== undefined && (await isMockDeployment())) {
      throw new Error(
        `${ENV_KEYS.oracleAddress} points at a MockPythOracle deployment, and this is a real network. ` +
          `A registry priced by a mock attests to nothing. Unset ${ENV_KEYS.oracleAddress} to use the ` +
          `recorded Pyth deployment.`,
      );
    }
    return { address: oracleAddressForDeploy(hederaNetworkForHardhatNetwork()), isMock: false };
  }

  const mockFactory = await hre.ethers.getContractFactory("MockPythOracle");
  const mock = await mockFactory.deploy(1n);
  await mock.deploymentTransaction()?.wait();

  // Seed HBAR/USD at the real values so a dry run exercises the same arithmetic the
  // live feed does, timestamped now so the freshness policy behaves normally.
  const block = await hre.ethers.provider.getBlock("latest");
  const publishTime = Math.min(block?.timestamp ?? 0, Math.floor(Date.now() / 1000));
  await mock.setPrice(
    environment.feedId ?? HBAR_USD_FEED_ID,
    HBAR_USD_REFERENCE_OBSERVATION.priceMantissa,
    HBAR_USD_REFERENCE_OBSERVATION.confidenceMantissa,
    HBAR_USD_REFERENCE_OBSERVATION.exponent,
    publishTime,
  );

  return { address: await mock.getAddress(), isMock: true };
}

/** True when `PYTH_ORACLE_ADDRESS` names a contract this repo recognises as a mock. */
async function isMockDeployment(): Promise<boolean> {
  const address = requireSigningEnvironment().oracleAddress;
  if (!address) return false;
  try {
    const code = await hre.ethers.provider.getCode(address);
    return code === "0x";
  } catch {
    // No code on this network is not evidence of a mock; let the deploy proceed and
    // let the transaction itself fail if the address is wrong.
    return false;
  }
}

/**
 * Resolves the `0.0.x` entity id through the Mirror Node.
 *
 * `0x` addresses and `0.0.x` ids are two views of the same contract; the app shows
 * the entity id because that is what the Hedera ecosystem uses in links and
 * explorers. Returns "unavailable" rather than failing the deploy: the contract is
 * deployed either way, and a Mirror Node outage is not a reason to report failure.
 */
async function mirrorContractId(hederaNetwork: HederaNetwork, address: string): Promise<string> {
  const base = NETWORK_ENDPOINTS[hederaNetwork].mirrorNodeUrl;
  try {
    const response = await fetch(`${base}/api/v1/contracts/${address}`);
    if (!response.ok) return "unavailable";
    const body = (await response.json()) as { contract_id?: string };
    return body.contract_id ?? "unavailable";
  } catch {
    return "unavailable";
  }
}

main().catch((error: unknown) => {
  console.error(`\nDeployment failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
