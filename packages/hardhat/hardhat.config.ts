import * as dotenv from "dotenv";
import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";
import "@typechain/hardhat";

dotenv.config();

/**
 * Hedera JSON-RPC relay per network. Free, public, no key required.
 *
 * These are the same relays the Hedera docs use, and they are the reason this
 * template needs no `HEDERA_FORKING` plugin: unit tests run against a scripted
 * mock oracle, and every live read in the scripts goes straight to the public
 * testnet instead of a fork.
 */
const RELAYS: Record<string, string> = {
  hederaTestnet: "https://testnet.hashio.io/api",
  hederaPreviewnet: "https://previewnet.hashio.io/api",
  hederaMainnet: "https://mainnet.hashio.io/api",
};

/**
 * Resolves the deployer key.
 *
 * Hardhat 2 only accepts a literal `string[]` here, so this cannot be deferred to
 * the moment a broadcast actually starts. Returning an empty list when no key is
 * configured is therefore the compatible choice: unit tests load the config
 * without credentials, and the deployment scripts call
 * `resolveEnvironment(..., { requireOperator: true })` first, which throws the
 * actionable "copy .env.example" message before any transaction is built.
 */
function deployerAccounts(): string[] {
  const key = process.env.__RUNTIME_DEPLOYER_PRIVATE_KEY ?? process.env.HEDERA_OPERATOR_PRIVATE_KEY ?? process.env.PRIVATE_KEY;
  if (!key) return [];
  return [key];
}

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        // Pinned, not ranged: the deployed bytecode must be reproducible from the
        // lockfile alone. 0.8.28 is what Hedera supports and what the official
        // Scaffold-HBAR templates use.
        version: "0.8.28",
        settings: {
          optimizer: { enabled: true, runs: 200 },
        },
      },
    ],
  },
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      // Deterministic and local: tests deploy the mock oracle and the registry and
      // never touch the network.
      chainId: 31337,
    },
    hederaTestnet: {
      url: process.env.HEDERA_JSON_RPC_URL ?? RELAYS.hederaTestnet!,
      accounts: deployerAccounts(),
      chainId: 296,
    },
    hederaPreviewnet: {
      url: RELAYS.hederaPreviewnet!,
      accounts: deployerAccounts(),
      chainId: 297,
    },
    hederaMainnet: {
      url: process.env.HEDERA_JSON_RPC_URL ?? RELAYS.hederaMainnet!,
      accounts: deployerAccounts(),
      chainId: 295,
    },
  },
  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6",
  },
  mocha: {
    timeout: 120_000,
  },
};

export default config;
