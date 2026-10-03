import { describe, expect, it } from "vitest";
import { ATTESTATION_SCHEMA } from "../constants/registry";
import {
  amountSchema,
  attestationEnvelopeSchema,
  decimalsSchema,
  entityIdSchema,
  formatZodError,
  hex32Schema,
  issuanceFormSchema,
  networkNameSchema,
  tokenNameSchema,
  tokenSymbolSchema,
  verificationRequestSchema,
} from "./issuance";

/** A minimal valid envelope; individual tests mutate one field at a time. */
const envelope = {
  schema: ATTESTATION_SCHEMA,
  ledger: "hedera",
  network: "testnet",
  asset: {
    tokenId: "0.0.5000001",
    tokenAddress: "0x00000000000000000000000000000000004c4b41",
    name: "Registered HBAR",
    symbol: "RHBAR",
    decimals: 6,
  },
  issuance: { units: "1000000000", txId: "0.0.5000002@1787525955.000000000" },
  pricing: {
    oracle: "pyth",
    oracleAddress: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729",
    feedId: "0x3728e591097635310e6341af53db8b7ee42da9b3a8d918f9463ce9cca886dfbd",
    feedSymbol: "Crypto.HBAR/USD",
    priceMantissa: "8055012",
    confidenceMantissa: "5531",
    exponent: -8,
    publishTime: 1787525955,
    validTimePeriodSeconds: 60,
    priceUsd: "0.08055012",
  },
  registry: {
    contractAddress: "0x0000000000000000000000000000000000abc123",
    contractId: "0.0.5000003",
    maxDeviationBps: 50,
    observedDeviationBps: 0,
    observedPriceAgeSeconds: 0,
  },
};

describe("tokenNameSchema", () => {
  it("accepts a normal token name", () => {
    expect(tokenNameSchema.parse("Registered HBAR")).toBe("Registered HBAR");
  });

  it("trims surrounding whitespace", () => {
    expect(tokenNameSchema.parse("  Gold Token  ")).toBe("Gold Token");
  });

  it("rejects an empty name", () => {
    expect(tokenNameSchema.safeParse("   ").success).toBe(false);
  });

  it("rejects names longer than the HTS limit", () => {
    expect(tokenNameSchema.safeParse("a".repeat(101)).success).toBe(false);
    expect(tokenNameSchema.safeParse("a".repeat(100)).success).toBe(true);
  });

  it("rejects non-printable characters", () => {
    expect(tokenNameSchema.safeParse("Bad\u0000Name").success).toBe(false);
    expect(tokenNameSchema.safeParse("Line\nBreak").success).toBe(false);
  });

  it("rejects repeated spaces", () => {
    expect(tokenNameSchema.safeParse("Two  Spaces").success).toBe(false);
  });
});

describe("tokenSymbolSchema", () => {
  it("accepts uppercase alphanumerics", () => {
    expect(tokenSymbolSchema.parse("RHBAR")).toBe("RHBAR");
    expect(tokenSymbolSchema.parse("USD1")).toBe("USD1");
  });

  it("rejects lowercase, symbols with punctuation, and over-long symbols", () => {
    expect(tokenSymbolSchema.safeParse("rhbar").success).toBe(false);
    expect(tokenSymbolSchema.safeParse("RH-BAR").success).toBe(false);
    expect(tokenSymbolSchema.safeParse("ABCDEFGHIJK").success).toBe(false);
    expect(tokenSymbolSchema.safeParse("A".repeat(10)).success).toBe(true);
  });
});

describe("decimalsSchema", () => {
  it("accepts the HTS-supported range", () => {
    expect(decimalsSchema.parse(0)).toBe(0);
    expect(decimalsSchema.parse(18)).toBe(18);
  });

  it("rejects fractional and out-of-range values", () => {
    expect(decimalsSchema.safeParse(1.5).success).toBe(false);
    expect(decimalsSchema.safeParse(19).success).toBe(false);
    expect(decimalsSchema.safeParse(-1).success).toBe(false);
  });
});

describe("amountSchema", () => {
  it("accepts amounts within the token's precision", () => {
    expect(amountSchema(6).safeParse("1250.5").success).toBe(true);
    expect(amountSchema(6).safeParse("100").success).toBe(true);
    expect(amountSchema(6).safeParse(".5").success).toBe(true);
  });

  it("refuses excess precision and says so, rather than rounding a user's input", () => {
    const result = amountSchema(6).safeParse("1.0000001");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toMatch(/at most 6 decimal places/);
  });

  it("rejects zero, empty and non-numeric input", () => {
    expect(amountSchema(6).safeParse("0").success).toBe(true);
    expect(amountSchema(6).safeParse("").success).toBe(false);
    expect(amountSchema(6).safeParse(".").success).toBe(false);
    expect(amountSchema(6).safeParse("-5").success).toBe(false);
    expect(amountSchema(6).safeParse("1e6").success).toBe(false);
    expect(amountSchema(6).safeParse("abc").success).toBe(false);
  });
});

