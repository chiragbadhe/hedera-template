/**
 * Converts Hedera portal credentials into the values this template reads, and
 * verifies them against the Mirror Node before printing anything.
 *
 * Usage:
 *   HEDERA_ACCOUNT_ID=0.0.1234 HEDERA_PRIVATE_KEY=<DER or hex> yarn hardhat account:import
 *
 * The portal exports a DER-encoded transaction key. The JSON-RPC relay signs with a
 * raw secp256k1 key, so the DER envelope has to be unwrapped to get the key that will
 * actually be used. Unwrapping it locally is better than asking the user to do it by
 * hand, and it is checkable: the derived EVM address is compared against the address
 * the Mirror Node has on file for that account, so a mismatch is caught here rather
 * than as a confusing signature error later.
 */

import hre from "hardhat";
import { PrivateKey } from "@hiero-ledger/sdk";
import { assertEntityIdFormat, NETWORK_ENDPOINTS, type HederaNetwork } from "@sh/shared";
import { fields, heading, hederaNetworkForHardhatNetwork } from "./lib/scriptHelpers";

/**
 * Returns the raw secp256k1 key, `0x`-prefixed, for either input format.
 *
 * The SDK does the DER unwrapping rather than a regex: it validates the encoding and
 * the key length, so a truncated or malformed key is rejected here instead of turning
 * into a signature that never verifies.
 */
function rawKeyFrom(value: string): string {
  const trimmed = value.trim();

  if (PrivateKey.isDerKey(trimmed)) {
    const raw = PrivateKey.fromStringDer(trimmed).toStringRaw();
    return raw.startsWith("0x") ? raw : `0x${raw}`;
  }

  if (/^0x[0-9a-fA-F]{64}$/.test(trimmed)) return trimmed;

  throw new Error(
    "HEDERA_PRIVATE_KEY must be either a DER-encoded transaction key (as exported from the " +
      "Hedera portal) or a 0x-prefixed 32-byte hex key (as printed by `yarn hardhat account:generate`).",
  );
}

/** The account id from the environment, accepting the names this template already reads. */
function accountIdFromEnvironment(): string {
  const value = process.env.HEDERA_ACCOUNT_ID ?? process.env.ACCOUNT_ID ?? process.env.HEDERA_OPERATOR_ACCOUNT_ID;
  if (!value) {
    throw new Error(
      "Set HEDERA_ACCOUNT_ID=0.0.x alongside HEDERA_PRIVATE_KEY, or use `yarn hardhat account:generate`.",
    );
  }
  return assertEntityIdFormat(value, "HEDERA_ACCOUNT_ID");
}

/** The `0x` address the Mirror Node has on file for an account, if it knows one. */
async function mirrorEvmAddress(accountId: string, network: HederaNetwork): Promise<string | undefined> {
  const base = NETWORK_ENDPOINTS[network].mirrorNodeUrl;
  try {
    const response = await fetch(`${base}/api/v1/accounts/${accountId}`);
    if (!response.ok) return undefined;
    const body = (await response.json()) as { evm_address?: string };
    return body.evm_address ?? undefined;
  } catch {
    return undefined;
  }
}

async function main(): Promise<void> {
  const hederaNetwork = hederaNetworkForHardhatNetwork();
  const accountId = accountIdFromEnvironment();

  const rawKey = process.env.HEDERA_PRIVATE_KEY ?? process.env.PRIVATE_KEY;
  if (!rawKey) {
    throw new Error("Set HEDERA_PRIVATE_KEY to the portal's exported key, or use `yarn hardhat account:generate`.");
  }
  const ecdsaKey = rawKeyFrom(rawKey);
  const derivedAddress = new hre.ethers.Wallet(ecdsaKey).address;

  heading("Operator credentials");
  fields({
    network: hederaNetwork,
    "account id": accountId,
    "key format": PrivateKey.isDerKey(rawKey.trim()) ? "DER transaction key, unwrapped" : "raw hex",
    "derived evm address": derivedAddress,
  });

  const onChainAddress = await mirrorEvmAddress(accountId, hederaNetwork);
  if (onChainAddress === undefined) {
    console.log(
      `\n  The Mirror Node has no record of ${accountId} on ${hederaNetwork}, so the address could not be\n` +
        `  cross-checked. If the account id is wrong, the first transaction will fail.\n`,
    );
  } else if (onChainAddress.toLowerCase() !== derivedAddress.toLowerCase()) {
    throw new Error(
      `This key does not control ${accountId}.\n` +
        `  account ${accountId} is ${onChainAddress} on ${hederaNetwork}, but this key derives ${derivedAddress}.\n` +
        `  Check that the key and the account id come from the same portal account.`,
    );
  } else {
    console.log(`\n  Verified: the Mirror Node reports the same EVM address for ${accountId}.`);
  }

  console.log(
    `\n  Add these to .env:\n\n` +
      `    HEDERA_OPERATOR_ACCOUNT_ID=${accountId}\n` +
      `    HEDERA_OPERATOR_PRIVATE_KEY=${ecdsaKey}\n\n` +
      `  Then check the balance before deploying; an unfunded account cannot pay fees.\n`,
  );
}

main().catch((error: unknown) => {
  console.error(`\nImport failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
