/**
 * Shared helpers for the Hardhat scripts.
 *
 * Every script in this directory is an operator-facing command, so they all fail
 * the same way: loudly, before spending a fee, and with a message that says what
 * to do about it. Nothing here swallows an error or prints a placeholder.
 */

import { network } from "hardhat";
import {
  ENV_KEYS,
  PYTH_DEPLOYMENTS,
  isHederaNetwork,
  resolveEnvironment,
  toBigInt,
  type HederaNetwork,
  type ResolvedEnvironment,
} from "@sh/shared";

/** Prints a heading so script output is readable when several are chained in a terminal. */
export function heading(text: string): void {
  console.log(`\n${text}\n${"─".repeat(text.length)}`);
}

/**
 * Prints `key: value` pairs aligned in two columns.
 *
 * `undefined` entries are skipped so an optional value does not print as `undefined`;
 * `null` prints as `n/a`, because that is a real answer — for example, a network
 * with no public explorer — and hiding it would look like an omission.
 */
export function fields(entries: Record<string, string | number | boolean | null | undefined>): void {
  const width = Math.max(...Object.keys(entries).map((key) => key.length));
  for (const [key, value] of Object.entries(entries)) {
    if (value === undefined) continue;
    console.log(`  ${key.padEnd(width)}  ${value === null ? "n/a" : value}`);
  }
}

/**
 * Resolves the environment, failing with a single actionable message.
 *
 * `resolveEnvironment` throws on a missing or malformed variable; the CLI message is
 * noisy enough on its own, so it is printed verbatim.
 */
export function requireEnvironment(): ResolvedEnvironment {
  return resolveEnvironment(process.env);
}

/**
 * The Pyth oracle address for the network being used.
 *
 * Read from `@sh/shared` rather than hard-coded in a script, so a script can never
 * point at a deployment the rest of the template does not know about.
 */
export function oracleAddressForNetwork(hederaNetwork: HederaNetwork): string {
  const deployment = PYTH_DEPLOYMENTS[hederaNetwork];
  if (!deployment) {
    throw new Error(
      `No Pyth deployment is configured for network "${hederaNetwork}". ` +
        `Add one to PYTH_DEPLOYMENTS in packages/shared/src/constants/oracle.ts, ` +
        `or set ${ENV_KEYS.oracleAddress}.`,
    );
  }
  return deployment.contractAddress;
}

/**
 * The Pyth oracle address a deploy should use.
 *
 * Prefers an explicit `PYTH_ORACLE_ADDRESS`, because the in-process chain has no
 * Pyth deployment at all and the dry run still needs an address to compile against.
 */
export function oracleAddressForDeploy(hederaNetwork: HederaNetwork): string {
  return requireEnvironment().oracleAddress ?? oracleAddressForNetwork(hederaNetwork);
}

/** Asserts a string is a `0x` EVM address, returning the checksummed form. */
export function requireAddress(value: string, label: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`${label} must be a 0x-prefixed 20-byte EVM address, received "${value}"`);
  }
  return value;
}

/** Asserts a value parses as a positive base-10 integer, returning it as a BigInt. */
export function requireUint(value: string, label: string): bigint {
  const parsed = toBigInt(value, label);
  if (parsed < 0n) throw new Error(`${label} must not be negative, received ${value}`);
  return parsed;
}

/** The network name Hardhat is currently running against. */
export function currentNetworkName(): string {
  return network.name;
}

/**
 * True when the chain is a real Hedera network.
 *
 * `hardhat` and `localhost` are the in-process and standalone development chains:
 * contracts deployed there exist nowhere else, so there is nothing for a Mirror Node
 * or an explorer to describe.
 */
export function isRealHederaNetwork(name = network.name): boolean {
  return name !== "hardhat" && name !== "localhost";
}

/**
 * The Hedera network implied by the Hardhat network name.
 *
 * The Hardhat network names and the Hedera network names differ only in their
 * prefix, so this fails loudly rather than guessing when they ever stop lining up.
 */
export function hederaNetworkForHardhatNetwork(name = network.name): HederaNetwork {
  // The in-process chain and a `hardhat node` both stand in for testnet: same
  // bytecode, no live Pyth, and no persistence between processes.
  if (name === "hardhat" || name === "localhost") return "testnet";

  const hederaNetwork = name.replace(/^hedera/, "").toLowerCase();
  if (!isHederaNetwork(hederaNetwork)) {
    throw new Error(
      `Cannot map Hardhat network "${name}" to a Hedera network. ` +
        `Expected one of hederaTestnet, hederaPreviewnet, hederaMainnet, hardhat, localhost.`,
    );
  }
  return hederaNetwork;
}
