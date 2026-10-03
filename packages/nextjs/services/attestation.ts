/**
 * Independent verification of an attestation.
 *
 * This module is the reusable primitive the whole template is built around, and the one
 * piece of logic a reader should be able to audit without reading any UI. Given an
 * attestation digest it answers: does the payload on HCS hash to the value the contract
 * stores?
 *
 * ## What is actually proved
 *
 * The registry stores only `attestationHash`. This module fetches HCS messages, decodes
 * the payload, recomputes keccak256 over its canonical encoding, and compares. If they
 * are equal then:
 *
 * - the off-chain payload has not been altered since it was published, and
 * - the on-chain record refers to exactly that payload.
 *
 * What that does **not** prove is that the publisher was honest: anyone can publish a
 * self-consistent lie. Integrity is verifiable here; authorship needs the HCS payer
 * account and, for a stronger claim, a signature over the digest — which is why
 * `payer_account_id` is reported as evidence rather than treated as proof.
 *
 * Every check is reported individually, with the observed value, so a failed
 * verification says what disagreed instead of only that it did.
 */

import "server-only";

import {
  ENV_KEYS,
  HBAR_USD_FEED_ID,
  NETWORK_ENDPOINTS,
  PRICED_ASSET_REGISTRY_ABI,
  attestationDigest,
  digestsMatch,
  explainSelector,
  hashscanUrl,
  evaluateAttestation,
  isHex32,
  toBigInt,
  type AssetAttestation,
  type OraclePrice,
  type HederaNetwork,
  type RegistryRejectionCode,
  type VerificationCheck,
  type VerificationReport,
} from "@sh/shared";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { attempt, describeError, publicClient, relayUrl, type Result } from "./chains";
import { operatorEnvironment, serverEnvironment } from "./env";
import type { PreparedAttestation } from "./envelope";
import { readOracleSnapshot } from "./oracle";
import { readTopicMessages, readToken, type MirrorToken } from "./mirror";

/** One on-chain record, as the verifier needs it. */
type OnChainRecord = {
  readonly attestationHash: string;
  readonly feedId: string;
  readonly assetToken: string;
  readonly registrant: string;
  readonly units: bigint;
  readonly observed: { readonly price: bigint; readonly conf: bigint; readonly expo: number; readonly publishTime: number };
  readonly deviationBps: number;
  readonly priceAgeSeconds: number;
  readonly recordedAt: number;
};

const ZERO_HASH = `0x${"00".repeat(32)}`;

/** The `Observation` struct argument, as viem expects it. */
type ObservationArg = {
  readonly price: bigint;
  readonly conf: bigint;
  readonly expo: number;
  readonly publishTime: number;
};

/**
 * Reads a record by digest.
 *
 * A digest with no record comes back as `null` rather than an error, because "that
 * record does not exist" is an answer the verify screen has to be able to show.
 */
export async function readRecord(
  digest: string,
  network: HederaNetwork = serverEnvironment().network,
): Promise<Result<OnChainRecord | null>> {
  const environment = serverEnvironment();
  if (!environment.registryAddress) {
    return { ok: false, error: "No registry is configured. Set NEXT_PUBLIC_REGISTRY_ADDRESS." };
  }
  if (!isHex32(digest)) {
    return { ok: false, error: `"${digest}" is not a 32-byte 0x-prefixed digest.` };
  }

  const client = publicClient(network);
  const result = await attempt(async () => {
    const record = await client.readContract({
      address: environment.registryAddress as `0x${string}`,
      abi: PRICED_ASSET_REGISTRY_ABI,
      functionName: "recordOf",
      args: [digest as `0x${string}`],
    });
    return {
      attestationHash: record.attestationHash as string,
      feedId: record.feedId as string,
      assetToken: record.assetToken as string,
      registrant: record.registrant as string,
      units: record.units,
      observed: {
        price: record.observed.price,
        conf: record.observed.conf,
        expo: Number(record.observed.expo),
        publishTime: Number(record.observed.publishTime),
      },
      deviationBps: Number(record.deviationBps),
      priceAgeSeconds: Number(record.priceAgeSeconds),
      recordedAt: Number(record.recordedAt),
    } satisfies OnChainRecord;
  });

  if (!result.ok) {
    return { ok: false, error: `Could not read ${digest} from the registry: ${result.error}` };
  }
  // An unregistered digest reads back as a zeroed struct rather than reverting.
  if (result.value.attestationHash === ZERO_HASH || result.value.units === 0n) return { ok: true, value: null };
  return { ok: true, value: result.value };
}