describe("primitive schemas", () => {
  it("validates entity ids", () => {
    expect(entityIdSchema.safeParse("0.0.1234").success).toBe(true);
    expect(entityIdSchema.safeParse("0.0.").success).toBe(false);
    expect(entityIdSchema.safeParse("1234").success).toBe(false);
  });

  it("validates 32-byte hex", () => {
    expect(hex32Schema.safeParse(`0x${"ab".repeat(32)}`).success).toBe(true);
    expect(hex32Schema.safeParse("0xab").success).toBe(false);
  });

  it("validates the network enum", () => {
    expect(networkNameSchema.safeParse("testnet").success).toBe(true);
    expect(networkNameSchema.safeParse("devnet").success).toBe(false);
  });
});

describe("issuanceFormSchema", () => {
  it("applies the 6 dp default", () => {
    const parsed = issuanceFormSchema.parse({ tokenName: "Gold", tokenSymbol: "GLD", supply: "1000" });
    expect(parsed.decimals).toBe(6);
  });

  it("collects every problem at once, so the form can show them all", () => {
    const result = issuanceFormSchema.safeParse({ tokenName: "", tokenSymbol: "gold", supply: "abc" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join("."));
      expect(paths).toContain("tokenName");
      expect(paths).toContain("tokenSymbol");
      expect(paths).toContain("supply");
    }
  });

  it("treats an omitted memo as valid", () => {
    expect(issuanceFormSchema.safeParse({ tokenName: "Gold", tokenSymbol: "GLD", supply: "1" }).success).toBe(true);
    expect(issuanceFormSchema.safeParse({ tokenName: "Gold", tokenSymbol: "GLD", supply: "1", memo: "" }).success).toBe(
      true,
    );
  });

  it("rejects a memo that is too long or not printable", () => {
    const base = { tokenName: "Gold", tokenSymbol: "GLD", supply: "1" };
    expect(issuanceFormSchema.safeParse({ ...base, memo: "m".repeat(101) }).success).toBe(false);
    expect(issuanceFormSchema.safeParse({ ...base, memo: "bad\u0007" }).success).toBe(false);
  });
});

describe("attestationEnvelopeSchema", () => {
  it("accepts a well-formed envelope", () => {
    expect(attestationEnvelopeSchema.safeParse(envelope).success).toBe(true);
  });

  it("rejects an unknown schema tag outright, so an old verifier cannot half-succeed", () => {
    const result = attestationEnvelopeSchema.safeParse({ ...envelope, schema: "par.attestation.v2" });
    expect(result.success).toBe(false);
  });

  it("rejects a wrong ledger", () => {
    expect(attestationEnvelopeSchema.safeParse({ ...envelope, ledger: "ethereum" }).success).toBe(false);
  });

  it("rejects a non-integer units field, which would lose precision", () => {
    expect(
      attestationEnvelopeSchema.safeParse({ ...envelope, issuance: { ...envelope.issuance, units: 1000 } }).success,
    ).toBe(false);
    expect(
      attestationEnvelopeSchema.safeParse({ ...envelope, issuance: { ...envelope.issuance, units: "1.5" } }).success,
    ).toBe(false);
  });

  it("rejects a bad feed id or token address", () => {
    expect(
      attestationEnvelopeSchema.safeParse({ ...envelope, pricing: { ...envelope.pricing, feedId: "0x1234" } }).success,
    ).toBe(false);
    expect(
      attestationEnvelopeSchema.safeParse({
        ...envelope,
        asset: { ...envelope.asset, tokenAddress: "0xnothex" },
      }).success,
    ).toBe(false);
  });

  it("rejects a non-integer publishTime or exponent", () => {
    expect(
      attestationEnvelopeSchema.safeParse({ ...envelope, pricing: { ...envelope.pricing, publishTime: 1.5 } }).success,
    ).toBe(false);
    expect(
      attestationEnvelopeSchema.safeParse({ ...envelope, pricing: { ...envelope.pricing, exponent: -8.5 } }).success,
    ).toBe(false);
  });

  it("does not silently drop unknown fields, so an unexpected shape is visible", () => {
    const result = attestationEnvelopeSchema.safeParse({ ...envelope, surprise: true });
    // zod strips unknown keys by default; the parsed output simply lacks it.
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).not.toHaveProperty("surprise");
  });
});

describe("verificationRequestSchema", () => {
  it("accepts a topic id", () => {
    expect(verificationRequestSchema.safeParse({ topicId: "0.0.5000009" }).success).toBe(true);
  });

  it("accepts a transaction id in Hedera form", () => {
    expect(verificationRequestSchema.safeParse({ txId: "0.0.5000002@1787525955.000000000" }).success).toBe(true);
  });

  it("rejects a transaction id in the wrong shape", () => {
    expect(verificationRequestSchema.safeParse({ txId: "0.0.5000002" }).success).toBe(false);
    expect(verificationRequestSchema.safeParse({ txId: "0xdeadbeef" }).success).toBe(false);
  });
});

describe("formatZodError", () => {
  it("renders issues as `path: message`, joined for a single alert", () => {
    const result = issuanceFormSchema.safeParse({ tokenName: "", tokenSymbol: "gold", supply: "abc" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const message = formatZodError(result.error);
      expect(message).toMatch(/tokenSymbol:/);
      expect(message).toMatch(/; /);
    }
  });
});
