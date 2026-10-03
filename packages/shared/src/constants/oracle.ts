/**
 * Pyth Network oracle configuration for Hedera.
 *
 * ## Why the ABI below is not the one in Pyth's docs
 *
 * Pyth's published `IPyth` interface declares
 * `getPriceUnsafe(bytes32) returns (int64 price, int64 conf, int32 expo, uint publishTime, int64 emaPrice)`
 * — five return words. The deployment on Hedera testnet
 * (`0xA2aa…5729`) returns **four** words: `price`, `conf`, `expo`, `publishTime`.
 * This was confirmed by calling the live contract through the Hedera JSON-RPC
 * relay; decoding five values fails and decoding four succeeds. The
 * `OraclePrice` type in `./types/oracle.ts` therefore models the four-field
 * shape that Hedera actually answers with, and `decodeOraclePrice` asserts the
 * word count so a future Pyth upgrade fails loudly instead of silently
 * misreading the tuple.
 *
 * ## Read-only on Hedera today
 *
 * Pyth feeds on Hedera are pushed on-chain by publishing signed update data
 * from Pyth's Hermes service. As of this template's last verification the
 * Hermes endpoint that serves that data (`GET /v2/updates/price/{feedId}`)
 * returns HTTP 400 and parses the feed id as `publish_time`, so update data
 * cannot be fetched and `pyth.updatePriceFeeds` cannot be exercised.
 *
 * The template therefore treats Pyth as a **read-only** oracle integration,
 * which the Hedera ecosystem guidance explicitly allows for protocols without a
 * usable testnet write path. `oracleReadOnly: true` below is surfaced in the UI
 * and in the README so nobody mistakes this for a permissionless-write demo.
 */

import type { HederaNetwork } from "./networks";

export type OracleId = "pyth";

export const ORACLE_IDS = ["pyth"] as const;

export type PythDeployment = {
  /** EVM address of the Pyth core contract on this Hedera network. */
  readonly contractAddress: `0x${string}`;
  /** HashScan link to the contract, for manual inspection. */
  readonly hashscanUrl: string;
  /** True when signed update data cannot currently be fetched for this network. */
  readonly readOnly: boolean;
  /** Human-readable note about the read-only status, shown in the UI. */
  readonly readOnlyReason?: string;
};

/**
 * Pyth core contract deployments on Hedera.
 *
 * `0xA2aa501b19aff244D90cc15a4Cf739D2725B5729` is the current (pre-"Pyth Core
 * upgrade") address listed by Pyth for Hedera testnet; Hedera was not part of
 * the August 2026 address migration, so this address remains the correct one.
 */
export const PYTH_DEPLOYMENTS: Readonly<Partial<Record<HederaNetwork, PythDeployment>>> = {
  testnet: {
    contractAddress: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729",
    hashscanUrl: "https://hashscan.io/testnet/address/0xA2aa501b19aff244D90cc15a4Cf739D2725B5729",
    readOnly: true,
    readOnlyReason:
      "Hermes is not currently serving signed update data for Hedera, so on-chain price updates cannot be published. Prices are read from the last on-chain update.",
  },
  mainnet: {
    contractAddress: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729",
    hashscanUrl: "https://hashscan.io/mainnet/address/0xA2aa501b19aff244D90cc15a4Cf739D2725B5729",
    readOnly: true,
    readOnlyReason:
      "Hermes is not currently serving signed update data for Hedera, so on-chain price updates cannot be published. Prices are read from the last on-chain update.",
  },
};

/** Returns the Pyth deployment for a network, or `undefined` when Pyth is not deployed there. */
export function getPythDeployment(network: HederaNetwork): PythDeployment | undefined {
  return PYTH_DEPLOYMENTS[network];
}

export type PriceFeedDefinition = {
  /** Pyth price feed id (`bytes32`), lowercase `0x`-prefixed. */
  readonly feedId: `0x${string}`;
  /** Pyth asset-class symbol, e.g. `Crypto.HBAR/USD`. */
  readonly symbol: string;
  /** Display name used in the UI. */
  readonly label: string;
  /** Number of decimals to use when presenting the price to humans. */
  readonly displayDecimals: number;
};

