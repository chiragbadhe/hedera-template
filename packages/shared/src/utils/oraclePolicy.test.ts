import { describe, expect, it } from "vitest";
import { REJECTION_SOLIDITY_ERRORS } from "../constants/registry";
import { REGISTRY_REJECTION_CODES, type OraclePrice } from "../types/oracle";
import { assessDeviation, assessFreshness, evaluateAttestation } from "./oraclePolicy";

const LIVE: OraclePrice = {
  priceMantissa: "8055012",
  confidenceMantissa: "5531",
  exponent: -8,
  publishTime: 1787525955,
};

const NOW = 1787526000;
const MAX_AGE = 90 * 24 * 60 * 60;

describe("assessFreshness", () => {
  it("measures the age in seconds", () => {
    expect(assessFreshness(NOW - 45, NOW, MAX_AGE)).toMatchObject({ ageSeconds: 45, stale: false });
  });

  it("flags a price exactly one second past the bound, and not at the bound", () => {
    expect(assessFreshness(NOW - 60, NOW, 60).stale).toBe(false);
    expect(assessFreshness(NOW - 61, NOW, 60).stale).toBe(true);
  });

  it("treats a zero bound as no bound rather than 'always stale'", () => {
    expect(assessFreshness(NOW - 10_000, NOW, 0)).toMatchObject({ stale: false, agePercentOfBound: 0 });
  });

  it("clamps a future publishTime to age zero so clock skew cannot bypass the check", () => {
    // A publishTime in the future would otherwise produce a negative age that
    // passes any bound.
    const assessment = assessFreshness(NOW + 120, NOW, 60);
    expect(assessment.ageSeconds).toBe(0);
    expect(assessment.stale).toBe(false);
  });

  it("reports the age as a percentage of the bound, for the freshness meter", () => {
    expect(assessFreshness(NOW - 45, NOW, 60).agePercentOfBound).toBe(75);
  });

  it("rejects non-finite timestamps and negative bounds", () => {
    expect(() => assessFreshness(Number.NaN, NOW, 60)).toThrow(TypeError);
    expect(() => assessFreshness(NOW, Number.POSITIVE_INFINITY, 60)).toThrow(TypeError);
    expect(() => assessFreshness(NOW, NOW, -1)).toThrow(RangeError);
    expect(() => assessFreshness(NOW, NOW, 1.5)).toThrow(RangeError);
  });
});

describe("assessDeviation", () => {
  it("is zero for an identical price", () => {
    expect(assessDeviation("8055012", "8055012", 50)).toEqual({
      deviationBps: 0,
      maxDeviationBps: 50,
      withinTolerance: true,
    });
  });

  it("measures absolute deviation in basis points against the live price", () => {
    // 1% high: 8155012 vs 8055012 -> 100000/8055012 * 10000 = 124.12 bp
    expect(assessDeviation("8155012", "8055012", 50).deviationBps).toBe(124);
    // 1% low is the same distance.
    expect(assessDeviation("7955012", "8055012", 50).deviationBps).toBe(124);
  });

  it("accepts a deviation at the bound and rejects one that rounds above it", () => {
    // The comparison is made on the *rounded* basis-point figure, so the effective
    // bound is maxDeviationBps +/- 0.5 bp. 8055012 * 50 / 10_000 = 40275.06, so a
    // delta of 40275 rounds to exactly 50 bp and is inside the bound.
    expect(assessDeviation("8095287", "8055012", 50)).toMatchObject({ deviationBps: 50, withinTolerance: true });
    // 41081 / 8055012 = 51.0025 bp -> outside.
    expect(assessDeviation("8096093", "8055012", 50)).toMatchObject({ deviationBps: 51, withinTolerance: false });
  });

  it("rounds half-up rather than truncating, so a boundary case is not understated", () => {
    // A delta of exactly half a basis point must round up to 1 bp, not truncate to 0.
    expect(assessDeviation("20001", "20000", 0)).toMatchObject({ deviationBps: 1, withinTolerance: false });
    expect(assessDeviation("20001", "20000", 1)).toMatchObject({ deviationBps: 1, withinTolerance: true });
  });

  it("fails closed when the live price is not positive", () => {
    expect(assessDeviation("8055012", "0", 50)).toMatchObject({ deviationBps: 50, withinTolerance: false });
    expect(assessDeviation("8055012", "-1", 50).withinTolerance).toBe(false);
  });

  it("stays exact past the safe-integer range", () => {
    expect(assessDeviation("9007199254740993", "9007199254740992", 100).deviationBps).toBe(0);
  });

  it("rejects a negative bound", () => {
    expect(() => assessDeviation("1", "1", -1)).toThrow(RangeError);
  });
});

