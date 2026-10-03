/**
 * Exact decimal helpers.
 *
 * Everything here is `BigInt`-based on purpose. Token amounts and oracle
 * mantissas routinely exceed `Number.MAX_SAFE_INTEGER`, and a `float64` round
 * trip through JSON is exactly how issuance amounts get silently corrupted.
 * Formatting is the only place a `number` is allowed to appear, and even then
 * only as a rounded, display-only value.
 */

const POWERS_OF_TEN: bigint[] = Array.from({ length: 40 }, (_, i) => 10n ** BigInt(i));

/**
 * Any value that can be converted to an exact integer.
 *
 * `number` is accepted but only for values already known to be safe integers;
 * `toBigInt` throws otherwise, so a lossy `float64` never sneaks through.
 */
export type DecimalLike = string | bigint | number;

export class DecimalError extends Error {
  override readonly name = "DecimalError";
}

/** Asserts `value` is a base-10 integer string, then returns it as a `bigint`. */
export function toBigInt(value: string | bigint | number, field: string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new DecimalError(
        `${field} must be a safe integer, received ${value}. Pass a decimal string for large values.`,
      );
    }
    return BigInt(value);
  }
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) {
    throw new DecimalError(`${field} must be a base-10 integer string, received "${value}"`);
  }
  return BigInt(trimmed);
}

function pow10(exponent: number): bigint {
  if (!Number.isInteger(exponent)) throw new DecimalError(`exponent must be an integer, received ${exponent}`);
  const negative = exponent < 0;
  const abs = Math.abs(exponent);
  if (abs >= POWERS_OF_TEN.length) {
    throw new DecimalError(`exponent ${exponent} is out of the supported range (|e| < ${POWERS_OF_TEN.length})`);
  }
  return negative ? 1n / POWERS_OF_TEN[abs]! : POWERS_OF_TEN[abs]!;
}

/**
 * Applies a base-10 exponent to a mantissa, returning an **exact** scaled integer
 * when the exponent is positive or zero.
 *
 * `applyExponentExact(8055012n, -8)` would lose precision, so negative exponents
 * are rejected here; use `formatScaled` for those.
 */
export function applyExponentExact(mantissa: string | bigint, exponent: number, field = "mantissa"): bigint {
  const value = toBigInt(mantissa, field);
  if (exponent < 0) {
    throw new DecimalError(
      `${field}: negative exponents are not representable as an exact integer (exponent=${exponent})`,
    );
  }
  return value * pow10(exponent);
}

/**
 * Renders `mantissa * 10 ** exponent` as a decimal string with at most
 * `decimals` fractional digits.
 *
 * Digits beyond `decimals` are **truncated**, never rounded up: overstating a
 * displayed price would misrepresent what the oracle actually returned.
 *
 * Implemented by first re-scaling the integer to the requested number of
 * fractional digits, then formatting that integer.
 */
export function formatScaled(mantissa: string | bigint, exponent: number, decimals = 0, field = "mantissa"): string {
  const value = toBigInt(mantissa, field);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 30) {
    throw new DecimalError(`decimals must be an integer in [0, 30], received ${decimals}`);
  }

  // We need `scaled` such that `scaled / 10 ** decimals === mantissa * 10 ** exponent`,
  // i.e. `scaled === mantissa * 10 ** (exponent + decimals)`, truncated.
  const scale = exponent + decimals;
  let scaled: bigint;
  if (scale >= 0) {
    scaled = value * pow10(scale);
  } else {
    const divisor = pow10(-scale);
    scaled = value / divisor; // BigInt division truncates toward zero.
  }

  const negative = scaled < 0n;
  const digits = (negative ? -scaled : scaled).toString().padStart(decimals + 1, "0");

  const whole = digits.slice(0, digits.length - decimals);
  const fraction = decimals === 0 ? "" : digits.slice(digits.length - decimals).replace(/0+$/, "");
  const body = fraction.length > 0 ? `${whole}.${fraction}` : whole;
  return negative && /[1-9]/.test(body) ? `-${body}` : body;
}

/** `mantissa * 10 ** exponent` as a `number`. Display only — never feed this back on-chain. */
export function toDisplayNumber(mantissa: string | bigint, exponent: number, field = "mantissa"): number {
  const value = toBigInt(mantissa, field);
  const asString = formatScaled(value, exponent, Math.min(Math.abs(exponent), 18), field);
  return Number(asString);
}

/**
 * Converts a human decimal string into base units, e.g.
 * `parseUnits("1250.5", 6) === 1250500000n`.
 *
 * Rejects more fractional digits than the token supports rather than rounding,
 * because silently rounding a user's issuance amount is unacceptable.
 */
export function parseUnits(input: string, decimals: number, field = "amount"): bigint {
  const trimmed = input.trim();
  if (!/^\d*(\.\d*)?$/.test(trimmed) || trimmed === "" || trimmed === ".") {
    throw new DecimalError(`${field} must be a non-negative decimal number, received "${input}"`);
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new DecimalError(`${field}: decimals must be an integer in [0, 18], received ${decimals}`);
  }

  const [whole = "", fraction = ""] = trimmed.split(".");
  if (fraction.length > decimals) {
    throw new DecimalError(
      `${field} has ${fraction.length} decimal places but the token only supports ${decimals}. Reduce the precision instead of rounding it.`,
    );
  }
  const padded = fraction.padEnd(decimals, "0");
  return BigInt(`${whole === "" ? "0" : whole}${padded === "" ? "" : padded}`);
}

/** Inverse of `parseUnits`. Truncates toward zero. */
export function formatUnits(units: string | bigint, decimals: number, field = "units"): string {
  const value = toBigInt(units, field);
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(decimals + 1, "0");
  if (decimals === 0) return `${negative ? "-" : ""}${digits}`;
  const whole = digits.slice(0, digits.length - decimals);
  const fraction = digits.slice(digits.length - decimals).replace(/0+$/, "");
  const body = fraction.length > 0 ? `${whole}.${fraction}` : whole;
  return `${negative ? "-" : ""}${body}`;
}

/** Half-up rounding division for `numerator / denominator`, rounding half away from zero. */
export function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new DecimalError("denominator must be non-zero");

  const negative = numerator < 0n !== denominator < 0n;
  const absNumerator = numerator < 0n ? -numerator : numerator;
  const absDenominator = denominator < 0n ? -denominator : denominator;
  const magnitude = (absNumerator * 2n + absDenominator) / (absDenominator * 2n);

  return negative ? -magnitude : magnitude;
}