/**
 * Curated feed registry.
 *
 * Feed ids were resolved from Pyth Hermes with `chain_id=hedera`, which returns
 * the subset of feeds actually served to Hedera. Keep this list short and
 * purposeful — every entry here is exercised by the template's tests or demo.
 */
export const PRICE_FEEDS: readonly PriceFeedDefinition[] = [
  {
    feedId: "0x3728e591097635310e6341af53db8b7ee42da9b3a8d918f9463ce9cca886dfbd",
    symbol: "Crypto.HBAR/USD",
    label: "HBAR / USD",
    displayDecimals: 6,
  },
  {
    feedId: "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a",
    symbol: "Crypto.USDC/USD",
    label: "USDC / USD",
    displayDecimals: 6,
  },
  {
    feedId: "0x2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b",
    symbol: "Crypto.USDT/USD",
    label: "USDT / USD",
    displayDecimals: 6,
  },
] as const;

/** Feed used by the reference application. */
export const DEFAULT_FEED_ID = PRICE_FEEDS[0]!.feedId;

/** Alias used by tests and scripts that need the HBAR feed explicitly. */
export const HBAR_USD_FEED_ID = DEFAULT_FEED_ID;

export function getFeedDefinition(feedId: string): PriceFeedDefinition | undefined {
  const normalised = feedId.trim().toLowerCase();
  return PRICE_FEEDS.find((feed) => feed.feedId === normalised);
}

/**
 * Default on-chain freshness bound, in seconds.
 *
 * Pyth's `getValidTimePeriod()` on Hedera returns 60 seconds, which is the
 * window Pyth itself recommends for treating a price as valid. Hedera's Pyth
 * feeds are however long past that window right now (the HBAR/USD feed was last
 * updated on 2026-08-23 when this template was verified), so a 60-second default
 * would make every issuance revert with `PriceStale` and the reference workflow
 * would be impossible to run.
 *
 * 90 days is therefore the shipped default, and it is deliberately visible in the
 * UI next to the observed price age. Tighten it with
 * `REGISTRY_MAX_PRICE_AGE_SECONDS` for anything resembling production; the
 * contract test `rejects a stamp older than the configured freshness bound`
 * proves the enforcement path works at any bound.
 */
export const DEFAULT_MAX_PRICE_AGE_SECONDS = 90 * 24 * 60 * 60;

/** Fallback used when the Pyth contract cannot be asked for its own validity window. */
export const FALLBACK_VALID_TIME_PERIOD_SECONDS = 60;

/**
 * Default tolerance between the price used off-chain and the price the contract
 * reads from Pyth, in basis points (1 bp = 0.01%). 50 bp = 0.5%.
 *
 * The two reads happen microseconds apart, so a real divergence means something
 * went wrong (wrong feed, wrong network, stale relay response). Keep it tight.
 */
export const DEFAULT_MAX_DEVIATION_BPS = 50;

/** Hard ceiling on `maxDeviationBps`, enforced in the contract. */
export const MAX_ALLOWED_DEVIATION_BPS = 1_000;

/** Hard floor/ceiling on `maxPriceAgeSeconds`, enforced in the contract. */
export const MIN_ALLOWED_MAX_PRICE_AGE_SECONDS = 0;
export const MAX_ALLOWED_MAX_PRICE_AGE_SECONDS = 10 * 365 * 24 * 60 * 60;

export const BPS_DENOMINATOR = 10_000;

/**
 * The HBAR/USD observation read from the live Hedera testnet Pyth deployment.
 *
 * Captured through the Hedera JSON-RPC relay on 2026-08-23, and kept here for two
 * reasons: it seeds `MockPythOracle` so a local dry run performs the same arithmetic
 * as the live feed, and it is the value the contract test asserts against, so the
 * expected number is one edit away from the chain rather than scattered as literals.
 *
 * These are mantissas, not dollars: `8055012` with exponent `-8` is `$0.08055012`.
 * Nothing in the template treats this as current — it is a captured observation, and
 * freshness is judged against `publishTime`, not against this constant.
 */
export const HBAR_USD_REFERENCE_OBSERVATION: Readonly<{
  priceMantissa: string;
  confidenceMantissa: string;
  exponent: number;
  publishTime: number;
}> = {
  priceMantissa: "8055012",
  confidenceMantissa: "5531",
  exponent: -8,
  publishTime: 1787525955,
};
