/**
 * Reading Pyth and the registry contract.
 *
 * All read-only, all free, all through the public relay. No route in this app reads
 * chain state any other way, which is what makes the dashboard's numbers traceable:
 * every value it shows came from one of these two functions in one request.
 */

import "server-only";

import {
  DEFAULT_MAX_DEVIATION_BPS,
  DEFAULT_MAX_PRICE_AGE_SECONDS,
  HBAR_USD_FEED_ID,
  PYTH_DEPLOYMENTS,
  PRICED_ASSET_REGISTRY_ABI,
  assessFreshness,
  decodeOraclePrice,
  formatScaled,
  type FreshnessAssessment,
  type HederaNetwork,
  type OraclePrice,
} from "@sh/shared";
import { attempt, describeError, oracleAddress, publicClient, relayUrl, type Result } from "./chains";
import { serverEnvironment } from "./env";

/** Minimal Pyth ABI: the Hedera deployment answers with 4 words, not the documented 5. */
const PYTH_ABI = [
  {
    type: "function",
    name: "getPriceUnsafe",
    stateMutability: "view",
    inputs: [{ name: "feedId", type: "bytes32" }],
    outputs: [
      { name: "price", type: "int64" },
      { name: "conf", type: "int64" },
      { name: "expo", type: "int32" },
      { name: "publishTime", type: "uint32" },
    ],
  },
  {
    type: "function",
    name: "getValidTimePeriod",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "validTimePeriod", type: "uint256" }],
  },
] as const;

/** A live price plus everything needed to judge it against the registry policy. */
export type OracleSnapshot = {
  readonly feedId: string;
  readonly feedSymbol: string;
  readonly oracleAddress: string;
  readonly price: OraclePrice;
  /** `price * 10 ** exponent` as a decimal string, 8 dp, truncated. */
  readonly priceUsd: string;
  readonly confidenceUsd: string;
  readonly validTimePeriodSeconds: number;
  readonly freshness: FreshnessAssessment;
  /** `true` when this network's Pyth deployment cannot accept on-chain updates. */
  readonly readOnly: boolean;
  readonly readOnlyReason?: string;
  readonly observedAt: number;
};

/** Feed symbols for the feeds this template ships, for display only. */
const FEED_SYMBOLS: Readonly<Record<string, string>> = {
  [HBAR_USD_FEED_ID]: "HBAR/USD",
  "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a": "USDC/USD",
  "0x2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b": "USDT/USD",
};

export function feedSymbol(feedId: string): string {
  return FEED_SYMBOLS[feedId.toLowerCase()] ?? "unknown feed";
}

/**
 * Reads the live observation for a feed and judges it against the configured policy.
 *
 * Never throws. A relay outage returns `{ ok: false }` so the page can say so; it must
 * not fall back to a cached or invented price, because a stale price displayed as
 * current is exactly the failure this template exists to make visible.
 */
export async function readOracleSnapshot(
  feedId: string = serverEnvironment().feedId ?? HBAR_USD_FEED_ID,
  network: HederaNetwork = serverEnvironment().network,
): Promise<Result<OracleSnapshot>> {
  const environment = serverEnvironment();
  const address = oracleAddress(network);

  if (address === "") {
    return {
      ok: false,
      error: `No Pyth deployment is known for ${network}. Set PYTH_ORACLE_ADDRESS to the oracle address.`,
    };
  }

  const client = publicClient(network);

  const priceResult = await attempt(async () => {
    const words = await client.readContract({
      address: address as `0x${string}`,
      abi: PYTH_ABI,
      functionName: "getPriceUnsafe",
      args: [feedId as `0x${string}`],
    });
    if (!Array.isArray(words) || words.length !== 4) {
      throw new Error(
        `expected the 4-word Pyth observation, received ${Array.isArray(words) ? words.length : typeof words}`,
      );
    }
    return decodeOraclePrice(words as unknown as bigint[]);
  });

  if (!priceResult.ok) {
    return {
      ok: false,
      error: `Could not read ${feedSymbol(feedId)} from ${address} via ${relayUrl(network)}: ${priceResult.error}`,
    };
  }

  const price = priceResult.value;

  // Pyth's own validity window is a nice-to-have, not a dependency: if the extra call
  // fails the snapshot is still usable, and the app falls back to the documented 60.
  const periodResult = await attempt(() =>
    client.readContract({
      address: address as `0x${string}`,
      abi: PYTH_ABI,
      functionName: "getValidTimePeriod",
    }),
  );

  const deployment = PYTH_DEPLOYMENTS[network];
  const nowSeconds = Math.floor(Date.now() / 1000);

  return {
    ok: true,
    value: {
      feedId,
      feedSymbol: feedSymbol(feedId),
      oracleAddress: address,
      price,
      priceUsd: formatScaled(price.priceMantissa, price.exponent, 8),
      confidenceUsd: formatScaled(price.confidenceMantissa, price.exponent, 8),
      validTimePeriodSeconds: periodResult.ok ? Number(periodResult.value) : 60,
      freshness: assessFreshness(price.publishTime, nowSeconds, environment.maxPriceAgeSeconds),
      readOnly: deployment?.readOnly ?? true,
      ...(deployment?.readOnlyReason === undefined ? {} : { readOnlyReason: deployment.readOnlyReason }),
      observedAt: Date.now(),
    },
  };
}

