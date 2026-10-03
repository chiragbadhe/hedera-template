/**
 * The canonical attestation envelope.
 *
 * ## Why an envelope exists
 *
 * The registry contract stores a 32-byte digest, not a payload. Storing the whole
 * attestation on-chain would be expensive and would duplicate data. Instead:
 *
 * 1. The client builds an `AssetAttestation` envelope that describes exactly what
 *    it did: which HTS asset, how many units, which oracle observation it priced
 *    them at, and which registry transaction recorded it.
 * 2. The envelope is serialised **canonically** (sorted keys, no insignificant
 *    whitespace) and hashed with keccak256. That digest is `attestationHash`.
 * 3. The envelope is published to an HCS topic, where it gets a consensus
 *    timestamp, a sequence number and a running hash.
 * 4. The registry contract stores `attestationHash`.
 *
 * The on-chain digest therefore commits to the exact bytes of the off-chain
 * payload. Recomputing the digest from the HCS payload and comparing it to the
 * on-chain value proves the record was not tampered with — that is what
 * `verifyAttestationDigest` does, and it is the core reusable primitive here.
 *
 * ## Field rules
 *
 * - Every integer that can exceed 2^53 is carried as a decimal **string**, so the
 *   envelope survives JSON round-trips through JavaScript without precision loss.
 * - The shape is versioned by `schema`. Consumers must reject unknown versions.
 */

import type { ATTESTATION_SCHEMA } from "../constants/registry";

export type AttestationAssetRef = {
  /** Hedera token id, `0.0.x`. */
  readonly tokenId: string;
  /** Long-zero EVM address of the same token. */
  readonly tokenAddress: string;
  readonly name: string;
  readonly symbol: string;
  /** Token decimals, 0–18. */
  readonly decimals: number;
};

export type AttestationIssuanceRef = {
  /** Units minted, in base units, as a decimal string. */
  readonly units: string;
  /**
   * Transaction that produced this record, `0.0.x@seconds.nanos`.
   *
   * When an HTS mint created the supply, that is the mint. Otherwise it is the
   * HCS `TopicMessageSubmitTransaction` that carried this envelope to consensus,
   * which is the transaction this template actually signs — it reserves the
   * transaction id *before* hashing, so the id inside the digest is the id the
   * network assigns. Verification only reads the seconds field, to assert the
   * payload reached consensus before the registry recorded it.
   */
  readonly txId: string;
};

export type AttestationPricingRef = {
  readonly oracle: "pyth";
  readonly oracleAddress: string;
  readonly feedId: string;
  readonly feedSymbol: string;
  /** Raw oracle mantissa, decimal string (signed). */
  readonly priceMantissa: string;
  /** Raw confidence mantissa, decimal string. */
  readonly confidenceMantissa: string;
  readonly exponent: number;
  /** Oracle publish time, unix seconds. */
  readonly publishTime: number;
  /** `getValidTimePeriod()` from the oracle contract, seconds. */
  readonly validTimePeriodSeconds: number;
  /** Unit price derived from mantissa/exponent, decimal string with 18 dp. */
  readonly priceUsd: string;
};

export type AttestationRegistryRef = {
  /** Registry contract address, `0x` form. */
  readonly contractAddress: string;
  /** Registry contract id, `0.0.x` form. */
  readonly contractId: string;
  /** Policy bound the contract enforced, basis points. */
  readonly maxDeviationBps: number;
  /** Deviation the contract measured, basis points. */
  readonly observedDeviationBps: number;
  /** Price age the contract measured, seconds. */
  readonly observedPriceAgeSeconds: number;
};

/** The canonical envelope. Field order here is irrelevant — hashing is key-sorted. */
export type AssetAttestation = {
  readonly schema: typeof ATTESTATION_SCHEMA;
  readonly ledger: "hedera";
  readonly network: string;
  readonly asset: AttestationAssetRef;
  readonly issuance: AttestationIssuanceRef;
  readonly pricing: AttestationPricingRef;
  readonly registry: AttestationRegistryRef;
};

/** A ledger record read back out of the registry contract. */
export type RegistryRecord = {
  readonly attestationHash: string;
  readonly assetToken: string;
  readonly registrant: string;
  readonly units: string;
  readonly priceMantissa: string;
  readonly confidenceMantissa: string;
  readonly exponent: number;
  readonly publishTime: number;
  readonly deviationBps: number;
  readonly priceAgeSeconds: string;
  readonly recordedAt: number;
  readonly blockNumber?: string;
  readonly transactionHash?: string;
};

/** Inputs to `buildAttestation`; everything is required so nothing is silently omitted. */
export type AttestationDraft = Omit<AssetAttestation, "schema" | "ledger">;
