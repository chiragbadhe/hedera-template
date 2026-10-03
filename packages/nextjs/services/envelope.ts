/**
 * Canonical attestation assembly.
 *
 * This is the step the audit was missing. The digest the registry stores is
 * keccak256 over the **whole** `AssetAttestation` envelope, so it has to be computed
 * over the same object the verifier later recovers from HCS — not over an ad-hoc
 * four-field literal. Anything less produces a digest that no verifier can ever
 * reproduce, which is a silent failure: the write succeeds and the proof does not
 * check out.
 *
 * ## Why this is a separate module
 *
 * Building the envelope is pure bookkeeping over three independent reads (Mirror
 * Node for the token, Pyth for the observation, the registry for its policy), and
 * every one of those reads can fail in a way the caller must be told about. Keeping
 * it out of the route and out of the publish path means the digest is built in
 * exactly one place, which is what makes "the published bytes are the bytes the
 * digest is taken over" checkable rather than merely intended.
 */

import "server-only";

import {
  HCS_MAX_CHUNK_SIZE_BYTES,
  attestationDigest,
  attestationEnvelopeSchema,
  buildAttestation,
  canonicalJson,
  entityIdToEvmAddress,
  formatZodError,
  parseEntityId,
  toBigInt,
  priceToUsdString,
  type AssetAttestation,
  type OraclePrice,
} from "@sh/shared";
import { describeError, type Result } from "./chains";
import { serverEnvironment } from "./env";
import { readContractId, readToken } from "./mirror";
import { feedSymbol, readOracleSnapshot } from "./oracle";
import { checkAttestationPolicy, type PolicyVerdict } from "./attestation";

/**
 * A fully-built envelope plus everything needed to publish and record it.
 *
 * `canonicalBytes` is the exact byte sequence that `digest` hashes. It is carried
 * alongside the object rather than re-derived at publish time on purpose: if the two
 * could ever disagree, the registry would commit to bytes nobody published.
 */
export type PreparedAttestation = {
  /** The envelope, exactly as it will be serialised into the HCS message. */
  readonly attestation: AssetAttestation;
  /** UTF-8 bytes of `canonicalJson(attestation)`; the pre-image of `digest`. */
  readonly canonicalBytes: Uint8Array;
  /** keccak256 of `canonicalBytes`. Pass to `recordIssuance` as `bytes32`. */
  readonly digest: `0x${string}`;
  /** Pyth feed the observation came from, `bytes32`. */
  readonly feedId: `0x${string}`;
  /** The observation, still raw, for the contract's `Observation` argument. */
  readonly observation: OraclePrice;
  /** `price * 10 ** exponent` as a decimal string, for display only. */
  readonly priceUsd: string;
  /** EVM address form of the asset, as `recordIssuance` expects. */
  readonly assetAddress: `0x${string}`;
  /** Units in base units. */
  readonly units: bigint;
  /** Deviation `evaluateAttestation` measured, basis points. */
  readonly deviationBps: number;
  /** Age of the live observation when the envelope was built, seconds. */
  readonly priceAgeSeconds: number;
  /** Both verdicts, so the caller can report disagreement instead of hiding it. */
  readonly policy: PolicyVerdict;
};

/** What `/api/attest` accepts from the form. */
export type AttestationRequest = {
  /** HTS token id, `0.0.x`. */
  readonly assetToken: string;
  /** Units minted, in base units, as a decimal string. */
  readonly units: string;
  /**
   * Transaction id placed in `issuance.txId`.
   *
   * Supplied by the caller because it must be decided *before* the digest is
   * computed: the HCS submit's transaction id is reserved first, stamped into the
   * envelope, and then submitted under exactly that id.
   */
  readonly issuanceTxId: string;
};

/**
 * Builds the canonical envelope and its digest.
 *
 * Never throws; every failure is `{ ok: false, error }` with a message naming what
 * to configure or re-read. The order is deliberate — registry, then asset, then
 * price — because each of those is a precondition for the next and the message the
 * user sees should be about the first thing that was actually missing.
 */
