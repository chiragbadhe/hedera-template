import { describe, expect, it } from "vitest";
import { ATTESTATION_SCHEMA } from "../constants/registry";
import type { AttestationDraft } from "../types/attestation";
import {
  attestationDigest,
  buildAttestation,
  canonicalJson,
  digestsMatch,
  digestOf,
  isEntityId,
  isHex20,
  isHex32,
} from "./attestation";

const draft: AttestationDraft = {
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
    priceUsd: "0.080550120000000000",
  },
  registry: {
    contractAddress: "0x0000000000000000000000000000000000abc123",
    contractId: "0.0.5000003",
    maxDeviationBps: 50,
    observedDeviationBps: 0,
    observedPriceAgeSeconds: 0,
  },
};

describe("canonicalJson", () => {
  it("sorts object keys recursively", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it("is insensitive to the insertion order of the source object", () => {
    const one = { alpha: 1, beta: { y: 2, x: 1 } } as const;
    const two = { beta: { x: 1, y: 2 }, alpha: 1 } as const;
    expect(canonicalJson(one)).toBe(canonicalJson(two));
  });

  it("preserves array order, because order is meaningful in JSON arrays", () => {
    expect(canonicalJson([3, 1, 2])).toBe("[3,1,2]");
    expect(canonicalJson({ a: [3, 1, 2] })).toBe('{"a":[3,1,2]}');
  });

  it("emits no insignificant whitespace", () => {
    expect(canonicalJson({ a: [1, 2], b: "x" })).toBe('{"a":[1,2],"b":"x"}');
  });

  it("drops undefined properties instead of emitting null", () => {
    expect(canonicalJson({ a: undefined, b: 1 })).toBe('{"b":1}');
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it("keeps null, which is a real value in the envelope", () => {
    expect(canonicalJson({ a: null })).toBe('{"a":null}');
  });

  it("escapes strings exactly as JSON does", () => {
    expect(canonicalJson({ a: 'quote " and \\ and \n' })).toBe('{"a":"quote \\" and \\\\ and \\n"}');
  });

  it("refuses numbers that cannot survive a JSON round-trip exactly", () => {
    // 2^53 + 1 is representable as a float64 but round-trips to 2^53. Silently
    // accepting it would change the digest the contract commits to.
    expect(() => canonicalJson({ a: 2 ** 53 + 1 })).toThrow(/safe integer/);
    expect(() => canonicalJson({ a: Number.NaN })).toThrow(/non-finite/);
    expect(() => canonicalJson({ a: 1.5 })).toThrow(/safe integer/);
  });

  it("allows negative integers", () => {
    expect(canonicalJson({ a: -42 })).toBe('{"a":-42}');
  });
});

describe("digestOf", () => {
  it("is a 0x-prefixed 32-byte hex string", () => {
    expect(digestOf({ a: 1 })).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("matches keccak256 of the canonical encoding, computed independently", async () => {
    const { keccak_256 } = await import("@noble/hashes/sha3.js");
    const value = { b: 2, a: "x" };
    const expected = `0x${Buffer.from(keccak_256(new TextEncoder().encode(canonicalJson(value)))).toString("hex")}`;
    expect(digestOf(value)).toBe(expected);
  });

  it("changes when any value changes", () => {
    expect(digestOf({ a: 1 })).not.toBe(digestOf({ a: 2 }));
    expect(digestOf({ a: 1 })).not.toBe(digestOf({ b: 1 }));
    expect(digestOf({ a: "1" })).not.toBe(digestOf({ a: 1 }));
  });

  it("is stable across key order", () => {
    expect(digestOf({ a: 1, b: { c: 2, d: 3 } })).toBe(digestOf({ b: { d: 3, c: 2 }, a: 1 }));
  });
});

describe("buildAttestation", () => {
  it("stamps the schema and ledger discriminator", () => {
    const attestation = buildAttestation(draft);
    expect(attestation.schema).toBe(ATTESTATION_SCHEMA);
    expect(attestation.ledger).toBe("hedera");
    expect(attestation.asset.symbol).toBe("RHBAR");
  });
});

describe("attestationDigest", () => {
  it("commits to the whole envelope", () => {
    expect(attestationDigest(buildAttestation(draft))).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("is stable for an unchanged envelope regardless of property order", () => {
    const attestation = buildAttestation(draft);
    const reordered = {
      registry: attestation.registry,
      pricing: attestation.pricing,
      issuance: attestation.issuance,
      asset: attestation.asset,
      network: attestation.network,
      ledger: attestation.ledger,
      schema: attestation.schema,
    } as typeof attestation;
    expect(attestationDigest(reordered)).toBe(attestationDigest(attestation));
  });

  it("changes when the attestation is tampered with", () => {
    const attestation = buildAttestation(draft);
    const original = attestationDigest(attestation);

    const inflated = { ...attestation, issuance: { ...attestation.issuance, units: "999999999999" } };
    expect(attestationDigest(inflated)).not.toBe(original);

    const repriced = {
      ...attestation,
      pricing: { ...attestation.pricing, priceMantissa: "1" },
    };
    expect(attestationDigest(repriced)).not.toBe(original);

    const swappedFeed = { ...attestation, pricing: { ...attestation.pricing, feedId: `0x${"11".repeat(32)}` } };
    expect(attestationDigest(swappedFeed)).not.toBe(original);
  });

  it("survives a JSON round-trip unchanged", () => {
    const attestation = buildAttestation(draft);
    const roundTripped = JSON.parse(JSON.stringify(attestation)) as typeof attestation;
    expect(attestationDigest(roundTripped)).toBe(attestationDigest(attestation));
  });
});

describe("digestsMatch", () => {
  it("is case-insensitive, since EVM tooling lowercases bytes32", () => {
    const lower = `0x${"ab".repeat(32)}`;
    const upper = `0x${"AB".repeat(32)}`;
    expect(digestsMatch(lower, upper)).toBe(true);
    expect(digestsMatch(upper, lower)).toBe(true);
    expect(digestsMatch(lower, `0x${"ac".repeat(32)}`)).toBe(false);
  });

  it("ignores surrounding whitespace from a pasted value", () => {
    expect(digestsMatch(` 0x${"ab".repeat(32)} `, `0x${"ab".repeat(32)}`)).toBe(true);
  });
});

describe("primitive guards", () => {
  it("recognises 32-byte hex", () => {
    expect(isHex32(`0x${"01".repeat(32)}`)).toBe(true);
    expect(isHex32(`0x${"01".repeat(31)}`)).toBe(false);
    expect(isHex32("nothex")).toBe(false);
    expect(isHex32(undefined)).toBe(false);
  });

  it("recognises 20-byte EVM addresses", () => {
    expect(isHex20("0x00000000000000000000000000000000004c4b41")).toBe(true);
    expect(isHex20(`0x${"01".repeat(32)}`)).toBe(false);
  });

  it("recognises Hedera entity ids", () => {
    expect(isEntityId("0.0.1234")).toBe(true);
    expect(isEntityId(" 0.0.1234 ")).toBe(true);
    expect(isEntityId("0.0.")).toBe(false);
    expect(isEntityId("0xA2aa501b19aff244D90cc15a4Cf739D2725B5729")).toBe(false);
    expect(isEntityId(42)).toBe(false);
  });
});
