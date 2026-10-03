/**
 * Publishing a canonical attestation envelope to HCS.
 *
 * ## Why this uses the HAPI SDK and not the JSON-RPC relay
 *
 * HCS is reached over gRPC only. The relay this template reads Pyth and the
 * registry through speaks EVM JSON-RPC, and there is no `eth_` method that submits
 * a consensus message — so a native-node client is the only way to publish at all.
 * That client needs operator credentials, which is why this module is server-only
 * and goes through `operatorEnvironment()`.
 *
 * ## The transaction id is decided before the digest is
 *
 * The envelope carries `issuance.txId`, and the digest is taken over the envelope,
 * so the transaction id has to be known first. It is: {@link reserveTransactionId}
 * mints a transaction id the operator will actually pay for, that id is stamped
 * into the envelope, and {@link publishAttestation} submits under exactly it. The id
 * the network records is therefore the id inside the digest, with no circularity and
 * no second publish to "fix up" the payload afterwards.
 *
 * ## Chunking is refused, not performed
 *
 * The message is the canonical envelope, in one piece, or it is not published.
 * Chunking would split the pre-image across several messages, and the verifier
 * hashes one message at a time, so a chunked payload would be unfindable forever.
 * `prepareAttestation` enforces the size limit before this module is reached.
 */

import "server-only";

import { Client, Hbar, PrivateKey, Status, TopicId, TopicMessageSubmitTransaction, TransactionId } from "@hiero-ledger/sdk";
import { ENV_KEYS, hashscanUrl, type HederaNetwork } from "@sh/shared";
import { describeError, type Result } from "./chains";
import { operatorEnvironment, serverEnvironment } from "./env";
import type { PreparedAttestation } from "./envelope";

/** Memo written onto the HCS submit so the transaction is identifiable on HashScan. */
const TRANSACTION_MEMO = "priced-asset-registry: attestation";

/** Default max fee for HCS message submit (2 HBAR). */
const DEFAULT_MAX_FEE_HBAR = new Hbar(2);

/**
 * Safely parses a private key string into a Hedera SDK PrivateKey instance.
 *
 * Checks if the key is a 64-char (or 0x-prefixed 64-char) hex string (raw secp256k1)
 * and parses it explicitly via `PrivateKey.fromStringECDSA`, preventing the SDK from
 * defaulting to Ed25519 (which causes INVALID_SIGNATURE precheck failures).
 */
export function parseHederaPrivateKey(keyStr: string): PrivateKey {
  const trimmed = keyStr.trim();
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(trimmed)) {
    return PrivateKey.fromStringECDSA(trimmed);
  }
  if (/^30(2e|44|81|82)/i.test(trimmed)) {
    return PrivateKey.fromStringDer(trimmed);
  }
  return PrivateKey.fromString(trimmed);
}

/** What a real HCS publish produced. Every id here came from the network. */
export type HcsPublication = {
  readonly topicId: string;
  /** The reserved id; the receipt confirms the network used it. */
  readonly transactionId: string;
  /** `null` when the receipt did not carry one, which the network should not do. */
  readonly sequenceNumber: string | null;
  /**
   * ISO-8601 consensus timestamp, resolved from the Mirror Node.
   *
   * `null` when the Mirror Node has not indexed the transaction yet. That is a
   * reporting gap, not a failure: the message is on the topic and the digest stands.
   */
  readonly consensusTimestamp: string | null;
  /** Topic running hash after this message, hex. Evidence of ordering, not of content. */
  readonly runningHash: string | null;
  /** Byte length of the published message. */
  readonly payloadBytes: number;
  readonly hashscanUrl: string | null;
  /** Set when something was published but could not be reported. */
  readonly warning: string | null;
};

/**
 * Reserves the HCS transaction id that will be stamped into the envelope.
 *
 * Fails rather than falling back to a placeholder: without a real reserved id the
 * digest would commit to a transaction that never happens, which is exactly the
 * kind of unverifiable claim this template is built to make impossible.
 */
export function reserveTransactionId(): Result<string> {
  let environment: ReturnType<typeof operatorEnvironment>;
  try {
    environment = operatorEnvironment();
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }

  if (environment.operatorAccountId === undefined) {
    return { ok: false, error: `No operator account id. Set ${ENV_KEYS.operatorAccountId}.` };
  }

  try {
    return { ok: true, value: TransactionId.generate(environment.operatorAccountId).toString() };
  } catch (error) {
    return {
      ok: false,
      error: `Could not reserve a Hedera transaction id for ${environment.operatorAccountId}: ${describeError(error)}`,
    };
  }
}

/**
 * Publishes `prepared.canonicalBytes` to the configured attestation topic.
 *
 * The bytes handed to HCS are the exact pre-image of `prepared.digest`; nothing here
 * re-serialises the envelope. Never throws.
 */
