/**
 * Verifies that a deployed registry matches the source in this repository.
 *
 * Usage:
 *   NEXT_PUBLIC_REGISTRY_ADDRESS=0x… yarn hardhat run scripts/verifyRegistry.ts --network hederaTestnet
 *
 * The Hedera JSON-RPC relay does not implement `eth_getSourceCode`, so source
 * verification on HashScan cannot be automated from here. What *can* be checked, and
 * is checked here, is the property that actually matters: that the bytecode running at
 * the address is the bytecode this source compiles to.
 *
 * The comparison is exact rather than heuristic. solc appends a metadata hash to every
 * contract covering its source text and compiler settings, so a byte-for-byte match also
 * proves the compiler version and settings agree. It fails on a compiler upgrade or an
 * optimizer change, both of which should fail loudly.
 *
 * Immutable references are the one exception: the constructor writes them into the
 * deployed bytecode, so the artifact holds placeholders where the chain holds real
 * values. Those byte ranges are masked before comparing — read from the build info, not
 * hard-coded, so the mask cannot drift out of date and turn a real mismatch into a
 * false match.
 */

import hre from "hardhat";
import { hashscanUrl } from "@sh/shared";
import {
  currentNetworkName,
  fields,
  heading,
  hederaNetworkForHardhatNetwork,
  isRealHederaNetwork,
  requireAddress,
  requireEnvironment,
} from "./lib/scriptHelpers";

const CONTRACT_NAME = "PricedAssetRegistry";
const SOURCE_PATH = "contracts/PricedAssetRegistry.sol";

type ByteRange = { start: number; length: number };

async function main(): Promise<void> {
  const environment = requireEnvironment();
  const hederaNetwork = hederaNetworkForHardhatNetwork();
  if (!environment.registryAddress) {
    throw new Error(
      "NEXT_PUBLIC_REGISTRY_ADDRESS is not set. Deploy with `yarn hardhat:deploy`, or point it at a deployment.",
    );
  }
  const address = requireAddress(environment.registryAddress, "NEXT_PUBLIC_REGISTRY_ADDRESS");

  const artifact = await hre.artifacts.readArtifact(CONTRACT_NAME);
  if (artifact.deployedBytecode.length <= 2) {
    throw new Error(`${CONTRACT_NAME} has no compiled bytecode. Run \`yarn hardhat:compile --force\` first.`);
  }

  const onChain = (await hre.ethers.provider.getCode(address)).toLowerCase();
  if (onChain === "0x") {
    throw new Error(`No contract code at ${address} on ${currentNetworkName()}.`);
  }

  const ranges = await immutableRanges();
  const mask = (hex: string): string => {
    const characters = [...hex];
    for (const { start, length } of ranges) {
      const from = 2 + start * 2; // skip the `0x` prefix
      for (let index = from; index < from + length * 2; index += 1) characters[index] = "0";
    }
    return characters.join("");
  };

  const expected = mask(artifact.deployedBytecode.toLowerCase());
  const actual = mask(onChain);

  heading(`Verifying ${CONTRACT_NAME} at ${address}`);
  fields({
    network: currentNetworkName(),
    compiler: `solc ${hre.config.solidity.compilers[0]?.version ?? "unknown"}`,
    "expected bytecode": `${byteLength(expected)} bytes`,
    "on-chain bytecode": `${byteLength(actual)} bytes`,
    "immutable slots masked": ranges.length,
  });

  if (expected === actual) {
    console.log("\n  MATCH — the deployed bytecode is exactly what this source compiles to.");
    if (ranges.length > 0) {
      console.log(`\n  ${ranges.length} immutable slot(s) excluded from the comparison, because the`);
      console.log("  constructor supplies them and the artifact only has placeholders:");
      for (const range of ranges) console.log(`    bytes ${range.start}..${range.start + range.length - 1}`);
      console.log(`\n  oracle the deployed contract will read: ${await deployedOracle(address)}`);
    }
  } else {
    console.log("\n  MISMATCH — the deployed bytecode differs from this source.");
    console.log(`    expected ${byteLength(expected)} bytes, found ${byteLength(actual)} bytes on chain`);
    if (actual.length !== expected.length) {
      console.log("    Different lengths usually mean a different contract, or a proxy.");
    } else {
      const firstDifference = [...actual].findIndex((character, index) => character !== expected[index]);
      console.log(
        `    First difference at byte ${Math.floor(Math.max(firstDifference, 0) / 2)}, usually a compiler or optimizer change.`,
      );
    }
    console.log(`\n  Expected: ${expected.slice(0, 74)}…`);
    console.log(`  On chain: ${actual.slice(0, 74)}…`);
    console.log("\n  Recompile with the pinned compiler and compare again: yarn hardhat compile --force");
    process.exitCode = 1;
    return;
  }

  fields({
    "hashscan (source)": hashscanUrl(hederaNetwork, "contract", address),
    chain: isRealHederaNetwork() ? hederaNetwork : "development chain (no explorer)",
  });
  console.log(
    "\n  Source verification on HashScan is a manual step: open the contract and choose\n" +
      '  "Verify Contract", pasting the output of `yarn hardhat flatten` if the deploy script\n' +
      "  did not submit the flattened source at deploy time.\n",
  );
}

/** Byte ranges solc marks as immutable references in the deployed bytecode. */
async function immutableRanges(): Promise<ByteRange[]> {
  const buildInfo = await hre.artifacts.getBuildInfo(`${SOURCE_PATH}:${CONTRACT_NAME}`);
  const compiled = buildInfo?.output?.contracts?.[SOURCE_PATH]?.[CONTRACT_NAME] as
    { evm?: { deployedBytecode?: { immutableReferences?: Record<string, ByteRange[]> } } } | undefined;
  return Object.values(compiled?.evm?.deployedBytecode?.immutableReferences ?? {}).flat();
}

function byteLength(hex: string): number {
  return Math.floor((hex.length - 2) / 2);
}

/** Reads the oracle the deployed contract will actually use, for the report. */
async function deployedOracle(address: string): Promise<string> {
  try {
    const registry = await hre.ethers.getContractAt(CONTRACT_NAME, address);
    return await registry.oracle();
  } catch {
    return "unavailable";
  }
}

main().catch((error: unknown) => {
  console.error(`\nVerification failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
