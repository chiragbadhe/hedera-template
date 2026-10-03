import { describe, expect, it } from "vitest";
import {
  DecimalError,
  applyExponentExact,
  divRoundHalfUp,
  formatScaled,
  formatUnits,
  parseUnits,
  toBigInt,
  toDisplayNumber,
} from "./decimal";

describe("toBigInt", () => {
  it("accepts decimal strings, including values beyond MAX_SAFE_INTEGER", () => {
    expect(toBigInt("9007199254740993", "x")).toBe(9007199254740993n);
    expect(toBigInt("9007199254740993", "x") > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true);
  });

  it("rejects non-integer text so a decimal string is never silently truncated", () => {
    expect(() => toBigInt("1.5", "price")).toThrow(DecimalError);
    expect(() => toBigInt("1e6", "price")).toThrow(DecimalError);
    expect(() => toBigInt("0x10", "price")).toThrow(DecimalError);
    expect(() => toBigInt("", "price")).toThrow(DecimalError);
  });

  it("trims surrounding whitespace, because .env values arrive with it", () => {
    expect(toBigInt(" 12 ", "price")).toBe(12n);
    expect(toBigInt("\t-7\n", "price")).toBe(-7n);
  });

  it("rejects unsafe numbers but accepts safe ones", () => {
    expect(toBigInt(42, "x")).toBe(42n);
    expect(() => toBigInt(1.5, "x")).toThrow(DecimalError);
    // Number.MAX_SAFE_INTEGER + 1 is representable as a float64 but not exactly;
    // accepting it would silently corrupt every downstream digit.
    expect(() => toBigInt(Number.MAX_SAFE_INTEGER + 1, "x")).toThrow(/safe integer/);
  });

  it("names the offending field in the message", () => {
    expect(() => toBigInt("nope", "priceMantissa")).toThrow(/priceMantissa/);
  });
});

describe("applyExponentExact", () => {
  it("scales by a positive exponent", () => {
    expect(applyExponentExact("12", 3)).toBe(12000n);
    expect(applyExponentExact("12", 0)).toBe(12n);
    expect(applyExponentExact("8055012", 2)).toBe(805501200n);
  });

  it("refuses negative exponents, which have no exact integer form", () => {
    expect(() => applyExponentExact("8055012", -8)).toThrow(/exact integer/);
  });

  it("rejects exponents outside the supported window", () => {
    expect(() => applyExponentExact("1", 40)).toThrow(/supported range/);
    expect(() => applyExponentExact("1", 1.5)).toThrow(/integer/);
  });
});

describe("formatScaled", () => {
  // The real HBAR/USD observation read from Pyth on Hedera testnet.
  it("renders the live HBAR/USD price", () => {
    expect(formatScaled("8055012", -8, 8)).toBe("0.08055012");
    // Fewer digits than requested: the tail is truncated, then trailing zeros trimmed.
    expect(formatScaled("8055012", -8, 6)).toBe("0.08055");
    expect(formatScaled("8055012", -8, 2)).toBe("0.08");
    expect(formatScaled("8055012", -8, 0)).toBe("0");
  });

  it("truncates rather than rounding up, so a displayed price is never overstated", () => {
    // 1.9999 at 3dp must be 1.999, not 2.000.
    expect(formatScaled("19999", -4, 3)).toBe("1.999");
    expect(formatScaled("1", -1, 0)).toBe("0");
  });

  it("trims trailing zeros and a bare trailing dot", () => {
    expect(formatScaled("1000000", -8, 8)).toBe("0.01");
    expect(formatScaled("1000000", -8, 2)).toBe("0.01");
    expect(formatScaled("2000000", -6, 2)).toBe("2");
    expect(formatScaled("250", -2, 2)).toBe("2.5");
  });

  it("zero-pads the integer part when the value is smaller than the requested precision", () => {
    expect(formatScaled("1", -8, 8)).toBe("0.00000001");
    expect(formatScaled("1", -8, 2)).toBe("0");
    expect(formatScaled("5", -6, 2)).toBe("0");
    expect(formatScaled("123", -2, 6)).toBe("1.23");
  });

  it("handles negative mantissas, and never renders a bare negative zero", () => {
    expect(formatScaled("-8055012", -8, 8)).toBe("-0.08055012");
    expect(formatScaled("-1", -8, 8)).toBe("-0.00000001");
    // Truncation lands exactly on zero: no sign.
    expect(formatScaled("-1", -9, 8)).toBe("0");
    expect(formatScaled("-1", -1, 0)).toBe("0");
  });

  it("handles positive exponents", () => {
    expect(formatScaled("123", 3, 0)).toBe("123000");
    expect(formatScaled("123", 3, 2)).toBe("123000");
    expect(formatScaled("5", 2, 3)).toBe("500");
  });

  it("preserves precision above Number.MAX_SAFE_INTEGER", () => {
    expect(formatScaled("123456789012345678901234567890", 0, 0)).toBe("123456789012345678901234567890");
  });

  it("rejects an out-of-range decimals argument", () => {
    expect(() => formatScaled("1", 0, 31)).toThrow(DecimalError);
    expect(() => formatScaled("1", 0, -1)).toThrow(DecimalError);
    expect(() => formatScaled("1", 0, 1.5)).toThrow(DecimalError);
  });
});