/** The registry's configured acceptance policy, plus the chain identity around it. */
export type RegistryPolicy = {
  readonly address: string;
  readonly maxDeviationBps: number;
  readonly maxPriceAgeSeconds: number;
  readonly owner: string;
  readonly oracle: string;
  readonly oracleValidTimePeriodSeconds: number;
  readonly recordCount: number;
};

/**
 * Reads the registry's policy.
 *
 * Returns a failure rather than throwing when no registry is deployed or configured,
 * because "you have not deployed the registry yet" is a state the dashboard has to
 * render, not an exception.
 */
export async function readRegistryPolicy(
  network: HederaNetwork = serverEnvironment().network,
): Promise<Result<RegistryPolicy>> {
  const environment = serverEnvironment();
  const address = environment.registryAddress;

  if (!address) {
    return {
      ok: false,
      error: "No registry is configured. Set NEXT_PUBLIC_REGISTRY_ADDRESS, or run `yarn hardhat:deploy` to deploy one.",
    };
  }

  const client = publicClient(network);

  const result = await attempt(async () => {
    const [policy, owner, oracle, validTimePeriod, recordCount] = await Promise.all([
      client.readContract({
        address: address as `0x${string}`,
        abi: PRICED_ASSET_REGISTRY_ABI,
        functionName: "policy",
      }),
      client.readContract({
        address: address as `0x${string}`,
        abi: PRICED_ASSET_REGISTRY_ABI,
        functionName: "owner",
      }),
      client.readContract({
        address: address as `0x${string}`,
        abi: PRICED_ASSET_REGISTRY_ABI,
        functionName: "oracle",
      }),
      client.readContract({
        address: address as `0x${string}`,
        abi: PRICED_ASSET_REGISTRY_ABI,
        functionName: "oracleValidTimePeriod",
      }),
      client.readContract({
        address: address as `0x${string}`,
        abi: PRICED_ASSET_REGISTRY_ABI,
        functionName: "recordCount",
      }),
    ]);

    return {
      address,
      maxDeviationBps: Number(policy[0]),
      maxPriceAgeSeconds: Number(policy[1]),
      owner,
      oracle,
      oracleValidTimePeriodSeconds: Number(validTimePeriod),
      recordCount: Number(recordCount),
    } satisfies RegistryPolicy;
  });

  if (!result.ok) {
    return { ok: false, error: `Could not read the registry at ${address} via ${relayUrl(network)}: ${result.error}` };
  }
  return result;
}

/** One record as the UI shows it. */
export type RecordView = {
  readonly recordId: string;
  readonly attestationHash: string;
  readonly assetToken: string;
  readonly registrant: string;
  readonly units: string;
  readonly priceUsd: string;
  readonly confidenceUsd: string;
  readonly exponent: number;
  readonly publishTime: number;
  readonly deviationBps: number;
  readonly priceAgeSeconds: string;
  readonly recordedAt: number;
  readonly hasRecord: boolean;
};

/** How many records the dashboard loads. Paged, because the array is unbounded on-chain. */
export const DEFAULT_PAGE_SIZE = 25;

/**
 * Reads the most recent records, newest first.
 *
 * Returns an empty list with `ok: true` when the registry has none, so the UI can tell
 * "no issuances yet" apart from "could not read the registry".
 */
export async function readRecentRecords(
  limit = DEFAULT_PAGE_SIZE,
  network: HederaNetwork = serverEnvironment().network,
): Promise<Result<RecordView[]>> {
  const environment = serverEnvironment();
  const address = environment.registryAddress;
  if (!address) return { ok: true, value: [] };

  const client = publicClient(network);

  const result = await attempt(async () => {
    const total = Number(
      await client.readContract({
        address: address as `0x${string}`,
        abi: PRICED_ASSET_REGISTRY_ABI,
        functionName: "recordCount",
      }),
    );

    const first = Math.max(total - limit, 0);
    const views: RecordView[] = [];

    // Read newest first, so the most relevant rows are already loaded if a later page
    // fails — a partial list beats an error page.
    for (let index = total - 1; index >= first; index -= 1) {
      const recordId = (await client.readContract({
        address: address as `0x${string}`,
        abi: PRICED_ASSET_REGISTRY_ABI,
        functionName: "recordIdAt",
        args: [BigInt(index)],
      })) as string;

      const record = await client.readContract({
        address: address as `0x${string}`,
        abi: PRICED_ASSET_REGISTRY_ABI,
        functionName: "recordOf",
        args: [recordId as `0x${string}`],
      });

      const observed = record.observed as {
        price: bigint;
        conf: bigint;
        expo: number;
        publishTime: number;
      };
      const exponent = Number(observed.expo);

      views.push({
        recordId,
        attestationHash: record.attestationHash,
        assetToken: record.assetToken,
        registrant: record.registrant,
        units: record.units.toString(),
        priceUsd: formatScaled(observed.price, exponent, 8),
        confidenceUsd: formatScaled(observed.conf, exponent, 8),
        exponent,
        publishTime: Number(observed.publishTime),
        deviationBps: Number(record.deviationBps),
        priceAgeSeconds: record.priceAgeSeconds.toString(),
        recordedAt: Number(record.recordedAt),
        hasRecord: record.attestationHash !== `0x${"00".repeat(32)}`,
      });
    }

    return views;
  });

  if (!result.ok) {
    return { ok: false, error: describeError(new Error(result.error)) };
  }
  return { ok: true, value: result.value };
}

export { DEFAULT_MAX_DEVIATION_BPS, DEFAULT_MAX_PRICE_AGE_SECONDS };
