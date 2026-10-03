/**
 * Turning a contract revert into something a human can act on.
 *
 * `checkAttestation` returns the raw 4-byte error selector the contract would revert
 * with. On its own that is meaningless to a user — `0x1c6d1b2a` explains nothing. The
 * selector is keccak256 of the canonical Solidity error signature, so it can be derived
 * from the ABI and mapped back to the kebab-case code the shared policy module already
 * uses for the same condition.
 *
 * The mapping is derived, never hard-coded. A hand-copied selector is a value that can
 * silently go stale when a contract error changes; deriving it from the ABI that
 * `test/abi.test.ts` guards against the compiled artifact means this cannot disagree
 * with the contract.
 */

import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { REJECTION_SOLIDITY_ERRORS } from "../constants/registry";
import { PRICED_ASSET_REGISTRY_ABI } from "../abi/generated";
import type { RegistryRejectionCode } from "../types/oracle";

type AbiError = {
  readonly type: "error";
  readonly name: string;
  readonly inputs?: readonly AbiParameter[];
};

/** One ABI parameter or return value, including nested struct components. */
type AbiParameter = {
  readonly type: string;
  readonly components?: readonly AbiParameter[];
};

/**
 * The canonical type of one parameter, with tuples expanded in Solidity's notation.
 *
 * `checkAttestation(bytes32, Observation)` does **not** have the selector of
 * `checkAttestation(bytes32,int64,int64,int32,uint32)`. Solidity writes a struct
 * parameter as a parenthesised component list, so the canonical signature is
 * `checkAttestation(bytes32,(int64,int64,int32,uint32))`. Flattening the components is
 * the natural mistake to make and it yields a plausible-looking 4-byte value that
 * dispatches to nothing, so tuples are expanded recursively here rather than joined.
 */
function canonicalType(parameter: AbiParameter): string {
  if (parameter.components === undefined || parameter.components.length === 0) return parameter.type;
  return `(${parameter.components.map(canonicalType).join(",")})`;
}

/** The canonical signature of an error or function, e.g. `PriceStale(uint64,uint64)`. */
export function errorSignature(item: { readonly name: string; readonly inputs?: readonly AbiParameter[] }): string {
  return `${item.name}(${(item.inputs ?? []).map(canonicalType).join(",")})`;
}

/** The 4-byte selector of a Solidity error or function. */
export function selectorOf(item: { readonly name: string; readonly inputs?: readonly AbiParameter[] }): string {
  const hash = keccak_256(new TextEncoder().encode(errorSignature(item)));
  return bytesToHex(hash).slice(0, 8);
}

/**
 * Every error the registry can revert with, keyed by `0x`-less selector.
 *
 * Derived from the ABI at module load, which is a handful of keccak hashes and keeps
 * this file impossible to desynchronise from the contract.
 */
export const REGISTRY_ERROR_SELECTORS: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    (PRICED_ASSET_REGISTRY_ABI as ReadonlyArray<AbiError>)
      .filter((entry): entry is AbiError => entry.type === "error")
      .map((entry) => [selectorOf(entry), entry.name]),
  ),
);

/**
 * Selector to kebab-case rejection code, for the six policy rejections.
 *
 * Built with an explicit accumulator so the result type is exhaustive: adding a
 * rejection code without its contract error is a type error here, and shipping an error
 * the ABI does not define throws at module load instead of failing quietly in the UI.
 */
export const REJECTION_SELECTORS: Readonly<Record<RegistryRejectionCode, string>> = (() => {
  const selectors = {} as Record<RegistryRejectionCode, string>;
  for (const code of Object.keys(REJECTION_SOLIDITY_ERRORS) as RegistryRejectionCode[]) {
    const errorName = REJECTION_SOLIDITY_ERRORS[code];
    const error = (PRICED_ASSET_REGISTRY_ABI as ReadonlyArray<AbiError>).find(
      (entry) => entry.type === "error" && entry.name === errorName,
    );
    if (!error) {
      throw new Error(
        `${errorName} is in REJECTION_SOLIDITY_ERRORS but is not in the registry ABI; the two must be updated together`,
      );
    }
    selectors[code] = selectorOf(error);
  }
  return Object.freeze(selectors);
})();

const CODE_BY_SELECTOR: ReadonlyMap<string, RegistryRejectionCode> = new Map(
  Object.entries(REJECTION_SELECTORS).map(([code, selector]) => [selector, code as RegistryRejectionCode]),
);

/**
 * Normalises revert data to a selector string.
 *
 * Accepts `0x`-prefixed hex or a `bytes4`, since the two arrive from different callers:
 * viem hands back hex, the contract's own `checkAttestation` hands back `bytes4`.
 */
export function normalizeSelector(value: string): string {
  const raw = value.trim().toLowerCase().replace(/^0x/, "");
  // Pad first, truncate second. Truncating first would turn a short value into a
  // *different* selector (`1b` -> `1b000000`), which is precisely the silent
  // misidentification this function exists to prevent. Over-long input is full revert
  // data, whose leading 4 bytes are the selector.
  return raw.padStart(8, "0").slice(0, 8);
}

/**
 * Explains a revert selector.
 *
 * Returns `null` for the zero selector, which is not a failure: the contract uses
 * `bytes4(0)` to mean "acceptable". Anything unrecognised comes back as `null` with the
 * raw selector preserved by the caller, rather than guessing which error it was.
 */
export function explainSelector(selector: string): RegistryRejectionCode | null {
  const normalized = normalizeSelector(selector);
  if (normalized === "00000000") return null;
  return CODE_BY_SELECTOR.get(normalized) ?? null;
}

/** The Solidity error name behind a selector, or `null` if the ABI does not define it. */
export function errorNameForSelector(selector: string): string | null {
  return REGISTRY_ERROR_SELECTORS[normalizeSelector(selector)] ?? null;
}