/** What the verifier concluded, plus the evidence it used. */
export type VerificationOutcome = VerificationReport & {
  /** The envelope recovered from HCS, when one was found and parsed. */
  readonly attestation?: AssetAttestation;
  /** The HCS message the envelope came from. */
  readonly source?: {
    readonly topicId: string;
    readonly sequenceNumber: number;
    readonly consensusTimestamp: string;
    readonly payerAccountId: string | null;
    readonly runningHash: string;
    readonly url: string | null;
  };
};

/**
 * Verifies one attestation digest end to end.
 *
 * Never throws: every failure mode becomes a report with `status: "unavailable"` and a
 * reason, because a verifier that crashes tells you less than one that explains itself.
 */
export async function verifyAttestation(
  digest: string,
  options: { readonly topicId?: string; readonly limit?: number; readonly network?: HederaNetwork } = {},
): Promise<VerificationOutcome> {
  const network = options.network ?? serverEnvironment().network;
  const environment = serverEnvironment();
  const startedAt = Date.now();
  const checks: VerificationCheck[] = [];
  const add = (check: VerificationCheck) => checks.push(check);

  if (!isHex32(digest)) {
    return {
      status: "unavailable",
      subject: digest,
      checkedAt: startedAt,
      error: `Expected a 32-byte 0x-prefixed digest, received "${digest}".`,
      checks,
    };
  }

  const recordResult = await readRecord(digest, network);
  if (!recordResult.ok) {
    return { status: "unavailable", subject: digest, checkedAt: startedAt, error: recordResult.error, checks };
  }
  const record = recordResult.value;
  if (!record) {
    add({
      label: "Recorded on chain",
      status: "fail",
      detail: `No record exists for ${digest}.`,
      ...(hashscanUrl(network, "contract", environment.registryAddress ?? "") === null
        ? {}
        : { url: hashscanUrl(network, "contract", environment.registryAddress ?? "") ?? undefined }),
    });
    return { status: "not-found", subject: digest, checkedAt: startedAt, checks };
  }

  add({
    label: "Recorded on chain",
    status: "pass",
    detail: `Record exists; ${record.units} base units registered by ${record.registrant}.`,
    ...(hashscanUrl(network, "address", record.registrant)
      ? { url: hashscanUrl(network, "address", record.registrant) ?? undefined }
      : {}),
  });

  // The topic is required to find the payload. Without it there is nothing to recompute
  // from, and reporting "verified" from the on-chain value alone would be circular.
  const topicId = options.topicId ?? environment.attestationTopicId;
  if (!topicId) {
    add({
      label: "Attestation topic",
      status: "fail",
      detail:
        "No HCS topic is configured, so the payload cannot be fetched. Set HEDERA_ATTESTATION_TOPIC_ID or pass a topic.",
    });
    return { status: "unavailable", subject: digest, checkedAt: startedAt, checks };
  }

  const messagesResult = await readTopicMessages(topicId, options.limit ?? 100, network);
  if (!messagesResult.ok) {
    add({ label: "Attestation topic", status: "fail", detail: messagesResult.error });
    return { status: "unavailable", subject: digest, checkedAt: startedAt, checks };
  }

  const messages = messagesResult.value;
  const matched = messages.find((message) => {
    if (typeof message.payload !== "object" || message.payload === null) return false;
    try {
      return digestsMatch(attestationDigest(message.payload as AssetAttestation), digest);
    } catch {
      // A payload that cannot even be canonicalised is simply not a match.
      return false;
    }
  });

  if (!matched) {
    add({
      label: "Payload found on HCS",
      status: "fail",
      detail: `None of the ${messages.length} most recent messages on ${topicId} hash to ${digest}.`,
      ...(hashscanUrl(network, "topic", topicId) ? { url: hashscanUrl(network, "topic", topicId) ?? undefined } : {}),
    });
    return { status: "not-found", subject: digest, checkedAt: startedAt, checks };
  }

  const attestation = matched.payload as AssetAttestation;
  const recomputed = attestationDigest(attestation);

  add({
    label: "Digest recomputed from the HCS payload",
    status: digestsMatch(recomputed, digest) ? "pass" : "fail",
    detail: `keccak256 of the canonical envelope is ${recomputed}; the contract stores ${digest}.`,
    ...(matched.hashscanUrl ? { url: matched.hashscanUrl } : {}),
  });

  add({
    label: "HCS consensus metadata",
    status: "pass",
    detail: `Sequence ${matched.sequenceNumber} at ${matched.consensusTimestamp}, running hash v${matched.runningHashVersion} ${matched.runningHash.slice(0, 16)}…`,
    ...(matched.hashscanUrl ? { url: matched.hashscanUrl } : {}),
  });

  // Now compare the payload's claims against what the contract actually recorded. This is
  // what makes a payload that is *internally* consistent but disagrees with the chain
  // detectable.
  add(
    compareString(
      "Feed id agrees",
      attestation.pricing.feedId,
      record.feedId,
      `payload ${attestation.pricing.feedId}, record ${record.feedId}`,
    ),
  );

  add(
    compareString(
      "Oracle observation agrees",
      attestation.pricing.priceMantissa,
      record.observed.price.toString(),
      `payload price ${attestation.pricing.priceMantissa}, record ${record.observed.price}`,
    ),
  );

  add(
    compareString(
      "Confidence agrees",
      attestation.pricing.confidenceMantissa,
      record.observed.conf.toString(),
      `payload conf ${attestation.pricing.confidenceMantissa}, record ${record.observed.conf}`,
    ),
  );

  add(
    compareNumber(
      "Exponent agrees",
      attestation.pricing.exponent,
      record.observed.expo,
      `payload expo ${attestation.pricing.exponent}, record ${record.observed.expo}`,
    ),
  );

  add(
    compareNumber(
      "Publish time agrees",
      attestation.pricing.publishTime,
      record.observed.publishTime,
      `payload publishTime ${attestation.pricing.publishTime}, record ${record.observed.publishTime}`,
    ),
  );

  add(
    compareString(
      "Units agree",
      attestation.issuance.units,
      record.units.toString(),
      `payload units ${attestation.issuance.units}, record ${record.units}`,
    ),
  );

  add(
    compareNumber(
      "Deviation agrees",
      attestation.registry.observedDeviationBps,
      record.deviationBps,
      `payload ${attestation.registry.observedDeviationBps} bps, record ${record.deviationBps} bps`,
    ),
  );

  add({
    label: "Published before it was recorded",
    status: Number(attestation.issuance.txId.split("@")[1]?.split(".")[0] ?? 0) <= record.recordedAt ? "pass" : "fail",
    detail: `consensus ${matched.consensusTimestamp}, recorded at block time ${record.recordedAt}.`,
  });

  // The token itself: does the registry's token address correspond to a real HTS token?
  const tokenResult = await readToken(attestation.asset.tokenId, network);
  if (!tokenResult.ok) {
    add({ label: "Asset exists on HTS", status: "fail", detail: tokenResult.error });
  } else if (tokenResult.value === null) {
    add({
      label: "Asset exists on HTS",
      status: "fail",
      detail: `Mirror Node has no token ${attestation.asset.tokenId}.`,
    });
  } else {
    const token = tokenResult.value;
    const mismatches = [
      tokenMismatch("token id", attestation.asset.tokenId, token.tokenId),
      tokenMismatch("name", attestation.asset.name, token.name),
      tokenMismatch("symbol", attestation.asset.symbol, token.symbol),
      tokenMismatch("decimals", String(attestation.asset.decimals), String(token.decimals)),
    ].filter((entry): entry is string => entry !== null);
    add(tokenCheck(attestation.asset.tokenId, token, network, mismatches));
  }

  const failed = checks.filter((check) => check.status === "fail");

  return {
    status: failed.length === 0 ? "verified" : "mismatch",
    subject: digest,
    checkedAt: Date.now(),
    checks,
    attestation,
    source: {
      topicId: matched.topicId,
      sequenceNumber: matched.sequenceNumber,
      consensusTimestamp: matched.consensusTimestamp,
      payerAccountId: matched.transactionId?.split("@")[0] ?? null,
      runningHash: matched.runningHash,
      url: matched.hashscanUrl,
    },
  };
}

