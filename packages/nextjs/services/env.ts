/**
 * Server-only environment access.
 *
 * Everything in `services/` runs on the server. The split matters for a template
 * that holds an operator key: `toBrowserEnvironment` is the only thing allowed to
 * cross into the client bundle, and it is called once, in `app/api/config`, so
 * there is exactly one place where the server/client boundary is crossed and it can
 * be audited in one place.
 *
 * Importing this module from a client component is a build error by construction:
 * `server-only` fails the build rather than silently shipping a private key.
 */

import "server-only";

import {
  resolveEnvironment,
  toBrowserEnvironment,
  type HederaNetwork,
  type ResolvedEnvironment,
} from "@sh/shared";

let cached: ResolvedEnvironment | undefined;

/**
 * The resolved server environment.
 *
 * Cached because `resolveEnvironment` validates every key and throws on a malformed
 * one; doing that per request would turn a misconfigured deployment into a
 * different error message on every call site.
 */
export function serverEnvironment(): ResolvedEnvironment {
  cached ??= resolveEnvironment(process.env);
  return cached;
}

/**
 * The environment, requiring operator credentials.
 *
 * Used only by the endpoint that signs: the attestation publisher and any
 * operator-signed registry call. Read paths call `serverEnvironment` instead so a
 * deployment with no operator key still serves the dashboard.
 */
export function operatorEnvironment(): ResolvedEnvironment {
  return resolveEnvironment(process.env, { requireOperator: true });
}

/**
 * The subset of configuration that is safe to send to the browser.
 *
 * Built from `process.env` rather than the resolved environment: the resolver's job is
 * to produce typed numbers and entity ids, and a client bundle wants the strings that
 * were actually set. The allowlist inside `toBrowserEnvironment` is what keeps the
 * operator key on the server either way.
 */
export function publicEnvironment(): Record<string, string> {
  return toBrowserEnvironment(process.env);
}

/**
 * Whether this process can sign anything.
 *
 * Surfaced in the UI so an operator sees "read-only" instead of a form that fails
 * on submit. Checked rather than assumed, because the answer depends on env vars
 * that are routinely absent in a fresh clone.
 */
export function operatorIsConfigured(): boolean {
  const environment = serverEnvironment();
  return environment.operatorAccountId !== undefined && environment.operatorPrivateKey !== undefined;
}

/** True when the app is pointed at a chain with no public explorer or faucet. */
export function isDevelopmentChain(network: HederaNetwork): boolean {
  return network === "localnode";
}
