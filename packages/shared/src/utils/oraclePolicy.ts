/**
 * Oracle policy evaluation: freshness and off-chain/on-chain deviation.
 *
 * These functions are pure and are the JS mirror of `PricedAssetRegistry`'s
 * on-chain checks. They exist so the UI can tell a developer *why* a
 * registration will be rejected before they spend a fee. The contract stays the
 * authority — this never substitutes for it.
 */

import { BPS_DENOMINATOR } from "../constants/oracle";
import type {
  AttestationEvaluation,
  DeviationAssessment,
  FreshnessAssessment,
  OraclePrice,
  RegistryRejectionCode,
} from "../types/oracle";
import { divRoundHalfUp, toBigInt } from "./decimal";

/** Compares an oracle `publishTime` against a freshness bound. */
export function assessFreshness(publishTime: number, nowSeconds: number, maxAgeSeconds: number): FreshnessAssessment {
  if (!Number.isFinite(publishTime) || !Number.isFinite(nowSeconds)) {
    throw new TypeError("assessFreshness requires finite unix-second timestamps");
  }
  if (!Number.isInteger(maxAgeSeconds) || maxAgeSeconds < 0) {
    throw new RangeError(`maxAgeSeconds must be a non-negative integer, received ${maxAgeSeconds}`);
  }

  // A publishTime in the future means clock skew or a bad relay; treat the age as 0
  // rather than reporting a negative age that would defeat the staleness check.
  const ageSeconds = Math.max(0, Math.floor(nowSeconds - publishTime));
  const stale = maxAgeSeconds > 0 ? ageSeconds > maxAgeSeconds : false;
  const agePercentOfBound = maxAgeSeconds > 0 ? Math.round((ageSeconds / maxAgeSeconds) * 100) : 0;

  return { ageSeconds, maxAgeSeconds, stale, agePercentOfBound };
}

/**
 * Absolute deviation between two oracle mantissas, in basis points.
 *
 * Both values must share an exponent (the caller checks that separately, because
 * a mismatched exponent means the wrong feed was read and the comparison would be
 * meaningless). The live price is the denominator, so "how far from the network's
 * number is this?".
 */
export function assessDeviation(
  attestedMantissa: string | bigint,
  liveMantissa: string | bigint,
  maxDeviationBps: number,
): DeviationAssessment {
  if (!Number.isInteger(maxDeviationBps) || maxDeviationBps < 0) {
    throw new RangeError(`maxDeviationBps must be a non-negative integer, received ${maxDeviationBps}`);
  }

  const attested = toBigInt(attestedMantissa, "attestedMantissa");
  const live = toBigInt(liveMantissa, "liveMantissa");
  if (live <= 0n) {
    // With a non-positive reference there is nothing to measure against; the
    // caller rejects non-positive prices separately.
    return { deviationBps: maxDeviationBps, maxDeviationBps, withinTolerance: false };
  }

  const absolute = attested > live ? attested - live : live - attested;
  const deviationBps = Number(divRoundHalfUp(absolute * BigInt(BPS_DENOMINATOR), live));

  return { deviationBps, maxDeviationBps, withinTolerance: deviationBps <= maxDeviationBps };
}

/** Inputs to `evaluateAttestation`. */
export type AttestationEvaluationInput = {
  /** Price the off-chain attestation was built from. */
  readonly attested: OraclePrice;
  /** Price the contract will read from Pyth when the registration lands. */
  readonly live: OraclePrice;
  readonly nowSeconds: number;
  readonly maxDeviationBps: number;
  readonly maxPriceAgeSeconds: number;
  /** Unit count from the issuance, base units. */
  readonly units: string;
};

function reject(code: RegistryRejectionCode, message: string) {
  return { code, message } as const;
}

/**
 * Runs the registry's acceptance rules off-chain, in the same order the contract
 * runs them, and reports the first failure.
 */
export function evaluateAttestation(input: AttestationEvaluationInput): AttestationEvaluation {
  const { attested, live, nowSeconds, maxDeviationBps, maxPriceAgeSeconds, units } = input;

  const freshness = assessFreshness(attested.publishTime, nowSeconds, maxPriceAgeSeconds);
  const deviation = assessDeviation(attested.priceMantissa, live.priceMantissa, maxDeviationBps);

  const fail = (code: RegistryRejectionCode, message: string): AttestationEvaluation => ({
    accepted: false,
    freshness,
    deviation,
    rejection: reject(code, message),
  });

  if (toBigInt(units, "units") <= 0n) {
    return fail("zero-units", "Units must be greater than zero.");
  }
  if (attested.exponent !== live.exponent) {
    return fail(
      "expo-mismatch",
      `Attested exponent ${attested.exponent} does not match the oracle's ${live.exponent}. The attestation was built against a different observation.`,
    );
  }
  if (attested.publishTime !== live.publishTime) {
    return fail(
      "publish-time-mismatch",
      "The attestation was built from a different oracle observation than the one the contract will read. Re-read the price and rebuild the attestation immediately before registering.",
    );
  }
  if (toBigInt(attested.priceMantissa, "priceMantissa") <= 0n) {
    return fail(
      "non-positive-price",
      "The attested price is not positive; refusing to value an asset at zero or below.",
    );
  }
  if (!deviation.withinTolerance) {
    return fail(
      "deviation-too-high",
      `Attested price deviates ${deviation.deviationBps} bp from the oracle; the contract allows at most ${maxDeviationBps} bp.`,
    );
  }
  if (freshness.stale) {
    return fail(
      "price-stale",
      `Oracle publish time is ${freshness.ageSeconds}s old; the contract allows at most ${maxPriceAgeSeconds}s.`,
    );
  }

  return { accepted: true, freshness, deviation };
}
