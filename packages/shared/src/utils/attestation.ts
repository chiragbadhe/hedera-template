/**
 * Canonical attestation serialisation and digesting.
 *
 * `attestationDigest` is the contract between the off-chain envelope and the
 * on-chain registry: the contract stores this 32-byte value, and any verifier can
 * recompute it from the HCS payload. Both sides must agree byte-for-byte, so the
 * serialisation rules are pinned here and covered by tests:
 *
 * - object keys are sorted lexicographically, recursively;
 * - no insignificant whitespace;
 * - `undefined` properties are dropped;
 * - every value is a string, number, boolean, null, array or plain object.
 *
 * Numbers are only used for values that cannot exceed 2^53 (`exponent`,
 * `publishTime`, `decimals`, bps counters). Anything larger is carried as a
 * decimal string by design.
 */

import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { ATTESTATION_SCHEMA, LEDGER_HEDERA } from "../constants/registry";
import type { AssetAttestation, AttestationDraft } from "../types/attestation";

/** A JSON object; `undefined` values are permitted in the type and dropped at encode time. */
type JsonObject = { [key: string]: JsonValue | undefined };

type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;

/** Serialises a JSON-compatible value with sorted keys and no whitespace. */
export function canonicalJson(value: JsonValue | AssetAttestation): string {
  if (value === null) return "null";

  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("canonicalJson cannot encode a non-finite number");
    if (!Number.isSafeInteger(value)) {
      throw new TypeError(
        `canonicalJson refuses ${value} because it is not a safe integer; carry large integers as decimal strings`,
      );
    }
    return String(value);
  }

  if (typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);

  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;

  const entries = Object.entries(value)
    .filter((entry): entry is [string, JsonValue] => entry[1] !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, v]) => `${JSON.stringify(key)}:${canonicalJson(v)}`).join(",")}}`;
}

/** keccak256 of the canonical encoding, `0x`-prefixed. */
export function digestOf(value: JsonValue | AssetAttestation): string {
  const canonical = canonicalJson(value);
  const hash = keccak_256(new TextEncoder().encode(canonical));
  return `0x${bytesToHex(hash)}`;
}

/** Builds a complete envelope from a draft, stamping the schema and ledger. */
export function buildAttestation(draft: AttestationDraft): AssetAttestation {
  return {
    ...draft,
    schema: ATTESTATION_SCHEMA,
    ledger: LEDGER_HEDERA,
  };
}

/** keccak256 digest of the canonical envelope. This is what the registry stores. */
export function attestationDigest(attestation: AssetAttestation): string {
  return digestOf(attestation);
}

/** True when `value` is a 32-byte `0x`-prefixed hex string. */
export function isHex32(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[0-9a-f]{64}$/i.test(value);
}

/** True when `value` is a 20-byte `0x`-prefixed hex string. */
export function isHex20(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[0-9a-f]{40}$/i.test(value);
}

/** True when `value` looks like a Hedera entity id, `0.0.<digits>`. */
export function isEntityId(value: unknown): value is string {
  return typeof value === "string" && /^\d+\.\d+\.\d+$/.test(value.trim());
}

/**
 * Compares a recomputed digest with the digest recorded on-chain.
 * Case-insensitive, because EVM tooling renders `bytes32` in lower case while
 * HashScan shows mixed case.
 */
export function digestsMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