describe("toDisplayNumber", () => {
  it("returns a float, for UI charts only", () => {
    expect(toDisplayNumber("8055012", -8)).toBeCloseTo(0.08055012, 10);
  });
});

describe("parseUnits", () => {
  it("scales a human amount into base units", () => {
    expect(parseUnits("1", 6)).toBe(1000000n);
    expect(parseUnits("1.5", 6)).toBe(1500000n);
    expect(parseUnits("0.000001", 6)).toBe(1n);
    expect(parseUnits("100", 0)).toBe(100n);
    expect(parseUnits("100", 18)).toBe(100000000000000000000n);
  });

  it("accepts a bare trailing dot and a missing integer part", () => {
    expect(parseUnits(".5", 6)).toBe(500000n);
    expect(parseUnits("5.", 6)).toBe(5000000n);
  });

  it("refuses more precision than the token supports rather than rounding", () => {
    expect(() => parseUnits("0.0000001", 6)).toThrow(/precision|decimal/i);
  });

  it("rejects malformed input and unsupported decimals", () => {
    expect(() => parseUnits("abc", 6)).toThrow(DecimalError);
    expect(() => parseUnits("1e6", 6)).toThrow(DecimalError);
    expect(() => parseUnits("-1", 6)).toThrow(DecimalError);
    expect(() => parseUnits("1", 19)).toThrow(/decimals/i);
    expect(() => parseUnits("1", -1)).toThrow(/decimals/i);
  });

  it("rejects an empty fraction-only string", () => {
    expect(() => parseUnits("", 6)).toThrow(DecimalError);
    expect(() => parseUnits(".", 6)).toThrow(DecimalError);
  });
});

describe("formatUnits", () => {
  it("is the exact inverse of parseUnits", () => {
    for (const [amount, decimals] of [
      ["1", 6],
      ["1.5", 6],
      ["0.000001", 6],
      ["123456789.123456789", 9],
    ] as const) {
      expect(formatUnits(parseUnits(amount, decimals), decimals)).toBe(amount);
    }
  });

  it("keeps full precision for values beyond double range", () => {
    expect(formatUnits("900719925474099300000000", 6)).toBe("900719925474099300");
  });
});

describe("divRoundHalfUp", () => {
  it("rounds half away from zero", () => {
    expect(divRoundHalfUp(5n, 2n)).toBe(3n);
    expect(divRoundHalfUp(4n, 2n)).toBe(2n);
    expect(divRoundHalfUp(7n, 2n)).toBe(4n);
    expect(divRoundHalfUp(-5n, 2n)).toBe(-3n);
  });

  it("truncates exactly divisible input without remainder", () => {
    expect(divRoundHalfUp(10000n, 1n)).toBe(10000n);
  });

  it("throws on a zero denominator rather than returning Infinity or NaN", () => {
    expect(() => divRoundHalfUp(1n, 0n)).toThrow(DecimalError);
  });
});
