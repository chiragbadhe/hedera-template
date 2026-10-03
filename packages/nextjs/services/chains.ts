/**
 * Chain access: JSON-RPC relay clients and network metadata.
 *
 * One place that knows how to reach Hedera, so no route or component builds its own
 * client with a subtly different URL, chain id or timeout. Every read in the app goes
 * through here.
 */

import "server-only";

import { createPublicClient, http, type PublicClient } from "viem";
import { NETWORK_ENDPOINTS, PYTH_DEPLOYMENTS, type HederaNetwork } from "@sh/shared";
import { serverEnvironment } from "./env";

/** The relay URL for a network, honouring an explicit override. */
export function relayUrl(network: HederaNetwork = serverEnvironment().network): string {
  const override = serverEnvironment().jsonRpcUrl;
  return override ?? NETWORK_ENDPOINTS[network].jsonRpcUrl;
}

/**
 * The Mirror Node REST base URL for a network, honouring an explicit override.
 *
 * The override is what lets the app work against a node run next to it rather than the
 * public one, which is the only way to exercise the HCS verification path locally: the
 * in-process Hardhat chain has no Mirror Node of its own.
 */
export function mirrorNodeUrl(network: HederaNetwork = serverEnvironment().network): string {
  const override = serverEnvironment().mirrorNodeUrl;
  return override ?? NETWORK_ENDPOINTS[network].mirrorNodeUrl;
}

/** The Pyth oracle address for a network, or an explicit override. */
export function oracleAddress(network: HederaNetwork = serverEnvironment().network): string {
  return serverEnvironment().oracleAddress ?? PYTH_DEPLOYMENTS[network]?.contractAddress ?? "";
}

/** True when a Pyth deployment is known for this network. */
export function hasOracleDeployment(network: HederaNetwork = serverEnvironment().network): boolean {
  return PYTH_DEPLOYMENTS[network] !== undefined;
}

/**
 * The read-only chain client.
 *
 * `viem/chains` has no Hedera entry, so the chain is described inline. The chain id
 * matters: it is what makes a signature domain-separate from an Ethereum transaction
 * with the same nonce.
 */
export function publicClient(network: HederaNetwork = serverEnvironment().network): PublicClient {
  return createPublicClient({
    transport: http(relayUrl(network), { timeout: 15_000, retryCount: 2 }),
    chain: {
      id: NETWORK_ENDPOINTS[network].chainId,
      name: `hedera-${network}`,
      nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 8 },
      rpcUrls: { default: { http: [relayUrl(network)] } },
    },
  }) as PublicClient;
}

/**
 * A JSON-RPC call that reports failures as data rather than throwing.
 *
 * The dashboard has to render when the relay is down, and "unavailable" with a reason
 * is a better answer than a stack trace in a server log and a blank page. Every
 * network-touching helper in this package returns a discriminated union for that
 * reason, and this is the primitive underneath them.
 */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export async function attempt<T>(operation: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await operation() };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

/** A one-line, actionable description of a failure. */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    // viem wraps the underlying RPC error; the cause is what a user can act on.
    const cause = (error as { cause?: unknown }).cause;
    if (cause instanceof Error && cause.message && cause.message !== error.message) {
      return `${error.message}: ${cause.message}`;
    }
    if (error.message) return error.message;
  }
  if (typeof error === "string") return error;
  return "unknown error";
}

/** Fetches JSON with a timeout, returning a readable error instead of a raw `fetch` failure. */
export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    throw new Error(`${url} responded ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}
