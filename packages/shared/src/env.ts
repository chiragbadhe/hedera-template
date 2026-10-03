/**
 * Server-side environment validation.
 *
 * Read once, validated once, and every consumer takes typed values rather than
 * `process.env.X`. Two failure modes this exists to prevent:
 *
 * - a **missing** operator key producing a confusing signature error deep inside
 *   the SDK, and
 * - a **mis-set** network silently broadcasting to mainnet.
 *
 * `HEDERA_NETWORK` is only accepted when it names a network explicitly; an
 * unrecognised value falls back to `testnet` and reports the problem rather than
 * proceeding silently against a network nobody intended.
 */

import {
  DEFAULT_MAX_DEVIATION_BPS,
  DEFAULT_MAX_PRICE_AGE_SECONDS,
  MAX_ALLOWED_DEVIATION_BPS,
  MAX_ALLOWED_MAX_PRICE_AGE_SECONDS,
} from "./constants/oracle";
import { BROWSER_SAFE_ENV_KEYS, ENV_ALIASES, ENV_KEYS, SERVER_ONLY_ENV_KEYS } from "./constants/registry";
import { isHederaNetwork, type HederaNetwork } from "./constants/networks";

export type EnvironmentSource = Readonly<Record<string, string | undefined>>;

export class EnvironmentError extends Error {
  override readonly name = "EnvironmentError";
}

export type EnvProblem = {
  readonly key: string;
  readonly message: string;
};

export type ResolvedEnvironment = {
  readonly network: HederaNetwork;
  readonly operatorAccountId?: string;
  /** Present only when parsed. Never returned when `exposeSecrets` is false. */
  readonly operatorPrivateKey?: string;
  readonly jsonRpcUrl?: string;
  readonly mirrorNodeUrl?: string;
  readonly attestationTopicId?: string;
  readonly registryAddress?: string;
  readonly registryContractId?: string;
  /** Set only when the operator overrides the Pyth deployment. */
  readonly oracleAddress?: string;
  readonly feedId?: string;
  readonly maxPriceAgeSeconds: number;
  readonly maxDeviationBps: number;
  /** Non-fatal problems worth surfacing (fallbacks applied, blanks ignored). */
  readonly warnings: readonly EnvProblem[];
};

function readString(source: EnvironmentSource, key: string): string | undefined {
  const raw = source[key];
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

/**
 * Reads a variable by its canonical name, falling back to its accepted aliases.
 *
 * When several names are set to different values that is reported as a warning
 * rather than silently resolved: two disagreeing keys mean the process is being
 * configured from two places at once.
 */
function readAliased(
  source: EnvironmentSource,
  key: keyof typeof ENV_KEYS,
  warnings: EnvProblem[],
): string | undefined {
  const direct = readString(source, ENV_KEYS[key]);
  const found = ENV_ALIASES[key]
    .map((alias) => ({ alias, value: readString(source, alias) }))
    .filter((entry): entry is { alias: string; value: string } => entry.value !== undefined);

  if (direct !== undefined && found.length > 0 && found.some((entry) => entry.value !== direct)) {
    warnings.push({
      key: ENV_KEYS[key],
      message: `${ENV_KEYS[key]} and ${found.map((entry) => entry.alias).join(", ")} are set to different values; using ${ENV_KEYS[key]}.`,
    });
  }

  if (direct !== undefined) return direct;
  const alias = found[0];
  if (alias !== undefined) {
    warnings.push({ key: ENV_KEYS[key], message: `Using alias ${alias.alias} for ${ENV_KEYS[key]}.` });
    return alias.value;
  }
  return undefined;
}

/**
 * Validates that a private key is a raw secp256k1 signing key.
 *
 * The official templates' `account:import` stores a **DER-encoded transaction key**,
 * which looks similar but is not usable as an EVM-style ECDSA key. Detecting that
 * here turns a confusing signature error deep inside the SDK into one sentence.
 */
export function assertUsablePrivateKey(key: string, keyName = ENV_KEYS.operatorPrivateKey): string {
  const trimmed = key.trim();
  if (/^0x[0-9a-fA-F]{64}$/.test(trimmed)) return trimmed;

  // DER is checked before plain hex, because a DER key is also valid hex text.
  if (/^30(2e|44|81|82)/i.test(trimmed)) {
    throw new EnvironmentError(
      `${keyName} looks like a DER-encoded transaction key, the format written by \`account:import\` in the official templates. ` +
        `This template signs with a raw secp256k1 key, so create one with \`yarn hardhat account:generate\` and put that in your .env.`,
    );
  }

  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    throw new EnvironmentError(
      `${keyName} is hex but has no 0x prefix. Prefix it with 0x, or create a key with \`yarn hardhat account:generate\`.`,
    );
  }

  throw new EnvironmentError(
    `${keyName} must be a 32-byte hex private key such as 0xac09…ff80. Run \`yarn hardhat account:generate\` to create one.`,
  );
}

