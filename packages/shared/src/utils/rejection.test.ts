/**
 * Selector derivation.
 *
 * The stronger check — that these selectors equal the ones solc assigned — lives in
 * `packages/hardhat/test/rejection.test.ts`, because it needs the compiled artifact and
 * this package's tests must run before anything has been compiled. The ABI these
 * selectors are derived from is itself guarded against that artifact by
 * `packages/hardhat/test/abi.test.ts`, so the chain of custody is complete.
 */

import { describe, expect, it } from "vitest";
import { PRICED_ASSET_REGISTRY_ABI } from "../abi/generated";
import { REJECTION_SOLIDITY_ERRORS } from "../constants/registry";
import {
  REJECTION_SELECTORS,
  REGISTRY_ERROR_SELECTORS,
  errorNameForSelector,
  errorSignature,
  explainSelector,
  normalizeSelector,
  selectorOf,
} from "./rejection";
import type { RegistryRejectionCode } from "../types/oracle";



describe("error signatures and selectors", () => {
  it("builds the canonical signature, with no spaces and no argument names", () => {
    expect(errorSignature({ name: "PriceStale", inputs: [{ type: "uint64" }, { type: "uint64" }] })).toBe(
      "PriceStale(uint64,uint64)",
    );
    expect(errorSignature({ name: "ZeroAddress" })).toBe("ZeroAddress()");
    expect(errorSignature({ name: "DeviationTooHigh", inputs: [{ type: "uint16" }, { type: "uint16" }] })).toBe(
      "DeviationTooHigh(uint16,uint16)",
    );
  });

  it("expands a struct parameter in Solidity's tuple notation, not flattened", () => {
    // Regression test. `checkAttestation(bytes32,(int64,int64,int32,uint32))` and
    // `checkAttestation(bytes32,int64,int64,int32,uint40)` produce different selectors,
    // and joining the components instead of wrapping them produces a plausible 4-byte
    // value that dispatches to nothing.
    const observation = [
      { type: "int64" },
      { type: "int64" },
      { type: "int32" },
      { type: "uint32" },
    ];
    const asStruct = errorSignature({
      name: "checkAttestation",
      inputs: [{ type: "bytes32" }, { type: "tuple", components: observation }],
    });
    const flattened = errorSignature({
      name: "checkAttestation",
      inputs: [{ type: "bytes32" }, ...observation],
    });

    expect(asStruct).toBe("checkAttestation(bytes32,(int64,int64,int32,uint32))");
    expect(flattened).toBe("checkAttestation(bytes32,int64,int64,int32,uint32)");
    expect(selectorOf({ name: "checkAttestation", inputs: [{ type: "bytes32" }, { type: "tuple", components: observation }] })).not.toBe(
      selectorOf({ name: "checkAttestation", inputs: [{ type: "bytes32" }, ...observation] }),
    );
  });

  it("expands nested tuples", () => {
    expect(
      errorSignature({
        name: "outer",
        inputs: [{ type: "tuple", components: [{ type: "address" }, { type: "tuple", components: [{ type: "uint8" }] }] }],
      }),
    ).toBe("outer((address,(uint8)))");
  });

  it("derives an 8-hex-character selector for every ABI entry", () => {
    const callable = PRICED_ASSET_REGISTRY_ABI.filter((entry) => entry.type === "function" || entry.type === "error");
    expect(callable.length).toBeGreaterThan(40);
    for (const entry of callable) {
      expect(selectorOf(entry), entry.name).toMatch(/^[0-9a-f]{8}$/);
    }
  });

  it("is a pure function of the signature", () => {
    const item = { name: "PriceStale", inputs: [{ type: "uint64" }, { type: "uint64" }] };
    expect(selectorOf(item)).toBe(selectorOf({ ...item }));
  });

  it("indexes every ABI error by selector", () => {
    const errors = PRICED_ASSET_REGISTRY_ABI.filter((entry) => entry.type === "error");
    expect(Object.keys(REGISTRY_ERROR_SELECTORS)).toHaveLength(errors.length);
  });
});

describe("REJECTION_SELECTORS", () => {
  it("covers every rejection code", () => {
    for (const code of Object.keys(REJECTION_SOLIDITY_ERRORS)) {
      expect(REJECTION_SELECTORS[code as RegistryRejectionCode]).toMatch(/^[0-9a-f]{8}$/);
    }
  });

  it("has no two codes sharing a selector", () => {
    const selectors = Object.values(REJECTION_SELECTORS);
    expect(new Set(selectors).size).toBe(selectors.length);
  });
});

describe("explainSelector", () => {
  it("round-trips every code back from its selector", () => {
    for (const [code, selector] of Object.entries(REJECTION_SELECTORS) as Array<
      [RegistryRejectionCode, string]
    >) {
      expect(explainSelector(`0x${selector}`)).toBe(code);
      expect(explainSelector(selector)).toBe(code);
    }
  });

  it("treats the zero selector as acceptable, not as a failure", () => {
    // `checkAttestation` returns bytes4(0) to mean "no revert"; read as an error name
    // it must not surface as a mystery.
    expect(explainSelector("0x00000000")).toBeNull();
    expect(explainSelector("0x")).toBeNull();
    expect(errorNameForSelector("0x00000000")).toBeNull();
  });

  it("returns null for a selector the ABI does not define instead of guessing", () => {
    expect(explainSelector("0xdeadbeef")).toBeNull();
    expect(errorNameForSelector("0xdeadbeef")).toBeNull();
  });

});

describe("normalizeSelector", () => {
  it("accepts the two encodings the callers actually produce", () => {
    // viem returns 0x-prefixed hex; the contract returns a bytes4.
    expect(normalizeSelector("0x1C6D1B2A")).toBe(normalizeSelector("0x1c6d1b2a"));
    expect(normalizeSelector("1c6d1b2a")).toBe("1c6d1b2a");
    expect(normalizeSelector("  0x1c6d1b2a  ")).toBe("1c6d1b2a");
  });

  it("pads a short value rather than reading past it", () => {
    expect(normalizeSelector("0x1b")).toBe("0000001b");
  });
});