/**
 * Compares the token the payload names with what the Mirror Node reports.
 *
 * The registry only stores an EVM address, which is a lossy rendering of `0.0.x`. This
 * is the check that closes the gap: the payload must name a token that exists, and its
 * name, symbol and decimals must be the ones on the ledger.
 */
function tokenCheck(
  tokenId: string,
  token: MirrorToken,
  network: HederaNetwork,
  mismatches: readonly string[],
): VerificationCheck {
  const url = hashscanUrl(network, "token", tokenId);

  return {
    label: "Asset exists on HTS",
    status: mismatches.length === 0 ? "pass" : "fail",
    detail:
      mismatches.length === 0
        ? `${token.tokenId} is ${token.name || "(unnamed)"} ${token.symbol || ""} with ${token.decimals} decimals.`
        : mismatches.join("; "),
    ...(url === null ? {} : { url }),
  };
}

/** Adds a mismatch description when two token facts disagree. */
function tokenMismatch(label: string, expected: string, actual: string): string | null {
  return expected === actual ? null : `${label}: payload ${expected}, ledger ${actual}`;
}

function compareNumber(label: string, expected: number, actual: number, detail: string): VerificationCheck {
  return { label, status: expected === actual ? "pass" : "fail", detail };
}

function compareString(label: string, expected: string, actual: string, detail: string): VerificationCheck {
  return { label, status: expected === actual ? "pass" : "fail", detail };
}

