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

import fs from "fs";
import path from "path";
import { resolveEnvironment, toBrowserEnvironment, type HederaNetwork, type ResolvedEnvironment } from "@sh/shared";

function ensureEnvLoaded() {
  const rootDir = path.resolve(process.cwd(), "../../");
  const pkgDir = process.cwd();
  const candidates = [
    path.join(pkgDir, ".env.local"),
    path.join(pkgDir, ".env"),
    path.join(rootDir, ".env.local"),
    path.join(rootDir, ".env"),
  ];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    try {
      const content = fs.readFileSync(candidate, "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIndex = trimmed.indexOf("=");
        if (eqIndex === -1) continue;
        const key = trimmed.slice(0, eqIndex).trim();
        let value = trimmed.slice(eqIndex + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (key && (process.env[key] === undefined || process.env[key] === "")) {
          process.env[key] = value;
        }
      }
    } catch {
      // Ignore read failures
    }
  }
}

/**
 * The resolved server environment.
 */
export function serverEnvironment(): ResolvedEnvironment {
  ensureEnvLoaded();
  return resolveEnvironment(process.env);
}

/**
 * The environment, requiring operator credentials.
 */
export function operatorEnvironment(): ResolvedEnvironment {
  ensureEnvLoaded();
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