/** Validates that a value looks like a `0x`-prefixed EVM address. */
export function assertEvmAddressFormat(value: string, keyName: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value.trim())) {
    throw new EnvironmentError(`${keyName} must be a 0x-prefixed 20-byte EVM address, received "${value}".`);
  }
  return value.trim();
}

/** Validates that an account id looks like `0.0.x`. */
export function assertEntityIdFormat(value: string, keyName: string): string {
  if (!/^\d+\.\d+\.\d+$/.test(value.trim())) {
    throw new EnvironmentError(`${keyName} must be a Hedera account id such as 0.0.12345, received "${value}".`);
  }
  return value.trim();
}

function readInteger(
  source: EnvironmentSource,
  key: string,
  fallback: number,
  min: number,
  max: number,
  warnings: EnvProblem[],
): number {
  const raw = readString(source, key);
  if (raw === undefined) return fallback;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    warnings.push({ key, message: `${key} must be a whole number; using ${fallback}.` });
    return fallback;
  }
  if (parsed < min || parsed > max) {
    warnings.push({ key, message: `${key} must be between ${min} and ${max}; using ${fallback}.` });
    return fallback;
  }
  return parsed;
}

/**
 * Validates and resolves the environment.
 *
 * @param requireOperator when true (deploy scripts, write endpoints) a missing
 *   operator account id or key throws instead of warning. When false (read-only
 *   endpoints, the UI) they are simply absent.
 */
