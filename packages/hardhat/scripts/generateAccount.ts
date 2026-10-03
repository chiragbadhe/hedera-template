/**
 * Generates a fresh secp256k1 key for the Hedera operator account.
 *
 * Usage:
 *   yarn hardhat account:generate
 *
 * Prints a key pair for the *EVM* (hex) address that the JSON-RPC relay signs with,
 * and the matching `0.0.x` account id, derived through the Mirror Node so the
 * operator does not have to create the account by hand.
 *
 * The private key is printed once and never written to disk by this script. A
 * development key is not a treasury key: it is unprotected, it is in your shell
 * history, and it is printed to your terminal. Generate a real one for testnet only.
 */

import { randomBytes } from "node:crypto";
import hre from "hardhat";
import { NETWORK_ENDPOINTS, type HederaNetwork } from "@sh/shared";
import { fields, heading, hederaNetworkForHardhatNetwork } from "./lib/scriptHelpers";

/**
 * Asks the Mirror Node to auto-create the account behind a bare EVM address.
 *
 * Returns the new `0.0.x` id, or a reason it could not. The node answers 404 for an
 * address it has never seen, so this is a convenience that may legitimately not be
 * available — the portal is the documented way to create and fund an account, and the
 * message says so rather than leaving the user with a failed command.
 */
async function autoCreateAccount(
  evmAddress: string,
  network: HederaNetwork,
): Promise<{ accountId: string } | { reason: string }> {
  const base = NETWORK_ENDPOINTS[network].mirrorNodeUrl;
  try {
    const response = await fetch(`${base}/api/v1/contracts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: evmAddress,
        // An empty contract: the point is the account creation, not the bytecode.
        abi: "pragma solidity ^0.8.0; contract Holder {}",
      }),
    });
    if (!response.ok) {
      return { reason: `the Mirror Node answered HTTP ${response.status}` };
    }
    const body = (await response.json()) as { contract_id?: string };
    return body.contract_id ? { accountId: body.contract_id } : { reason: "the Mirror Node returned no contract id" };
  } catch (error) {
    return { reason: error instanceof Error ? error.message : String(error) };
  }
}

async function main(): Promise<void> {
  const hederaNetwork = hederaNetworkForHardhatNetwork();
  const privateKey = `0x${randomBytes(32).toString("hex")}`;
  if (!/^0x[0-9a-f]{64}$/i.test(privateKey)) {
    throw new Error("generated key is not 32 bytes of hex");
  }

  // Derived locally, so this works with no network and no credentials.
  const evmAddress = new hre.ethers.Wallet(privateKey).address;

  heading("New operator key");
  fields({
    network: hederaNetwork,
    "private key": privateKey,
    "evm address": evmAddress,
  });

  if (hederaNetwork !== "testnet") {
    console.log(
      `\n  No account was created: only testnet can be funded automatically.\n` +
        `  Create an account at https://portal.hedera.com, then put its id and this key in\n` +
        `  HEDERA_OPERATOR_ACCOUNT_ID and HEDERA_OPERATOR_PRIVATE_KEY.\n`,
    );
    return;
  }

  const created = await autoCreateAccount(evmAddress, hederaNetwork);
  if ("reason" in created) {
    console.log(
      `\n  No testnet account was created for ${evmAddress}: ${created.reason}.\n` +
        `  That endpoint only works for addresses the node can already see. Create and fund\n` +
        `  an account at https://portal.hedera.com instead, then run\n` +
        `  \`yarn hardhat account:import\` to turn the portal credentials into the values this\n` +
        `  template reads.\n`,
    );
    return;
  }

  heading("Testnet account created");
  fields({
    "account id": created.accountId,
    "evm address": evmAddress,
  });
  console.log(
    `\n  Add these to .env:\n\n` +
      `    HEDERA_OPERATOR_ACCOUNT_ID=${created.accountId}\n` +
      `    HEDERA_OPERATOR_PRIVATE_KEY=${privateKey}\n\n` +
      `  The account still needs testnet HBAR to pay for transactions; request it from\n` +
      `  https://portal.hedera.com if the balance above is zero.\n`,
  );
}

main().catch((error: unknown) => {
  console.error(`\nKey generation failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
