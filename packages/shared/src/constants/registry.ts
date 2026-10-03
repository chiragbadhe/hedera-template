/**
 * Registry constants: the canonical attestation schema, the environment
 * variable names the template reads, and the contract's rejection surface.
 */

import type { RegistryRejectionCode } from "../types/oracle";

/**
 * Version tag written into every canonical attestation envelope.
 *
 * Bump this whenever the envelope shape changes. `parseAttestation` refuses
 * envelopes carrying an unknown tag, so an old consumer can never silently
 * mis-verify a new envelope.
 */
export const ATTESTATION_SCHEMA = "par.attestation.v1";

/** All schema tags this build understands. */
export const SUPPORTED_ATTESTATION_SCHEMAS = [ATTESTATION_SCHEMA] as const;

/** Ledger discriminator; present so the envelope is self-describing off-chain. */
export const LEDGER_HEDERA = "hedera";

/**
 * Environment variable names.
 *
 * Centralised so `.env.example`, the runtime env validator and the docs cannot
 * drift apart. `generateEnvExample` in the create-scaffold-hbar CLI also writes
 * `.env.example` from `template.json`, so the descriptions here and there must
 * agree.
 */
export const ENV_KEYS = {
  /** Server-only: Hedera operator account that signs deploy/registry transactions. */
  operatorAccountId: "HEDERA_OPERATOR_ACCOUNT_ID",
  /** Server-only: operator ECDSA private key. Never expose to the browser. */
  operatorPrivateKey: "HEDERA_OPERATOR_PRIVATE_KEY",
  /** Client + server: which network to talk to. */
  network: "HEDERA_NETWORK",
  /** Optional: override the JSON-RPC relay URL. */
  jsonRpcUrl: "HEDERA_JSON_RPC_URL",
  /** Optional: override the Mirror Node REST base URL. */
  mirrorNodeUrl: "HEDERA_MIRROR_NODE_URL",
  /** Optional: HCS topic that receives attestation envelopes. */
  attestationTopicId: "HEDERA_ATTESTATION_TOPIC_ID",
  /** Optional: deployed registry contract address (0x form). */
  registryAddress: "NEXT_PUBLIC_REGISTRY_ADDRESS",
  /** Optional: deployed registry contract id (0.0.x form). */
  registryContractId: "NEXT_PUBLIC_REGISTRY_CONTRACT_ID",
  /**
   * Optional: override the Pyth oracle the registry is deployed against.
   *
   * Unset in normal use, which means the deployment recorded in
   * `PYTH_DEPLOYMENTS`. It exists for the in-process dry run, where there is no
   * Pyth deployment at all, and for a future chain Pyth deploys to an address this
   * template has not been told about.
   */
  oracleAddress: "PYTH_ORACLE_ADDRESS",
  /** Optional: override the Pyth feed used by the reference app. */
  feedId: "NEXT_PUBLIC_ORACLE_FEED_ID",
  /** Optional: contract freshness policy bound, seconds. */
  maxPriceAgeSeconds: "REGISTRY_MAX_PRICE_AGE_SECONDS",
  /** Optional: contract deviation policy, basis points. */
  maxDeviationBps: "REGISTRY_MAX_DEVIATION_BPS",
} as const;

export type EnvKey = (typeof ENV_KEYS)[keyof typeof ENV_KEYS];

/**
 * Accepted aliases for each environment variable.
 *
 * `create-scaffold-hbar` and the official templates populate `ACCOUNT_ID`,
 * `PRIVATE_KEY` and `__RUNTIME_DEPLOYER_PRIVATE_KEY`, while this template's own
 * `.env.example` uses the explicit `HEDERA_OPERATOR_*` names. Accepting both means
 * a user who has already scaffolded another template does not have to rename
 * anything, and both are documented in the README.
 */
export const ENV_ALIASES: Readonly<Record<keyof typeof ENV_KEYS, readonly string[]>> = {
  operatorAccountId: ["ACCOUNT_ID"],
  operatorPrivateKey: ["PRIVATE_KEY", "__RUNTIME_DEPLOYER_PRIVATE_KEY"],
  network: [],
  jsonRpcUrl: ["HEDERA_RPC_URL", "NEXT_PUBLIC_HEDERA_RPC_URL"],
  mirrorNodeUrl: [],
  attestationTopicId: [],
  registryAddress: [],
  registryContractId: [],
  oracleAddress: [],
  feedId: [],
  maxPriceAgeSeconds: [],
  maxDeviationBps: [],
} satisfies Readonly<Record<keyof typeof ENV_KEYS, readonly string[]>>;

/**
 * The environment variables that may reach a browser bundle.
 *
 * An **allowlist**, not a denylist. A denylist has to guess every name a secret could
 * arrive under, and this template is handed a private key by whoever clones it — the
 * failure mode of getting that wrong is a published key, not a broken build. Anything
 * not named here stays on the server, including variables nobody anticipated.
 *
 * Aliases are listed alongside their canonical key so the two stay in step; the client
 * only ever sees the canonical name.
 */
export const BROWSER_SAFE_ENV_KEYS: readonly string[] = [
  ENV_KEYS.network,
  ENV_KEYS.jsonRpcUrl,
  ENV_KEYS.mirrorNodeUrl,
  ENV_KEYS.attestationTopicId,
  ENV_KEYS.registryAddress,
  ENV_KEYS.registryContractId,
  ENV_KEYS.oracleAddress,
  ENV_KEYS.feedId,
  ENV_KEYS.maxPriceAgeSeconds,
  ENV_KEYS.maxDeviationBps,
  ...ENV_ALIASES.jsonRpcUrl,
];

/** Environment variables that must never be sent to the browser bundle. */
export const SERVER_ONLY_ENV_KEYS: readonly string[] = [
  ENV_KEYS.operatorAccountId,
  ENV_KEYS.operatorPrivateKey,
  ...ENV_ALIASES.operatorAccountId,
  ...ENV_ALIASES.operatorPrivateKey,
];

/** Refund policy is irrelevant here, but HTS/contract transactions need explicit fee caps. */
export const DEFAULT_MAX_FEE_HBAR = 2;

/** HCS: attestation envelopes are published as a single chunk. */
export const HCS_MAX_CHUNK_SIZE_BYTES = 1024;

/** Mirrors `solidity/libraries/Boundary.sol`. Kept in sync by a contract test. */
export const MAX_TOKEN_NAME_LENGTH = 100;
export const MAX_TOKEN_SYMBOL_LENGTH = 10;

/**
 * Maps each off-chain rejection code to the custom error the registry contract
 * reverts with for the same cause.
 *
 * `evaluateAttestation` runs the same checks as the contract purely so the UI can
 * explain a rejection before a transaction is signed and paid for. It is a
 * prediction, not the authority: when the contract disagrees, the revert is what
 * happened. This table is what lets the UI translate a predicted code into the
 * error name to match against the receipt, so a divergence is visible instead of
 * being silently smoothed over.
 *
 * `test/PricedAssetRegistry.test.ts` asserts this table is exhaustive against the
 * contract's own error list, so adding an error in Solidity without adding it here
 * fails the suite.
 */
export const REJECTION_SOLIDITY_ERRORS: Readonly<Record<RegistryRejectionCode, string>> = {
  "expo-mismatch": "ExpoMismatch",
  "publish-time-mismatch": "PublishTimeMismatch",
  "deviation-too-high": "DeviationTooHigh",
  "price-stale": "PriceStale",
  "non-positive-price": "NonPositivePrice",
  "zero-units": "ZeroUnits",
};