/**
 * Explains the policy verdict for an attestation, without sending a transaction.
 *
 * Two independent answers are produced on purpose:
 *
 * - `contract` is `checkAttestation`, the registry's own verdict, read over the relay.
 *   It is the authority: whatever it says is what the transaction will do.
 * - `preview` is `evaluateAttestation` from `@sh/shared`, a pure function that mirrors
 *   the policy in TypeScript.
 *
 * Showing both, and whether they agree, is the honest presentation. A single "will
 * succeed" badge could only ever come from one of them, and the reader would have no way
 * to tell which. When they disagree the disagreement is the finding, and
 * `packages/hardhat/test/PricedAssetRegistry.test.ts` is what is supposed to make it
 * impossible.
 */
export type PolicyVerdict = {
  readonly contractAccepted: boolean;
  readonly contractRejection: RegistryRejectionCode | null;
  readonly contractSelector: string | null;
  readonly contractAvailable: boolean;
  readonly previewAccepted: boolean;
  readonly previewRejection: RegistryRejectionCode | null;
  readonly previewMessage: string | null;
  /**
   * Deviation and price age `evaluateAttestation` measured.
   *
   * These are the two figures the canonical envelope records under
   * `registry.observedDeviationBps` / `observedPriceAgeSeconds`, and they are
   * `null` only when the live price could not be read at all — in which case there
   * is no envelope to build either.
   */
  readonly previewDeviationBps: number | null;
  readonly previewPriceAgeSeconds: number | null;
  /** `null` when the contract could not be asked, so there is nothing to compare. */
  readonly verdictsAgree: boolean | null;
  readonly reason: string | null;
};

