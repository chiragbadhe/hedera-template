/**
 * Mirror Node reads.
 *
 * The Mirror Node is the only public record of what actually reached consensus. The
 * contract holds a 32-byte digest and nothing else, so every claim the app makes about
 * an attestation — its payload, its timestamp, who paid for it — comes from here.
 *
 * ## What this module does not do
 *
 * It does not recompute HCS's `running_hash`. That value is the topic's consensus
 * chain: a versioned algorithm seeded inside the network, which changed between
 * versions 0 and 3. A reimplementation that disagreed with consensus would be worse
 * than no check, so the running hash is surfaced as the authoritative Mirror Node
 * value and linked to HashScan, and tamper-evidence comes from the keccak256 digest
 * check in `services/attestation.ts`, which anyone can reproduce from the payload
 * bytes alone.
 */

import "server-only";

import {
  HCS_MAX_CHUNK_SIZE_BYTES,
  hashscanUrl,
  mirrorTokenUrl,
  mirrorTopicMessagesUrl,
  type HederaNetwork,
  type VerifiedAttestation,
} from "@sh/shared";
import { attempt, fetchJson, mirrorNodeUrl, type Result } from "./chains";
import { serverEnvironment } from "./env";

/** One HCS message exactly as the Mirror Node reports it. */
export type MirrorTopicMessage = {
  readonly consensus_timestamp: string;
  readonly message: string;
  readonly payer_account_id: string;
  readonly running_hash: string;
  readonly running_hash_version: number;
  readonly sequence_number: number;
  readonly topic_id: string;
  readonly transaction_id?: string;
  readonly chunk_info?: {
    readonly number: number;
    readonly total: number;
    readonly initial_transaction_id?: string;
  } | null;
};

type TopicMessagesResponse = {
  readonly messages: MirrorTopicMessage[];
  readonly links?: { readonly next?: string | null };
};

/**
 * Pages through a topic, newest first.
 *
 * `order=desc` because the interesting messages are the recent ones; the offset page
 * link is followed rather than recomputed so the Mirror Node stays the authority on
 * how pagination works.
 */
export async function readTopicMessages(
  topicId: string,
  limit = 25,
  network: HederaNetwork = serverEnvironment().network,
): Promise<Result<VerifiedAttestation[]>> {
  const capped = Math.min(Math.max(limit, 1), 100);

  const first = await attempt(() =>
    fetchJson<TopicMessagesResponse>(`${mirrorTopicMessagesUrl(network, topicId)}?limit=${capped}&order=desc`),
  );

  if (!first.ok) {
    // Mirror Node answers 404 for a topic that does not exist, and 404 for one that
    // exists but has no messages. Those are different user-facing situations.
    if (/responded 404/.test(first.error)) {
      return { ok: true, value: [] };
    }
    return { ok: false, error: `Could not read topic ${topicId} from ${mirrorNodeUrl(network)}: ${first.error}` };
  }

  const messages = first.value.messages;
  const next = first.value.links?.next;
  if (!next || messages.length === 0) {
    return { ok: true, value: messages.map((message) => toVerifiedAttestation(message, network)) };
  }

  const second = await attempt(() => fetchJson<TopicMessagesResponse>(absolute(next, network)));
  if (!second.ok) {
    // One page of history is better than an error: the newest messages are already in
    // hand, so return them and say nothing false about them.
    return { ok: true, value: messages.map((message) => toVerifiedAttestation(message, network)) };
  }

  const combined = [...messages, ...second.value.messages].slice(0, capped);
  return { ok: true, value: combined.map((message) => toVerifiedAttestation(message, network)) };
}

/** Resolves a Mirror Node pagination link, which is a path on the same base URL. */
function absolute(path: string, network: HederaNetwork): string {
  return path.startsWith("http") ? path : `${mirrorNodeUrl(network)}${path}`;
}

/**
 * Decodes one message into the shared shape.
 *
 * Base64 in, JSON out: the digest is recomputed from the decoded bytes in
 * `services/attestation.ts`, so a decode failure there is caught rather than silently
 * producing a digest of nothing. A payload that is not JSON is preserved as its raw
 * text, because a topic can legitimately carry messages this app did not write.
 */
