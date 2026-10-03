import { describe, expect, it } from "vitest";
import {
  OracleDecodeError,
  UINT32_MAX,
  decodeOraclePrice,
  decodeValidTimePeriod,
  formatOracleConfidence,
  formatOraclePrice,
  baseUnitsPerToken,
  priceToUsdString,
  publishTimeToIso,
  valueOfBaseUnits,
} from "./price";

/** The HBAR/USD observation actually read from Pyth on Hedera testnet. */
const HBAR_WORDS = [8055012n, 5531n, -8n, 1787525955n] as const;

describe("decodeOraclePrice", () => {
  it("decodes the four words the Hedera deployment returns", () => {
    expect(decodeOraclePrice([...HBAR_WORDS])).toEqual({
      priceMantissa: "8055012",
      confidenceMantissa: "5531",
      exponent: -8,
      publishTime: 1787525955,
    });
  });

  it("refuses the five-word IPyth tuple instead of misreading it", () => {
    // This is the failure mode that motivates the word-count assertion: the fifth
    // word (`emaPrice`) would be read as `publishTime` and produce a plausible but
    // wrong price instead of an error.
    expect(() => decodeOraclePrice([...HBAR_WORDS, 8055000n])).toThrow(OracleDecodeError);
    expect(() => decodeOraclePrice([...HBAR_WORDS, 8055000n])).toThrow(/5 word/);
    expect(() => decodeOraclePrice([8055012n, 5531n, -8n])).toThrow(/3 word/);
    expect(() => decodeOraclePrice([])).toThrow(/0 word/);
  });

  it("records the word count on the error for programmatic handling", () => {
    try {
      decodeOraclePrice([...HBAR_WORDS, 1n]);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(OracleDecodeError);
      expect((error as OracleDecodeError).wordCount).toBe(5);
    }
  });

  it("rejects a negative confidence interval", () => {
    expect(() => decodeOraclePrice([8055012n, -1n, -8n, 1787525955n])).toThrow(/conf/);
  });

  it("rejects out-of-range mantissas", () => {
    expect(() => decodeOraclePrice([2n ** 63n, 0n, -8n, 1n])).toThrow(/price is out of range/);
    expect(() => decodeOraclePrice([-(2n ** 63n) - 1n, 0n, -8n, 1n])).toThrow(/price is out of range/);
  });

  it("rejects a publishTime beyond uint32", () => {
    expect(() => decodeOraclePrice([1n, 0n, -8n, UINT32_MAX + 1n])).toThrow(/publishTime is out of range/);
  });

  it("rejects an exponent outside the supported window", () => {
    expect(() => decodeOraclePrice([1n, 0n, -40n, 1n])).toThrow(/exponent -40 is outside/);
    expect(() => decodeOraclePrice([1n, 0n, 40n, 1n])).toThrow(/exponent 40 is outside/);
  });

  it("names the offending function in the message, for debuggable RPC failures", () => {
    expect(() => decodeOraclePrice([...HBAR_WORDS, 1n], "getPriceNoOlderThan")).toThrow(/getPriceNoOlderThan/);
    expect(() => decodeOraclePrice([1n, 0n, -40n, 1n], "getPriceUnsafe")).toThrow(/getPriceUnsafe/);
  });
});

describe("decodeValidTimePeriod", () => {
  it("decodes the 60 second window reported by the Hedera deployment", () => {
    expect(decodeValidTimePeriod(60n)).toBe(60);
  });

  it("rejects values that are not uint32", () => {
    expect(() => decodeValidTimePeriod(-1n)).toThrow(OracleDecodeError);
    expect(() => decodeValidTimePeriod(UINT32_MAX + 1n)).toThrow(OracleDecodeError);
  });
});

describe("presentation helpers", () => {
  it("formats the live price and confidence interval", () => {
    const price = decodeOraclePrice([...HBAR_WORDS]);
    expect(formatOraclePrice(price, 8)).toBe("0.08055012");
    expect(formatOraclePrice(price, 6)).toBe("0.08055");
    // conf 5531 * 1e-8 = 0.00005531
    expect(formatOracleConfidence(price, 8)).toBe("0.00005531");
  });

  it("produces a canonical price string for the envelope, with trailing zeros trimmed", () => {
    const price = decodeOraclePrice([...HBAR_WORDS]);
    expect(priceToUsdString(price)).toBe("0.08055012");
    // Trailing-zero trimming is what makes the digest canonical: $1.00 and $1
    // must not produce two different attestation hashes for the same observation.
    expect(priceToUsdString(decodeOraclePrice([100000000n, 0n, -8n, 1n]))).toBe("1");
  });

  it("values base units by applying the token's decimals, not just the mantissa", () => {
    const price = decodeOraclePrice([...HBAR_WORDS]);
    // 1 whole 6dp token == 1_000_000 base units == $0.08055012
    expect(valueOfBaseUnits(price, 1000000n, 6, 8)).toBe("0.08055012");
    expect(valueOfBaseUnits(price, 2500000n, 6, 8)).toBe("0.2013753");
    expect(valueOfBaseUnits(price, 1n, 6, 18)).toBe("0.00000008055012");
  });

  it("values a whole token, which is 10 ** decimals base units", () => {
    const price = decodeOraclePrice([...HBAR_WORDS]);
    expect(valueOfBaseUnits(price, baseUnitsPerToken(6), 6, 8)).toBe("0.08055012");
    // A 0-decimal token: one base unit is one token, and the oracle price is
    // already per token, so the value is unchanged.
    expect(valueOfBaseUnits(price, baseUnitsPerToken(0), 0, 8)).toBe("0.08055012");
    expect(baseUnitsPerToken(6)).toBe(1000000n);
    expect(() => baseUnitsPerToken(19)).toThrow(/tokenDecimals/);
  });

  it("rejects non-integer unit amounts and impossible decimals", () => {
    const price = decodeOraclePrice([...HBAR_WORDS]);
    expect(() => valueOfBaseUnits(price, "1.5", 6)).toThrow(/units/);
    expect(() => valueOfBaseUnits(price, 1000000n, 19)).toThrow(/tokenDecimals/);
    expect(() => valueOfBaseUnits(price, 1000000n, -1)).toThrow(/tokenDecimals/);
  });

  it("renders publishTime as ISO-8601, and null when the feed has never published", () => {
    expect(publishTimeToIso(1787525955)).toBe("2026-08-23T22:59:15.000Z");
    expect(publishTimeToIso(0)).toBeNull();
    expect(publishTimeToIso(-1)).toBeNull();
  });
});
