/**
 * Reads a deployed registry: policy, authorised registrants and recorded issuances.
 *
 * Usage:
 *   NEXT_PUBLIC_REGISTRY_ADDRESS=0x… yarn hardhat read:registry --network hederaTestnet
 *   NEXT_PUBLIC_REGISTRY_ADDRESS=0x… yarn hardhat read:registry --network hederaTestnet --record 0x…
 *
 * Read-only: no credentials, no fees. Every number printed here was read from the
 * chain in this run — nothing is cached or reconstructed from an earlier run.
 */

import hre from "hardhat";
import { formatScaled, formatUnixSeconds, hashscanUrl } from "@sh/shared";
import type { PricedAssetRegistry } from "../typechain-types";
import {
  currentNetworkName,
  fields,
  heading,
  hederaNetworkForHardhatNetwork,
  isRealHederaNetwork,
  requireAddress,
  requireEnvironment,
} from "./lib/scriptHelpers";

/** How many of the most recent records to print when no specific one is named. */
const PAGE_SIZE = 10n;

/** `--record <hash>`, validated as the 32-byte digest the registry keys on. */
function recordArgument(): string | undefined {
  const flag = process.argv.indexOf("--record");
  if (flag === -1) return undefined;

  const value = process.argv[flag + 1];
  if (value === undefined || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error("--record requires a 32-byte hex attestation hash, e.g. 0x" + "ab".repeat(32));
  }
  return value;
}

async function main(): Promise<void> {
  const environment = requireEnvironment();
  const hederaNetwork = hederaNetworkForHardhatNetwork();
  if (!environment.registryAddress) {
    throw new Error(
      "NEXT_PUBLIC_REGISTRY_ADDRESS is not set. Deploy with `yarn hardhat:deploy`, " +
        "or point it at an existing deployment.",
    );
  }
  const address = requireAddress(environment.registryAddress, "NEXT_PUBLIC_REGISTRY_ADDRESS");

  // Calling a contract that was never deployed here fails deep inside the ABI decoder
  // with "could not decode result data". Saying so up front is the difference between
  // a five-second fix and an afternoon.
  const code = await hre.ethers.provider.getCode(address);
  if (code === "0x") {
    throw new Error(
      `No contract code at ${address} on ${currentNetworkName()}. ` +
        `Every \`hardhat run --network hardhat\` starts a fresh in-process chain, so a deployment from one run is ` +
        `not visible in the next. Use \`--network hederaTestnet\` against a real deployment, or start \`yarn hardhat node\` ` +
        `and target \`--network localhost\`.`,
    );
  }

  const registry: PricedAssetRegistry = await hre.ethers.getContractAt("PricedAssetRegistry", address);

  heading(`Registry ${address} on ${currentNetworkName()}`);
  const [deviationBps, maxPriceAgeSeconds] = await registry.policy();
  fields({
    network: currentNetworkName(),
    owner: await registry.owner(),
    "max deviation": `${deviationBps} bps`,
    "max price age": `${maxPriceAgeSeconds}s`,
    "pyth validity window": `${await registry.oracleValidTimePeriod()}s`,
    oracle: await registry.oracle(),
    records: (await registry.recordCount()).toString(),
    // A development chain has no explorer, and `hederaNetwork` is only "testnet"
    // because that is what the in-process chain stands in for.
    explorer: isRealHederaNetwork() ? hashscanUrl(hederaNetwork, "contract", address) : "n/a (development chain)",
  });

  const requested = recordArgument();
  if (requested !== undefined) {
    heading("Record");
    await printRecord(registry, requested);
    return;
  }

  const total = await registry.recordCount();
  if (total === 0n) {
    console.log("\n  No issuances recorded yet. Issue and attest one from the app to populate this.");
    return;
  }

  heading(`Most recent ${total > PAGE_SIZE ? PAGE_SIZE : total} of ${total}`);
  const first = total > PAGE_SIZE ? total - PAGE_SIZE : 0n;
  for (let index = first; index < total; index += 1n) {
    await printRecord(registry, await registry.recordIdAt(index), index);
  }
}

async function printRecord(registry: PricedAssetRegistry, recordId: string, index?: bigint): Promise<void> {
  const record = await registry.recordOf(recordId);
  const { observed } = record;
  // `int32`/`uint32` come back as bigint from the ABI; the display helpers take numbers.
  const exponent = Number(observed.expo);
  fields({
    ...(index === undefined ? {} : { "#": index.toString() }),
    "attestation hash": recordId,
    feed: record.feedId,
    "asset token": record.assetToken,
    registrant: record.registrant,
    units: record.units.toString(),
    "observed price": `$${formatScaled(observed.price, exponent, 8)}`,
    "observed conf": `$${formatScaled(observed.conf, exponent, 8)}`,
    exponent,
    published: formatUnixSeconds(Number(observed.publishTime)),
    "price age at record": `${record.priceAgeSeconds.toString()}s`,
    deviation: `${record.deviationBps.toString()} bps`,
    "recorded at": formatUnixSeconds(Number(record.recordedAt)),
  });
  console.log("");
}

main().catch((error: unknown) => {
  console.error(`\nRegistry read failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