export async function publishAttestation(
  prepared: PreparedAttestation,
  options: { readonly transactionId: string },
): Promise<Result<HcsPublication>> {
  let environment: ReturnType<typeof operatorEnvironment>;
  try {
    environment = operatorEnvironment();
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }

  const topicId = serverEnvironment().attestationTopicId;
  if (topicId === undefined) {
    return {
      ok: false,
      error: `No HCS topic is configured. Set ${ENV_KEYS.attestationTopicId} to the topic that should receive envelopes.`,
    };
  }

  const client = buildClient(environment.network);
  if (!client.ok) return { ok: false, error: client.error };

  const hashscan = hashscanUrl(environment.network, "transaction", options.transactionId);

  try {
    const transaction = await new TopicMessageSubmitTransaction()
      .setTopicId(TopicId.fromString(topicId))
      .setMessage(prepared.canonicalBytes)
      .setTransactionId(TransactionId.fromString(options.transactionId))
      .setTransactionMemo(TRANSACTION_MEMO)
      .setMaxTransactionFee(DEFAULT_MAX_FEE_HBAR)
      .execute(client.value);

    const receipt = await transaction.getReceipt(client.value);

    if (receipt.status !== Status.Success) {
      return {
        ok: false,
        error: `HCS rejected the attestation message with ${receipt.status.toString()}.`,
      };
    }

    const sequenceNumber = receipt.topicSequenceNumber?.toString() ?? null;
    const runningHash = receipt.topicRunningHash ? toHex(receipt.topicRunningHash) : null;

    // The receipt carries no consensus timestamp in this SDK version, so the Mirror
    // Node is the authority — the same source the verifier will read.
    const consensus = await resolveConsensusTimestamp(options.transactionId);

    return {
      ok: true,
      value: {
        topicId,
        transactionId: options.transactionId,
        sequenceNumber,
        consensusTimestamp: consensus.timestamp,
        runningHash,
        payloadBytes: prepared.canonicalBytes.byteLength,
        hashscanUrl: hashscan,
        warning: consensus.warning,
      },
    };
  } catch (error) {
    const errorMsg = describeError(error);
    let diag = `Could not publish the attestation to ${topicId}: ${errorMsg}`;

    if (/INVALID_SIGNATURE/i.test(errorMsg)) {
      diag += ` (INVALID_SIGNATURE: ensure operator private key matches the registered public key for ${environment.operatorAccountId}).`;
    } else if (/TOPIC_NOT_FOUND|INVALID_TOPIC_ID/i.test(errorMsg)) {
      diag += ` (Topic ${topicId} not found on ${environment.network}. Check HEDERA_ATTESTATION_TOPIC_ID).`;
    } else if (/INSUFFICIENT_PAYER_BALANCE|INSUFFICIENT_TX_FEE/i.test(errorMsg)) {
      diag += ` (Insufficient HBAR balance on account ${environment.operatorAccountId}).`;
    } else if (/UNAUTHORIZED/i.test(errorMsg)) {
      diag += ` (Topic ${topicId} requires submit key authorization).`;
    }

    return { ok: false, error: diag };
  } finally {
    client.value.close();
  }
}

/**
 * Looks up the consensus timestamp of a Hedera transaction.
 *
 * A `null` timestamp is reported as a warning rather than an error: the message is
 * already on the topic, and refusing to report that would throw away a publish that
 * did succeed.
 */
async function resolveConsensusTimestamp(transactionId: string): Promise<{
  readonly timestamp: string | null;
  readonly warning: string | null;
}> {
  const { readTransaction } = await import("./mirror");
  const result = await readTransaction(transactionId, serverEnvironment().network);

  if (!result.ok) {
    return { timestamp: null, warning: `Published, but the consensus timestamp is unknown: ${result.error}` };
  }
  if (result.value === null) {
    return {
      timestamp: null,
      warning: "Published, but the Mirror Node has not indexed this transaction yet; the consensus timestamp is pending.",
    };
  }
  if (result.value.status !== "SUCCESS") {
    return {
      timestamp: result.value.consensusTimestamp,
      warning: `Published, but the Mirror Node reports the transaction as ${result.value.status}.`,
    };
  }
  return { timestamp: result.value.consensusTimestamp, warning: null };
}

/**
 * A node client for the network, with the operator as payer.
 *
 * Built per publish rather than cached: `Client.forX()` reads a bundled network map
 * and opens no connection until a request is made, so caching would buy nothing and
 * a cached client would outlive the module's credentials. Closing in `finally` keeps
 * the gRPC channel from leaking between requests.
 */
function buildClient(network: HederaNetwork): Result<Client> {
  let environment: ReturnType<typeof operatorEnvironment>;
  try {
    environment = operatorEnvironment();
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }

  if (environment.operatorAccountId === undefined || environment.operatorPrivateKey === undefined) {
    return {
      ok: false,
      error: `Operator credentials are required to publish. Set ${ENV_KEYS.operatorAccountId} and ${ENV_KEYS.operatorPrivateKey}.`,
    };
  }

  try {
    const client = createForNetwork(network);
    const operatorKey = parseHederaPrivateKey(environment.operatorPrivateKey);
    client.setOperator(environment.operatorAccountId, operatorKey);
    return { ok: true, value: client };
  } catch (error) {
    return { ok: false, error: `Could not open a Hedera node client for ${network}: ${describeError(error)}` };
  }
}

/** The SDK has no string-keyed factory, so the network is mapped explicitly. */
function createForNetwork(network: HederaNetwork): Client {
  switch (network) {
    case "mainnet":
      return Client.forMainnet();
    case "previewnet":
      return Client.forPreviewnet();
    case "localnode":
      return Client.forLocalNode();
    case "testnet":
      return Client.forTestnet();
  }
}

/** Lowercase `0x` hex, without depending on a buffer helper for a fixed width. */
function toHex(bytes: Uint8Array): string {
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}