describe("evaluateAttestation", () => {
  const base = {
    attested: LIVE,
    live: LIVE,
    nowSeconds: NOW,
    maxDeviationBps: 50,
    maxPriceAgeSeconds: MAX_AGE,
    units: "1000000000",
  };

  it("accepts an attestation that matches the live observation", () => {
    const result = evaluateAttestation(base);
    expect(result.accepted).toBe(true);
    expect(result.rejection).toBeUndefined();
  });

  it("rejects zero units before looking at the price", () => {
    const result = evaluateAttestation({ ...base, units: "0" });
    expect(result.accepted).toBe(false);
    expect(result.rejection?.code).toBe("zero-units");
  });

  it("rejects an exponent mismatch, which means the wrong observation was read", () => {
    const result = evaluateAttestation({ ...base, attested: { ...LIVE, exponent: -6 } });
    expect(result.rejection?.code).toBe("expo-mismatch");
    expect(result.rejection?.message).toMatch(/-6/);
  });

  it("rejects a publish-time mismatch, which means the attestation is racing the chain", () => {
    const result = evaluateAttestation({ ...base, attested: { ...LIVE, publishTime: LIVE.publishTime - 60 } });
    expect(result.rejection?.code).toBe("publish-time-mismatch");
  });

  it("rejects a non-positive price", () => {
    const result = evaluateAttestation({
      ...base,
      attested: { ...LIVE, priceMantissa: "0" },
      live: { ...LIVE, priceMantissa: "0" },
    });
    expect(result.rejection?.code).toBe("non-positive-price");
  });

  it("rejects a price that deviates beyond the bound", () => {
    const result = evaluateAttestation({ ...base, attested: { ...LIVE, priceMantissa: "9000000" } });
    expect(result.rejection?.code).toBe("deviation-too-high");
    expect(result.rejection?.message).toMatch(/deviates \d+ bp/);
  });

  it("rejects a stale price", () => {
    const old = { ...LIVE, publishTime: NOW - MAX_AGE - 1 };
    const result = evaluateAttestation({ ...base, attested: old, live: old, maxPriceAgeSeconds: 3600 });
    expect(result.rejection?.code).toBe("price-stale");
    expect(result.rejection?.message).toMatch(/at most 3600s/);
  });

  it("enforces a tight freshness bound, proving the check is not decorative", () => {
    // The live Hedera HBAR/USD feed is far older than one hour; with a 1 hour
    // bound the same attestation that passes the shipped default must be refused.
    const recent: OraclePrice = { ...LIVE, publishTime: NOW - 3601 };
    const result = evaluateAttestation({ ...base, attested: recent, live: recent, maxPriceAgeSeconds: 3600 });
    expect(result.accepted).toBe(false);
    expect(result.rejection?.code).toBe("price-stale");
  });

  it("always reports freshness and deviation, even when it rejects", () => {
    const result = evaluateAttestation({ ...base, attested: { ...LIVE, priceMantissa: "9000000" } });
    expect(result.freshness.ageSeconds).toBe(45);
    expect(result.deviation.deviationBps).toBeGreaterThan(50);
  });

  it("accepts a deviation exactly at the bound", () => {
    const result = evaluateAttestation({ ...base, attested: { ...LIVE, priceMantissa: "8095287" } });
    expect(result.accepted).toBe(true);
    expect(result.deviation.deviationBps).toBe(50);
  });
});

describe("REJECTION_SOLIDITY_ERRORS", () => {
  const base = {
    attested: LIVE,
    live: LIVE,
    nowSeconds: NOW,
    maxDeviationBps: 50,
    maxPriceAgeSeconds: MAX_AGE,
    units: "1000000000",
  };

  it("names a distinct Solidity error for every rejection code", () => {
    const codes = Object.keys(REJECTION_SOLIDITY_ERRORS).sort();
    expect(codes).toEqual([...REGISTRY_REJECTION_CODES].sort());
    expect(new Set(Object.values(REJECTION_SOLIDITY_ERRORS)).size).toBe(codes.length);
  });

  it("resolves the error name for the code each rejection actually reports", () => {
    const stale = { ...LIVE, publishTime: NOW - (MAX_AGE + 1) };
    const cases = [
      { input: { attested: { ...LIVE, exponent: -6 } }, code: "expo-mismatch" },
      { input: { attested: { ...LIVE, publishTime: NOW - 46 } }, code: "publish-time-mismatch" },
      { input: { attested: { ...LIVE, priceMantissa: "9000000" } }, code: "deviation-too-high" },
      { input: { attested: stale, live: stale }, code: "price-stale" },
      { input: { attested: { ...LIVE, priceMantissa: "0" } }, code: "non-positive-price" },
      { input: { units: "0" }, code: "zero-units" },
    ] as const;

    for (const { input, code } of cases) {
      const result = evaluateAttestation({ ...base, ...input });
      expect(result.rejection?.code).toBe(code);
      expect(REJECTION_SOLIDITY_ERRORS[result.rejection!.code]).toBeTruthy();
    }
  });
});
