/**
 * Oracle price types.
 *
 * `OraclePrice` intentionally mirrors the **four** words the Pyth deployment on
 * Hedera returns, not the five-word `IPyth` interface in Pyth's documentation.
 * See `../constants/oracle.ts` for the verification that established this.
 */

/** Raw on-chain oracle observation, exactly as the contract reports it. */
export type OraclePrice = {
  /** Signed 64-bit price mantissa. May be negative; the template refuses non-positive prices. */
  readonly priceMantissa: string;
  /** Signed 64-bit confidence interval, same exponent as `priceMantissa`. */
  readonly confidenceMantissa: string;
  /** Base-10 exponent. Real value is `priceMantissa * 10 ** exponent`. */
  readonly exponent: number;
  /** Unix seconds of the oracle's own publish time (not the block time). */
  readonly publishTime: number;
};

export type OracleFeedRead = {
  /** Network the read was performed against. */
  readonly network: string;
  /** Pyth contract address the read was performed against. */
  readonly oracleAddress: `0x${string}`;
  readonly feedId: `0x${string}`;
  readonly price: OraclePrice;
  /** `getValidTimePeriod()` from the same contract, seconds. */
  readonly validTimePeriodSeconds: number;
  /** Wall-clock time the read was taken, unix seconds. */
  readonly observedAt: number;
};

/** Result of evaluating a price against the registry's freshness policy. */
export type FreshnessAssessment = {
  /** Seconds between the oracle's `publishTime` and the evaluation time. */
  readonly ageSeconds: number;
  /** Bound the age was compared against, seconds. */
  readonly maxAgeSeconds: number;
  /** `true` when `ageSeconds > maxAgeSeconds`. */
  readonly stale: boolean;
  /** Age as a percentage of the bound, rounded to whole percent (for display only). */
  readonly agePercentOfBound: number;
};

/** Result of comparing an attested price against the live on-chain price. */
export type DeviationAssessment = {
  /** Absolute difference in basis points, rounded half-up. */
  readonly deviationBps: number;
  /** Allowed bound, basis points. */
  readonly maxDeviationBps: number;
  readonly withinTolerance: boolean;
};

/** Machine-readable reasons the registry contract can reject an attestation. */
export const REGISTRY_REJECTION_CODES = [
  "expo-mismatch",
  "publish-time-mismatch",
  "deviation-too-high",
  "price-stale",
  "non-positive-price",
  "zero-units",
] as const;

export type RegistryRejectionCode = (typeof REGISTRY_REJECTION_CODES)[number];

/**
 * Verdict returned by `evaluateAttestation` — a pure function that mirrors the
 * contract's own checks so the UI can explain a rejection before spending fees.
 * The contract remains the authority; this never replaces it.
 */
export type AttestationEvaluation = {
  readonly accepted: boolean;
  readonly freshness: FreshnessAssessment;
  readonly deviation: DeviationAssessment;
  readonly rejection?: {
    readonly code: RegistryRejectionCode;
    readonly message: string;
  };
};
