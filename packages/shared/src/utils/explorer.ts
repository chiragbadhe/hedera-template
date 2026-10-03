/** HashScan deep links. Every transaction and entity the UI shows links here. */

import { NETWORK_ENDPOINTS, type HederaNetwork } from "../constants/networks";

export type HashscanTarget = "transaction" | "account" | "contract" | "token" | "topic" | "address";

/**
 * Builds a HashScan URL for a target.
 *
 * Returns `null` for `localnode`, which has no public explorer, so callers render
 * plain text instead of a dead link rather than shipping a broken anchor.
 */
export function hashscanUrl(network: HederaNetwork, target: HashscanTarget, id: string): string | null {
  const base = NETWORK_ENDPOINTS[network].hashscanBaseUrl;
  if (network === "localnode") return null;

  const path = target === "address" ? "account" : target;
  const trimmed = id.trim();
  if (trimmed.length === 0) return null;

  return `${base}/${path}/${encodeURIComponent(trimmed)}`;
}

/** Mirror Node transaction endpoint for a transaction id. */
export function mirrorTransactionUrl(network: HederaNetwork, txId: string): string {
  return `${NETWORK_ENDPOINTS[network].mirrorNodeUrl}/api/v1/transactions/${encodeURIComponent(txId)}`;
}

/** Mirror Node topic-messages endpoint for an HCS topic. */
export function mirrorTopicMessagesUrl(network: HederaNetwork, topicId: string): string {
  return `${NETWORK_ENDPOINTS[network].mirrorNodeUrl}/api/v1/topics/${topicId}/messages`;
}

/** Mirror Node token endpoint for an HTS token. */
export function mirrorTokenUrl(network: HederaNetwork, tokenId: string): string {
  return `${NETWORK_ENDPOINTS[network].mirrorNodeUrl}/api/v1/tokens/${tokenId}`;
}