/** Asks the contract what it would do, returning the raw verdict. */
async function askContract(observation: ObservationArg, units: string): Promise<Result<ContractVerdict>> {
  const environment = serverEnvironment();
  if (!environment.registryAddress) {
    return { ok: false, error: "No registry is configured. Set NEXT_PUBLIC_REGISTRY_ADDRESS." };
  }
  const feedId = environment.feedId ?? HBAR_USD_FEED_ID;
  if (!isHex32(feedId)) {
    return { ok: false, error: `No Pyth feed id is configured. Set ${ENV_KEYS.feedId}, or pass one with the attestation.` };
  }

  let unitsValue: bigint;
  try {
    unitsValue = toBigInt(units, "units");
  } catch (error) {
    return { ok: false, error: `The unit count cannot be used: ${describeError(error)}` };
  }

  const client = publicClient(environment.network);
  const result = await attempt(() =>
    client.readContract({
      address: environment.registryAddress as `0x${string}`,
      abi: PRICED_ASSET_REGISTRY_ABI,
      functionName: "checkAttestation",
      // The unit count is part of the question, not decoration: the registry rejects
      // zero units, and a preview that omitted it would answer "acceptable" for a
      // registration that then reverts.
      args: [feedId as `0x${string}`, unitsValue, observation],
    }),
  );

  if (!result.ok) {
    return { ok: false, error: `The registry could not be asked for a verdict: ${result.error}` };
  }

  const [acceptable, reason] = result.value as readonly [boolean, `0x${string}`];
  const selector = reason === "0x00000000" ? null : reason;
  return {
    ok: true,
    value: {
      accepted: Boolean(acceptable),
      rejection: selector === null ? null : explainSelector(selector),
      selector,
    },
  };
}

/** Runs the local policy against the live observation the contract will read. */
async function previewLocally(attested: OraclePrice, units: string): Promise<ContractVerdict> {
  const environment = serverEnvironment();
  const live = await readOracleSnapshot(environment.feedId ?? HBAR_USD_FEED_ID, environment.network);
  if (!live.ok) throw new Error(live.error);

  const evaluation = evaluateAttestation({
    attested,
    live: live.value.price,
    nowSeconds: Math.floor(Date.now() / 1000),
    maxDeviationBps: environment.maxDeviationBps,
    maxPriceAgeSeconds: environment.maxPriceAgeSeconds,
    units,
  });

  return {
    accepted: evaluation.accepted,
    rejection: evaluation.rejection?.code ?? null,
    selector: null,
    message: evaluation.rejection?.message ?? null,
    deviationBps: evaluation.deviation.deviationBps,
    priceAgeSeconds: evaluation.freshness.ageSeconds,
  };
}

type ContractVerdict = {
  readonly accepted: boolean;
  readonly rejection: RegistryRejectionCode | null;
  readonly selector: string | null;
  readonly message?: string | null;
  /** Set by `previewLocally` only; a contract verdict never measures the margin itself. */
  readonly deviationBps?: number;
  readonly priceAgeSeconds?: number;
};

/**
 * Runs both verdicts for a candidate attestation.
 *
 * `attested` is the observation the payload was built from and `units` the base-unit
 * count that would be registered. Never throws.
 */
export async function checkAttestationPolicy(
  attested: OraclePrice,
  units: string,
): Promise<PolicyVerdict> {

  let preview: ContractVerdict;
  try {
    preview = await previewLocally(attested, units);
  } catch (error) {
    return {
      contractAccepted: false,
      contractRejection: null,
      contractSelector: null,
      contractAvailable: false,
      previewAccepted: false,
      previewRejection: null,
      previewMessage: null,
      previewDeviationBps: null,
      previewPriceAgeSeconds: null,
      verdictsAgree: null,
      reason: `The live price could not be read, so no verdict is available: ${describeError(error)}`,
    };
  }

  const contract = await askContract(
    {
      price: toBigInt(attested.priceMantissa, "priceMantissa"),
      conf: toBigInt(attested.confidenceMantissa, "confidenceMantissa"),
      expo: attested.exponent,
      publishTime: attested.publishTime,
    },
    units,
  );

  if (!contract.ok) {
    return {
      contractAccepted: false,
      contractRejection: null,
      contractSelector: null,
      contractAvailable: false,
      previewAccepted: preview.accepted,
      previewRejection: preview.rejection,
      previewMessage: preview.message ?? null,
      previewDeviationBps: preview.deviationBps ?? null,
      previewPriceAgeSeconds: preview.priceAgeSeconds ?? null,
      verdictsAgree: null,
      reason: contract.error,
    };
  }

  return {
    contractAccepted: contract.value.accepted,
    contractRejection: contract.value.rejection,
    contractSelector: contract.value.selector,
    contractAvailable: true,
    previewAccepted: preview.accepted,
    previewRejection: preview.rejection,
    previewMessage: preview.message ?? null,
    previewDeviationBps: preview.deviationBps ?? null,
    previewPriceAgeSeconds: preview.priceAgeSeconds ?? null,
    // Agreement is only meaningful when both sides reached a verdict about the same
    // condition, so an unrecognised contract selector is a disagreement, not a pass.
    verdictsAgree:
      contract.value.accepted === preview.accepted && contract.value.rejection === preview.rejection
        ? true
        : false,
    reason:
      contract.value.accepted === preview.accepted && contract.value.rejection === preview.rejection
        ? null
        : `The contract and the local preview disagree: contract ${contract.value.accepted ? "accepts" : `rejects (${contract.value.rejection ?? contract.value.selector ?? "unknown reason"})`}, preview ${preview.accepted ? "accepts" : `rejects (${preview.rejection ?? "unknown reason"})`}. Trust the contract, and please report this.`,
  };
}

