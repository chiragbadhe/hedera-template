import { describe, expect, it } from "vitest";
import {
  EntityIdError,
  entityIdToEvmAddress,
  evmAddressToEntityId,
  parseEntityId,
  requireEntityId,
} from "./entities";

describe("parseEntityId", () => {
  it("splits shard, realm and num", () => {
    expect(parseEntityId("0.0.1234")).toEqual({ shard: 0, realm: 0, num: 1234 });
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseEntityId("  1.2.3  ")).toEqual({ shard: 1, realm: 2, num: 3 });
  });

  it("rejects anything that is not a dotted triple", () => {
    expect(parseEntityId("0.0.")).toBeNull();
    expect(parseEntityId("0.0.1234.5")).toBeNull();
    expect(parseEntityId("0xA2aa501b19aff244D90cc15a4Cf739D2725B5729")).toBeNull();
    expect(parseEntityId(42)).toBeNull();
    expect(parseEntityId(undefined)).toBeNull();
  });

  it("rejects a component that does not fit the 32-bit long-zero encoding", () => {
    expect(parseEntityId("0.0.4294967296")).toBeNull();
  });
});

describe("entityIdToEvmAddress", () => {
  it("matches the address pinned by the attestation fixtures", () => {
    expect(entityIdToEvmAddress("0.0.5000001")).toBe("0x00000000000000000000000000000000004c4b41");
  });

  it("matches the deployed registry contract id", () => {
    expect(entityIdToEvmAddress("0.0.10839925")).toBe("0x0000000000000000000000000000000000a56775");
  });

  it("always produces a 20-byte address", () => {
    for (const id of ["0.0.1", "0.0.999999999", "0.0.4294967295"]) {
      expect(entityIdToEvmAddress(id)).toMatch(/^0x[0-9a-f]{40}$/);
    }
  });

  it("has no long-zero form for a non-zero shard or realm", () => {
    expect(entityIdToEvmAddress("1.0.1234")).toBeNull();
    expect(entityIdToEvmAddress("0.1.1234")).toBeNull();
    expect(entityIdToEvmAddress("not-an-id")).toBeNull();
  });
});

describe("evmAddressToEntityId", () => {
  it("inverts entityIdToEvmAddress", () => {
    expect(evmAddressToEntityId(entityIdToEvmAddress("0.0.5000001")!)).toBe("0.0.5000001");
  });

  it("accepts a long-zero address", () => {
    expect(evmAddressToEntityId("0x0000000000000000000000000000000000a56775")).toBe("0.0.10839925");
  });

  it("returns null for an address with a real high word, such as an aliased contract", () => {
    expect(evmAddressToEntityId("0x2F2EfCE259e11f95C76273C882A18bAf166fc056x")).toBeNull();
    expect(evmAddressToEntityId("0x610178dA211FEF7D417bC0e6FeD39F05609AD788")).toBeNull();
  });

  it("returns null for a malformed address", () => {
    expect(evmAddressToEntityId("0x123")).toBeNull();
    expect(evmAddressToEntityId("nonsense")).toBeNull();
  });
});

describe("requireEntityId", () => {
  it("returns the trimmed id when it is well-formed", () => {
    expect(requireEntityId(" 0.0.1234 ", "registry contract id")).toBe("0.0.1234");
  });

  it("throws with the field name when it is not", () => {
    expect(() => requireEntityId("", "registry contract id")).toThrow(EntityIdError);
    expect(() => requireEntityId("", "registry contract id")).toThrow(/registry contract id/);
  });
});