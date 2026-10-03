/**
 * Hedera entity ids and their long-zero EVM rendering.
 *
 * A Hedera entity (`0.0.10840780`) and the address the EVM sees
 * (`0x0000000000000000000000000000000000d421`) are two views of the same thing. The
 * registry contract stores the address form because that is the only thing it can
 * store, so anything that has to relate an envelope back to a token needs both
 * renderings to agree exactly. Getting this wrong is silent: a wrong-but-well-formed
 * address is indistinguishable from a right one until a transaction reverts on the
 * zero-address check, or a digest no longer matches.
 *
 * The mapping is fixed by HIP-729: the address is 12 zero bytes followed by the
 * 32-bit big-endian value of `shard.realm.num`. For `0.0.5000001` that is
 * `0x004c4b41`, giving `0x00000000000000000000000000000000004c4b41` — the exact
 * pair pinned by the fixtures in `utils/attestation.test.ts`.
 */

export class EntityIdError extends Error {
  override readonly name = "EntityIdError";
}

/** A parsed Hedera entity id. Shard and realm are almost always 0. */
export type ParsedEntityId = {
  readonly shard: number;
  readonly realm: number;
  readonly num: number;
};

const ENTITY_ID_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;
const ADDRESS_PATTERN = /^0x([0-9a-fA-F]{40})$/;

/** Longest entity number the 32-bit long-zero encoding can carry. */
const MAX_ENTITY_NUM = 0xffff_ffff;

/** Parses `0.0.1234`, returning `null` for anything else rather than throwing. */
export function parseEntityId(value: unknown): ParsedEntityId | null {
  if (typeof value !== "string") return null;
  const match = ENTITY_ID_PATTERN.exec(value.trim());
  if (!match) return null;

  const shard = Number(match[1]);
  const realm = Number(match[2]);
  const num = Number(match[3]);
  if (!Number.isSafeInteger(shard) || !Number.isSafeInteger(realm) || !Number.isSafeInteger(num)) return null;
  if (shard > MAX_ENTITY_NUM || realm > MAX_ENTITY_NUM || num > MAX_ENTITY_NUM) return null;

  return { shard, realm, num };
}

/**
 * The long-zero EVM address for a `0.0.x` entity id.
 *
 * Returns `null` rather than throwing so a caller can fall back to a Mirror Node
 * lookup. The long-zero form only encodes shard 0 and realm 0, so an id outside
 * that pair has no long-zero rendering at all.
 */
export function entityIdToEvmAddress(entityId: string): `0x${string}` | null {
  const parsed = parseEntityId(entityId);
  if (parsed === null || parsed.shard !== 0 || parsed.realm !== 0) return null;

  const encoded = parsed.num.toString(16).padStart(8, "0");
  return `0x${"0".repeat(32)}${encoded}`;
}

/**
 * Recovers the `0.0.x` entity id from a long-zero address.
 *
 * The inverse of {@link entityIdToEvmAddress}. Returns `null` for any address with
 * a non-zero high word, which is how an aliased contract or token is distinguished
 * from a long-zero one: those have a real address and no derivable entity id.
 */
export function evmAddressToEntityId(address: string): string | null {
  const match = ADDRESS_PATTERN.exec(typeof address === "string" ? address.trim() : "");
  if (!match) return null;

  const body = match[1]!;
  if (!/^0{32}/.test(body)) return null;
  return `0.0.${parseInt(body.slice(32), 16)}`;
}

/**
 * Asserts a string is a `0.0.x` entity id, returning it trimmed.
 *
 * Throws {@link EntityIdError} rather than returning `null`, for call sites that
 * already know a missing id is fatal — a registry `contractId` with no configured
 * value, for instance.
 */
export function requireEntityId(value: string, field: string): string {
  if (parseEntityId(value) === null) {
    throw new EntityIdError(`${field} must be a Hedera entity id such as 0.0.1234, received "${value}".`);
  }
  return value.trim();
}