export async function prepareAttestation(request: AttestationRequest): Promise<Result<PreparedAttestation>> {
  const environment = serverEnvironment();

  if (environment.registryAddress === undefined) {
    return {
      ok: false,
      error:
        "No registry is configured. Set NEXT_PUBLIC_REGISTRY_ADDRESS, or run `yarn hardhat:deploy` to deploy one.",
    };
  }

  if (parseEntityId(request.assetToken) === null) {
    return {
      ok: false,
      error: `"${request.assetToken}" is not a Hedera token id. Expected the 0.0.x form, for example 0.0.10840780.`,
    };
  }

  let units: bigint;
  try {
    units = toBigInt(request.units, "units");
  } catch (error) {
    return { ok: false, error: `The unit count cannot be used: ${describeError(error)}` };
  }

  const registryContractId = await resolveRegistryContractId(environment.registryAddress);
  if (!registryContractId.ok) return { ok: false, error: registryContractId.error };

  const tokenResult = await readToken(request.assetToken);
  if (!tokenResult.ok) return { ok: false, error: tokenResult.error };
  if (tokenResult.value === null) {
    return { ok: false, error: `Mirror Node has no token ${request.assetToken}; the asset does not exist on HTS.` };
  }

  const token = tokenResult.value;
  const assetAddress = token.evmAddress ?? entityIdToEvmAddress(token.tokenId);
  if (assetAddress === null) {
    return {
      ok: false,
      error: `Could not derive an EVM address for ${token.tokenId}, and the Mirror Node reports no evm_address. The registry stores addresses, so there is nothing to record.`,
    };
  }

  const snapshotResult = await readOracleSnapshot(environment.feedId);
  if (!snapshotResult.ok) return { ok: false, error: snapshotResult.error };
  const snapshot = snapshotResult.value;

  const policy = await checkAttestationPolicy(snapshot.price, request.units);
  if (policy.previewDeviationBps === null || policy.previewPriceAgeSeconds === null) {
    return { ok: false, error: policy.reason ?? "The live price could not be read." };
  }
  if (!policy.contractAccepted) {
    return {
      ok: false,
      error: `The registry would reject this attestation: ${policy.contractRejection ?? policy.contractSelector ?? "policy mismatch"}. ${policy.reason ?? ""}`.trim(),
    };
  }

  const attestation = buildAttestation({
    network: environment.network,
    asset: {
      tokenId: token.tokenId,
      tokenAddress: assetAddress,
      name: token.name,
      symbol: token.symbol,
      decimals: token.decimals,
    },
    issuance: { units: units.toString(), txId: request.issuanceTxId },
    pricing: {
      oracle: "pyth",
      oracleAddress: snapshot.oracleAddress,
      feedId: snapshot.feedId,
      feedSymbol: feedSymbol(snapshot.feedId),
      priceMantissa: snapshot.price.priceMantissa,
      confidenceMantissa: snapshot.price.confidenceMantissa,
      exponent: snapshot.price.exponent,
      publishTime: snapshot.price.publishTime,
      validTimePeriodSeconds: snapshot.validTimePeriodSeconds,
      priceUsd: priceToUsdString(snapshot.price),
    },
    registry: {
      contractAddress: environment.registryAddress,
      contractId: registryContractId.value,
      maxDeviationBps: environment.maxDeviationBps,
      observedDeviationBps: policy.previewDeviationBps,
      observedPriceAgeSeconds: policy.previewPriceAgeSeconds,
    },
  });

  // Validate before hashing: the verifier parses what comes back off HCS against
  // this same schema, so an envelope that fails here would publish successfully and
  // then fail every future verification of itself.
  const parsed = attestationEnvelopeSchema.safeParse(attestation);
  if (!parsed.success) {
    return {
      ok: false,
      error: `The attestation envelope is not publishable: ${formatZodError(parsed.error)}`,
    };
  }

  const canonicalBytes = new TextEncoder().encode(canonicalJson(attestation));

  // Chunking is deliberately not attempted. The digest commits to the whole
  // envelope, and the verifier hashes one HCS message at a time, so a chunked
  // payload would be published and then be unfindable. Refusing loudly is the only
  // outcome that cannot be mistaken for success.
  if (canonicalBytes.byteLength > HCS_MAX_CHUNK_SIZE_BYTES) {
    return {
      ok: false,
      error:
        `The attestation envelope is ${canonicalBytes.byteLength} bytes, over the ${HCS_MAX_CHUNK_SIZE_BYTES}-byte ` +
        `single-message limit for this topic. It would have to be chunked, and the verifier does not reassemble chunks, ` +
        `so publishing it would produce a record nothing can verify. Shorten the token name or symbol and try again.`,
    };
  }

  const digest = attestationDigest(attestation);
  if (!/^0x[0-9a-f]{64}$/.test(digest)) {
    return { ok: false, error: `The computed digest "${digest}" is not a bytes32; refusing to publish it.` };
  }

  return {
    ok: true,
    value: {
      attestation,
      canonicalBytes,
      digest: digest as `0x${string}`,
      feedId: snapshot.feedId as `0x${string}`,
      observation: snapshot.price,
      priceUsd: priceToUsdString(snapshot.price),
      assetAddress: assetAddress as `0x${string}`,
      units,
      deviationBps: policy.previewDeviationBps,
      priceAgeSeconds: policy.previewPriceAgeSeconds,
      policy,
    },
  };
}

/**
 * The registry's `0.0.x` id: the configured one, else the Mirror Node's answer.
 */
async function resolveRegistryContractId(address: string): Promise<Result<string>> {
  const configured = serverEnvironment().registryContractId;
  if (configured !== undefined) return { ok: true, value: configured };
  return readContractId(address);
}