function toVerifiedAttestation(message: MirrorTopicMessage, network: HederaNetwork): VerifiedAttestation {
  const text = Buffer.from(message.message, "base64").toString("utf8");
  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    payload = text;
  }

  return {
    topicId: message.topic_id,
    sequenceNumber: message.sequence_number,
    consensusTimestamp: message.consensus_timestamp,
    runningHash: message.running_hash,
    runningHashVersion: message.running_hash_version,
    transactionId: message.transaction_id ?? null,
    hashscanUrl: hashscanUrl(network, "topic", message.topic_id) ?? mirrorTopicMessagesUrl(network, message.topic_id),
    payload,
  };
}

/** The subset of an HTS token that the UI shows. `null` when the token is unknown. */
export type MirrorToken = {
  readonly tokenId: string;
  readonly name: string;
  readonly symbol: string;
  readonly decimals: number;
  readonly totalSupply: string;
  readonly treasuryAccountId: string;
  readonly evmAddress: string | null;
};

/**
 * Looks up an HTS token.
 *
 * A 404 is a legitimate answer here — the user is probably looking up a token id they
 * just made — so it comes back as `null` rather than an error.
 */
export async function readToken(
  tokenId: string,
  network: HederaNetwork = serverEnvironment().network,
): Promise<Result<MirrorToken | null>> {
  const result = await attempt(() =>
    fetchJson<{
      token_id: string;
      name?: string;
      symbol?: string;
      decimals?: number;
      total_supply?: string | number;
      treasury_account_id?: string;
      evm_address?: string | null;
    }>(mirrorTokenUrl(network, tokenId)),
  );

  if (!result.ok) {
    if (/responded 404/.test(result.error)) return { ok: true, value: null };
    return { ok: false, error: `Could not read token ${tokenId} from ${mirrorNodeUrl(network)}: ${result.error}` };
  }

  const token = result.value;
  return {
    ok: true,
    value: {
      tokenId: token.token_id,
      name: token.name ?? "",
      symbol: token.symbol ?? "",
      decimals: token.decimals ?? 0,
      totalSupply: String(token.total_supply ?? "0"),
      treasuryAccountId: token.treasury_account_id ?? "",
      evmAddress: token.evm_address ?? null,
    },
  };
}

/** A transaction as the UI needs it, with the fields that identify what ran. */
export type MirrorTransaction = {
  readonly transactionId: string;
  readonly type: string;
  readonly status: string;
  readonly consensusTimestamp: string;
  readonly payerAccountId: string;
  readonly entityId: string | null;
  readonly nonce: number;
  readonly hashscanUrl: string | null;
};

/**
 * Reads a transaction by id.
 *
 * Used by the verify screen when the user pastes a transaction id instead of a topic.
 */
export async function readTransaction(
  transactionId: string,
  network: HederaNetwork = serverEnvironment().network,
): Promise<Result<MirrorTransaction | null>> {
  const result = await attempt(() =>
    fetchJson<{
      transactions?: Array<{
        transaction_id: string;
        name?: string;
        type?: string;
        result?: string;
        consensus_timestamp: string;
        payer_account_id?: string;
        entity_id?: string | null;
        nonce?: number;
      }>;
    }>(`${mirrorNodeUrl(network)}/api/v1/transactions/${encodeURIComponent(transactionId)}`),
  );

  if (!result.ok) {
    if (/responded 404/.test(result.error)) return { ok: true, value: null };
    return { ok: false, error: `Could not read ${transactionId} from ${mirrorNodeUrl(network)}: ${result.error}` };
  }

  const [transaction] = result.value.transactions ?? [];
  if (!transaction) return { ok: true, value: null };

  return {
    ok: true,
    value: {
      transactionId: transaction.transaction_id,
      type: transaction.type ?? transaction.name ?? "unknown",
      status: transaction.result ?? "unknown",
      consensusTimestamp: transaction.consensus_timestamp,
      payerAccountId: transaction.payer_account_id ?? "",
      entityId: transaction.entity_id ?? null,
      nonce: Number(transaction.nonce ?? 0),
      hashscanUrl: hashscanUrl(network, "transaction", transaction.transaction_id),
    },
  };
}

/**
 * The payload size the app will publish.
 *
 * HCS accepts a `ConsensusMessageSubmitTransaction` message longer than 1 KiB, but
 * anything past `HCS_MAX_CHUNK_SIZE_BYTES` has to be chunked, and chunking changes
 * what the digest commits to. The publish path refuses oversized payloads instead of
 * silently chunking them.
 */
export { HCS_MAX_CHUNK_SIZE_BYTES };