export type RecordIssuanceResult = {
  readonly transactionHash: `0x${string}`;
  readonly recordId: `0x${string}`;
  readonly alreadyRecorded: boolean;
  readonly blockNumber?: bigint;
};

/**
 * Records an issuance attestation on the registry contract using the operator key.
 *
 * Checks if already recorded first (idempotent). Signs and submits `recordIssuance` via
 * JSON-RPC relay and waits for receipt. Never throws.
 */
export async function recordIssuanceOnChain(
  prepared: PreparedAttestation,
  network: HederaNetwork = serverEnvironment().network,
): Promise<Result<RecordIssuanceResult>> {
  const environment = serverEnvironment();
  if (!environment.registryAddress) {
    return { ok: false, error: "No registry is configured. Set NEXT_PUBLIC_REGISTRY_ADDRESS." };
  }

  // Idempotency check: see if record already exists on chain
  const existingRecord = await readRecord(prepared.digest, network);
  if (existingRecord.ok && existingRecord.value !== null) {
    return {
      ok: true,
      value: {
        transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
        recordId: prepared.digest,
        alreadyRecorded: true,
      },
    };
  }

  let operatorPrivateKey: string;
  try {
    const opEnv = operatorEnvironment();
    if (!opEnv.operatorPrivateKey) {
      return { ok: false, error: `Operator private key is required. Set ${ENV_KEYS.operatorPrivateKey}.` };
    }
    operatorPrivateKey = opEnv.operatorPrivateKey;
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }

  try {
    const account = privateKeyToAccount(operatorPrivateKey as `0x${string}`);
    const walletClient = createWalletClient({
      account,
      chain: {
        id: NETWORK_ENDPOINTS[network].chainId,
        name: `hedera-${network}`,
        nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 8 },
        rpcUrls: { default: { http: [relayUrl(network)] } },
      },
      transport: http(relayUrl(network), { timeout: 30_000, retryCount: 2 }),
    });

    const txHash = await walletClient.writeContract({
      address: environment.registryAddress as `0x${string}`,
      abi: PRICED_ASSET_REGISTRY_ABI,
      functionName: "recordIssuance",
      args: [
        prepared.feedId,
        prepared.digest,
        prepared.assetAddress,
        prepared.units,
        {
          price: toBigInt(prepared.observation.priceMantissa, "priceMantissa"),
          conf: toBigInt(prepared.observation.confidenceMantissa, "confidenceMantissa"),
          expo: prepared.observation.exponent,
          publishTime: prepared.observation.publishTime,
        },
      ],
    });

    const pClient = publicClient(network);
    const receipt = await pClient.waitForTransactionReceipt({ hash: txHash, timeout: 60_000 });

    if (receipt.status === "reverted") {
      return { ok: false, error: `Contract transaction reverted on-chain (txHash: ${txHash}).` };
    }

    return {
      ok: true,
      value: {
        transactionHash: txHash,
        recordId: prepared.digest,
        alreadyRecorded: false,
        blockNumber: receipt.blockNumber,
      },
    };
  } catch (error) {
    return { ok: false, error: `Registry contract write failed: ${describeError(error)}` };
  }
}