export function resolveEnvironment(
  source: EnvironmentSource = process.env,
  options: { readonly requireOperator?: boolean; readonly requireRegistry?: boolean } = {},
): ResolvedEnvironment {
  const warnings: EnvProblem[] = [];

  const rawNetwork = readString(source, ENV_KEYS.network);
  const network =
    rawNetwork !== undefined && isHederaNetwork(rawNetwork.toLowerCase())
      ? (rawNetwork.toLowerCase() as HederaNetwork)
      : "testnet";
  if (rawNetwork !== undefined && !isHederaNetwork(rawNetwork.toLowerCase())) {
    warnings.push({
      key: ENV_KEYS.network,
      message: `${ENV_KEYS.network}=${rawNetwork} is not a known network; falling back to testnet.`,
    });
  }

  const operatorAccountId = readAliased(source, "operatorAccountId", warnings);
  const operatorPrivateKey = readAliased(source, "operatorPrivateKey", warnings);
  const jsonRpcUrl = readAliased(source, "jsonRpcUrl", warnings);
  const registryAddress = readString(source, ENV_KEYS.registryAddress);
  const registryContractId = readString(source, ENV_KEYS.registryContractId);

  const rawOracleAddress = readString(source, ENV_KEYS.oracleAddress);
  const oracleAddress =
    rawOracleAddress === undefined ? undefined : assertEvmAddressFormat(rawOracleAddress, ENV_KEYS.oracleAddress);

  if (options.requireOperator) {
    const missing: string[] = [];
    if (operatorAccountId === undefined) missing.push(ENV_KEYS.operatorAccountId);
    if (operatorPrivateKey === undefined) missing.push(ENV_KEYS.operatorPrivateKey);
    if (missing.length > 0) {
      throw new EnvironmentError(
        `Missing required environment variable(s): ${missing.join(", ")}. ` +
          `Copy .env.example to .env.local and fill in the values, then try again.`,
      );
    }

    // Only worth validating when something is about to sign with it.
    assertEntityIdFormat(operatorAccountId!, ENV_KEYS.operatorAccountId);
    assertUsablePrivateKey(operatorPrivateKey!);
  } else {
    if (operatorAccountId === undefined || operatorPrivateKey === undefined) {
      warnings.push({
        key: ENV_KEYS.operatorAccountId,
        message: "Operator credentials are not set; operator-signed actions are disabled in this process.",
      });
    }
  }

  if (options.requireRegistry && registryAddress === undefined) {
    throw new EnvironmentError(
      `Missing ${ENV_KEYS.registryAddress}. Deploy the registry first (see the README) or point it at a deployed contract.`,
    );
  }

  return {
    network,
    operatorAccountId,
    operatorPrivateKey,
    jsonRpcUrl,
    mirrorNodeUrl: readString(source, ENV_KEYS.mirrorNodeUrl),
    attestationTopicId: readString(source, ENV_KEYS.attestationTopicId),
    registryAddress,
    registryContractId,
    oracleAddress,
    feedId: readString(source, ENV_KEYS.feedId),
    maxPriceAgeSeconds: readInteger(
      source,
      ENV_KEYS.maxPriceAgeSeconds,
      DEFAULT_MAX_PRICE_AGE_SECONDS,
      0,
      MAX_ALLOWED_MAX_PRICE_AGE_SECONDS,
      warnings,
    ),
    maxDeviationBps: readInteger(
      source,
      ENV_KEYS.maxDeviationBps,
      DEFAULT_MAX_DEVIATION_BPS,
      0,
      MAX_ALLOWED_DEVIATION_BPS,
      warnings,
    ),
    warnings,
  };
}

/**
 * Reduces an environment to the keys that are safe in a browser.
 *
 * The result is keyed by the *canonical* name even when the value came from an alias,
 * so the client reads one name regardless of which one the operator set.
 *
 * `SERVER_ONLY_ENV_KEYS` is filtered as well. That is redundant given the allowlist,
 * and it is kept deliberately: it means a key added to both lists fails loudly here
 * rather than shipping, and the two lists can never disagree about what is secret.
 */
export function toBrowserEnvironment(source: EnvironmentSource): Record<string, string> {
  const safe = new Set(BROWSER_SAFE_ENV_KEYS);
  const forbidden = new Set(SERVER_ONLY_ENV_KEYS);
  const out: Record<string, string> = {};

  for (const [canonical, aliases] of Object.entries(ENV_ALIASES) as Array<
    [keyof typeof ENV_KEYS, readonly string[]]
  >) {
    if (!safe.has(ENV_KEYS[canonical])) continue;
    const value = [ENV_KEYS[canonical], ...aliases]
      .map((key) => readString(source, key))
      .find((candidate): candidate is string => candidate !== undefined);
    if (value !== undefined) out[ENV_KEYS[canonical]] = value;
  }

  // Anything not named by an alias, such as the policy bounds, is copied straight across.
  const handled = new Set<string>();
  for (const [canonical, aliases] of Object.entries(ENV_ALIASES) as Array<
    [keyof typeof ENV_KEYS, readonly string[]]
  >) {
    handled.add(ENV_KEYS[canonical]);
    for (const alias of aliases) handled.add(alias);
  }

  for (const key of BROWSER_SAFE_ENV_KEYS) {
    if (handled.has(key)) continue;
    const value = readString(source, key);
    if (value !== undefined) out[key] = value;
  }

  for (const key of Object.keys(out)) {
    if (forbidden.has(key)) delete out[key];
  }

  return out;
}
