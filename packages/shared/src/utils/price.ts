/**
 * Decoding raw EVM return values into oracle types, plus the derived display
 * values the UI shows.
 *
 * All decoding is done with `bigint` and every field range is asserted. Pyth
 * returns signed 64-bit mantissas; silently coercing one through `Number` is how
 * a template ends up displaying a price that is off by 2^53.
 */

import { formatScaled, toBigInt, type DecimalLike } from "./decimal";
import type { OraclePrice } from "../types/oracle";

/**
 * Number of 32-byte words the Hedera Pyth deployment returns from
 * `getPriceUnsafe`. Pyth's published `IPyth` interface declares five (it adds
 * `emaPrice`); the Hedera deployment returns four. See `../constants/oracle.ts`.
 */
export const PETH_PRICE_WORD_COUNT = 4;

export const INT64_MIN = -(2n ** 63n);
export const INT64_MAX = 2n ** 63n - 1n;
export const INT32_MIN = -(2n ** 31n);
export const INT32_MAX = 2n ** 31n - 1n;
export const UINT32_MAX = 2n ** 32n - 1n;

/** Largest exponent this template will accept; anything else is a misread feed. */
export const MIN_ACCEPTED_EXPONENT = -30;
export const MAX_ACCEPTED_EXPONENT = 30;

export class OracleDecodeError extends Error {
  readonly wordCount: number;

  constructor(message: string, wordCount: number) {
    super(message);
    this.name = "OracleDecodeError";
    this.wordCount = wordCount;
  }
}

/**
 * Decodes the raw return words of `getPriceUnsafe(bytes32)` into an `OraclePrice`.
 *
 * Throws `OracleDecodeError` on a wrong word count. That is intentional: the
 * five-word `IPyth` ABI would otherwise "succeed" by reading the `emaPrice`
 * slot as `publishTime`, producing a plausible-looking but wrong price. Failing
 * loudly is the only safe behaviour.
 */
export function decodeOraclePrice(words: readonly bigint[], field = "getPriceUnsafe"): OraclePrice {
  if (words.length !== PETH_PRICE_WORD_COUNT) {
    throw new OracleDecodeError(
      `${field} returned ${words.length} word(s); expected ${PETH_PRICE_WORD_COUNT} ` +
        `(price, conf, expo, publishTime). The Hedera Pyth deployment does not return the ` +
        `five-word IPyth tuple documented for other chains — refusing to guess.`,
      words.length,
    );
  }

  const [rawPrice, rawConf, rawExpo, rawPublishTime] = words as [bigint, bigint, bigint, bigint];

  const assertRange = (value: bigint, min: bigint, max: bigint, name: string) => {
    if (value < min || value > max) {
      throw new OracleDecodeError(`${field}: ${name} is out of range (${value})`, words.length);
    }
  };

  assertRange(rawPrice, INT64_MIN, INT64_MAX, "price");
  assertRange(rawConf, 0n, INT64_MAX, "conf");
  assertRange(rawExpo, INT32_MIN, INT32_MAX, "expo");
  assertRange(rawPublishTime, 0n, UINT32_MAX, "publishTime");

  const exponent = Number(rawExpo);
  if (exponent < MIN_ACCEPTED_EXPONENT || exponent > MAX_ACCEPTED_EXPONENT) {
    throw new OracleDecodeError(
      `${field}: exponent ${exponent} is outside [${MIN_ACCEPTED_EXPONENT}, ${MAX_ACCEPTED_EXPONENT}]`,
      words.length,
    );
  }

  return {
    priceMantissa: rawPrice.toString(),
    confidenceMantissa: rawConf.toString(),
    exponent,
    publishTime: Number(rawPublishTime),
  };
}

/** Decodes the single `uint` returned by `getValidTimePeriod()`. */
export function decodeValidTimePeriod(value: bigint, field = "getValidTimePeriod"): number {
  if (value < 0n || value > UINT32_MAX) {
    throw new OracleDecodeError(`${field} returned ${value}, which is not a uint32`, 1);
  }
  return Number(value);
}

/**
 * Human-readable price string, truncated (never rounded up) to `displayDecimals`.
 *
 * `displayDecimals` is a presentation choice only. Calculations always use the
 * raw mantissa/exponent pair, so display precision can never influence a verdict.
 */
export function formatOraclePrice(price: OraclePrice, displayDecimals = 6): string {
  return formatScaled(price.priceMantissa, price.exponent, displayDecimals, "priceMantissa");
}

/** Confidence interval as a price string, e.g. `0.000553`. */
export function formatOracleConfidence(price: OraclePrice, displayDecimals = 6): string {
  return formatScaled(price.confidenceMantissa, price.exponent, displayDecimals, "confidenceMantissa");
}

/**
 * Price as a decimal string with **at most** `fractionDigits` fractional digits.
 *
 * Trailing zeros are trimmed, which gives every value exactly one representation.
 * That matters here: the canonical envelope is hashed, so two encodings of the
 * same price would produce two different digests and break verification.
 */
export function priceToUsdString(price: OraclePrice, fractionDigits = 18): string {
  return formatScaled(price.priceMantissa, price.exponent, fractionDigits, "priceMantissa");
}

/**
 * USD value of `units` base units of a token with `tokenDecimals` decimals.
 *
 * `value = price * units / 10 ** tokenDecimals`, evaluated entirely in `bigint`.
 * Getting the decimals wrong here is the classic way to value an issuance off by
 * a factor of 10^6, so the shift is explicit rather than folded into the caller.
 */
export function valueOfBaseUnits(
  price: OraclePrice,
  units: DecimalLike,
  tokenDecimals: number,
  fractionDigits = 18,
  field = "units",
): string {
  if (!Number.isInteger(tokenDecimals) || tokenDecimals < 0 || tokenDecimals > 18) {
    throw new OracleDecodeError(
      `tokenDecimals must be an integer in [0, 18], received ${tokenDecimals}`,
      PETH_PRICE_WORD_COUNT,
    );
  }

  const scaledUnits = toBigInt(units, field);
  const mantissa = toBigInt(price.priceMantissa, "priceMantissa");
  return formatScaled(mantissa * scaledUnits, price.exponent - tokenDecimals, fractionDigits, "priceMantissa");
}

/** Base units in one whole token, e.g. `10 ** 6` for a 6 dp token. */
export function baseUnitsPerToken(tokenDecimals: number): bigint {
  if (!Number.isInteger(tokenDecimals) || tokenDecimals < 0 || tokenDecimals > 18) {
    throw new OracleDecodeError(
      `tokenDecimals must be an integer in [0, 18], received ${tokenDecimals}`,
      PETH_PRICE_WORD_COUNT,
    );
  }
  return 10n ** BigInt(tokenDecimals);
}

/** `publishTime` (unix seconds) as an ISO-8601 string, or `null` for 0/unknown. */
export function publishTimeToIso(publishTime: number): string | null {
  if (!Number.isInteger(publishTime) || publishTime <= 0) return null;
  return new Date(publishTime * 1000).toISOString();
}
