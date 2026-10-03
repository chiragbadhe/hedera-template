import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_DEVIATION_BPS,
  DEFAULT_MAX_PRICE_AGE_SECONDS,
  MAX_ALLOWED_DEVIATION_BPS,
} from "./constants/oracle";
import { BROWSER_SAFE_ENV_KEYS, ENV_KEYS, SERVER_ONLY_ENV_KEYS } from "./constants/registry";
import { EnvironmentError, resolveEnvironment, toBrowserEnvironment } from "./env";

const OPERATOR = {
  [ENV_KEYS.operatorAccountId]: "0.0.12345",
  [ENV_KEYS.operatorPrivateKey]: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
};

describe("resolveEnvironment", () => {
  it("defaults to testnet, the only network that should ever be implicit", () => {
    const env = resolveEnvironment({});
    expect(env.network).toBe("testnet");
  });

  it("accepts mainnet only when named explicitly", () => {
    expect(resolveEnvironment({ [ENV_KEYS.network]: "mainnet" }).network).toBe("mainnet");
  });

  it("is case and whitespace insensitive", () => {
    expect(resolveEnvironment({ [ENV_KEYS.network]: "  TESTNET " }).network).toBe("testnet");
  });

  it("falls back to testnet and warns on an unknown network, instead of guessing", () => {
    const env = resolveEnvironment({ [ENV_KEYS.network]: "devnet" });
    expect(env.network).toBe("testnet");
    expect(env.warnings.some((warning) => warning.key === ENV_KEYS.network)).toBe(true);
  });

  it("ships the documented default policy when no override is set", () => {
    const env = resolveEnvironment({});
    expect(env.maxPriceAgeSeconds).toBe(DEFAULT_MAX_PRICE_AGE_SECONDS);
    expect(env.maxDeviationBps).toBe(DEFAULT_MAX_DEVIATION_BPS);
  });

  it("honours policy overrides without complaining about them", () => {
    const env = resolveEnvironment({
      ...OPERATOR,
      [ENV_KEYS.maxPriceAgeSeconds]: "3600",
      [ENV_KEYS.maxDeviationBps]: "25",
    });
    expect(env.maxPriceAgeSeconds).toBe(3600);
    expect(env.maxDeviationBps).toBe(25);
    expect(env.warnings).toHaveLength(0);
  });

  it("rejects a policy value outside the contract's own bounds", () => {
    const env = resolveEnvironment({ [ENV_KEYS.maxDeviationBps]: String(MAX_ALLOWED_DEVIATION_BPS + 1) });
    expect(env.maxDeviationBps).toBe(DEFAULT_MAX_DEVIATION_BPS);
    expect(env.warnings.some((warning) => warning.key === ENV_KEYS.maxDeviationBps)).toBe(true);
  });

  it("rejects a non-numeric policy value", () => {
    const env = resolveEnvironment({ [ENV_KEYS.maxPriceAgeSeconds]: "forever" });
    expect(env.maxPriceAgeSeconds).toBe(DEFAULT_MAX_PRICE_AGE_SECONDS);
    expect(env.warnings.some((warning) => warning.key === ENV_KEYS.maxPriceAgeSeconds)).toBe(true);
  });

  it("reads operator credentials and endpoints", () => {
    const env = resolveEnvironment({
      ...OPERATOR,
      [ENV_KEYS.jsonRpcUrl]: "https://example.test/api",
      [ENV_KEYS.mirrorNodeUrl]: "https://mirror.test",
      [ENV_KEYS.attestationTopicId]: "0.0.10828689",
      [ENV_KEYS.registryAddress]: "0xabc",
      [ENV_KEYS.registryContractId]: "0.0.5000003",
      [ENV_KEYS.feedId]: `0x${"11".repeat(32)}`,
    });

    expect(env.operatorAccountId).toBe("0.0.12345");
    expect(env.operatorPrivateKey).toBe(OPERATOR[ENV_KEYS.operatorPrivateKey]);
    expect(env.jsonRpcUrl).toBe("https://example.test/api");
    expect(env.attestationTopicId).toBe("0.0.10828689");
    expect(env.registryAddress).toBe("0xabc");
  });

  it("treats a blank value as absent, which is how an empty .env entry behaves", () => {
    const env = resolveEnvironment({ [ENV_KEYS.operatorAccountId]: "   ", [ENV_KEYS.jsonRpcUrl]: "" });
    expect(env.operatorAccountId).toBeUndefined();
    expect(env.jsonRpcUrl).toBeUndefined();
  });

  it("warns, but does not throw, when operator credentials are missing", () => {
    const env = resolveEnvironment({});
    expect(env.operatorAccountId).toBeUndefined();
    expect(env.warnings.some((warning) => /Operator credentials/.test(warning.message))).toBe(true);
  });

  it("throws a copy-pasteable message when an operator action is required", () => {
    expect(() => resolveEnvironment({}, { requireOperator: true })).toThrow(EnvironmentError);
    expect(() => resolveEnvironment({}, { requireOperator: true })).toThrow(
      new RegExp(`${ENV_KEYS.operatorAccountId}.*${ENV_KEYS.operatorPrivateKey}`),
    );
    expect(() => resolveEnvironment({}, { requireOperator: true })).toThrow(/\.env\.example/);
  });

  it("accepts credentials that are present, however partially, and still reports the gap", () => {
    expect(() => resolveEnvironment({ [ENV_KEYS.operatorAccountId]: "0.0.1" }, { requireOperator: true })).toThrow(
      ENV_KEYS.operatorPrivateKey,
    );
    expect(resolveEnvironment(OPERATOR, { requireOperator: true }).operatorAccountId).toBe("0.0.12345");
  });

  it("requires a registry address only when asked", () => {
    expect(() => resolveEnvironment({}, { requireRegistry: true })).toThrow(ENV_KEYS.registryAddress);
    expect(resolveEnvironment({ [ENV_KEYS.registryAddress]: "0xabc" }, { requireRegistry: true }).registryAddress).toBe(
      "0xabc",
    );
  });
});

describe("toBrowserEnvironment", () => {
  it("strips the operator credentials and anything secret-shaped", () => {
    const exposed = toBrowserEnvironment({
      ...OPERATOR,
      [ENV_KEYS.network]: "testnet",
      [ENV_KEYS.registryAddress]: "0xabc",
      SOME_SECRET: "hunter2",
    });

    expect(exposed).not.toHaveProperty(ENV_KEYS.operatorAccountId);
    expect(exposed).not.toHaveProperty(ENV_KEYS.operatorPrivateKey);
    expect(exposed).not.toHaveProperty("SOME_SECRET");
    expect(exposed).toHaveProperty(ENV_KEYS.network, "testnet");
    expect(exposed).toHaveProperty(ENV_KEYS.registryAddress, "0xabc");
  });

  it("drops empty values so they do not become empty-string client config", () => {
    expect(toBrowserEnvironment({ [ENV_KEYS.network]: "", [ENV_KEYS.registryAddress]: " " })).toEqual({});
  });

  it("drops every variable it does not recognise, not just the ones that look secret", () => {
    // An allowlist, because a denylist cannot enumerate every name a secret might
    // arrive under. `DATABASE_URL` is not a Hedera key and must not ride along.
    expect(
      toBrowserEnvironment({
        DATABASE_URL: "postgres://user:password@host/db",
        AWS_REGION: "eu-west-1",
        NPM_CONFIG_PREFIX: "",
        [ENV_KEYS.network]: "testnet",
      }),
    ).toEqual({ [ENV_KEYS.network]: "testnet" });
  });

  it("resolves an aliased variable to its canonical name for the client", () => {
    const exposed = toBrowserEnvironment({ HEDERA_RPC_URL: "https://relay.example/api" });
    expect(exposed[ENV_KEYS.jsonRpcUrl]).toBe("https://relay.example/api");
    expect(exposed).not.toHaveProperty("HEDERA_RPC_URL");
  });

  it("keeps the two lists consistent: nothing is both allowed and server-only", () => {
    for (const key of BROWSER_SAFE_ENV_KEYS) {
      expect(SERVER_ONLY_ENV_KEYS, `${key} must not be browser-safe and server-only`).not.toContain(key);
    }
  });
});

describe("operator key aliases and format", () => {
  const KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

  it("accepts the scaffold-hbar variable names", () => {
    const env = resolveEnvironment({ ACCOUNT_ID: "0.0.9999", PRIVATE_KEY: KEY }, { requireOperator: true });
    expect(env.operatorAccountId).toBe("0.0.9999");
    expect(env.operatorPrivateKey).toBe(KEY);
    expect(env.warnings.some((warning) => /alias/.test(warning.message))).toBe(true);
  });

  it("accepts the runtime deployer key used by the official hardhat templates", () => {
    const env = resolveEnvironment(
      { __RUNTIME_DEPLOYER_PRIVATE_KEY: KEY, ACCOUNT_ID: "0.0.1" },
      { requireOperator: true },
    );
    expect(env.operatorPrivateKey).toBe(KEY);
  });

  it("accepts HEDERA_RPC_URL as an alias for the JSON-RPC relay", () => {
    expect(resolveEnvironment({ HEDERA_RPC_URL: "https://example.test/api" }).jsonRpcUrl).toBe(
      "https://example.test/api",
    );
  });

  it("prefers the canonical name and reports the disagreement", () => {
    const env = resolveEnvironment({ ACCOUNT_ID: "0.0.1", [ENV_KEYS.operatorAccountId]: "0.0.2" });
    expect(env.operatorAccountId).toBe("0.0.2");
    expect(env.warnings.some((warning) => /different values/.test(warning.message))).toBe(true);
  });

  it("names the DER-encoded key trap explicitly", () => {
    // What `account:import` in the official templates writes to .env.
    const der = "302e020100300506032b657004220420db484b828e64b2d8f12ce3c0a0e93a0b8cce7af1bb8f39c983233ec2d7963729c";
    expect(() => resolveEnvironment({ ACCOUNT_ID: "0.0.1", PRIVATE_KEY: der }, { requireOperator: true })).toThrow(
      /DER-encoded transaction key/,
    );
  });

  it("explains a missing 0x prefix", () => {
    expect(() =>
      resolveEnvironment({ ACCOUNT_ID: "0.0.1", PRIVATE_KEY: KEY.slice(2) }, { requireOperator: true }),
    ).toThrow(/no 0x prefix/);
  });

  it("rejects a malformed account id before anything tries to sign", () => {
    expect(() => resolveEnvironment({ ACCOUNT_ID: "12345", PRIVATE_KEY: KEY }, { requireOperator: true })).toThrow(
      /0\.0\.12345/,
    );
  });
});

describe("PYTH_ORACLE_ADDRESS", () => {
  it("is unset by default, so the recorded Pyth deployment is used", () => {
    expect(resolveEnvironment({}).oracleAddress).toBeUndefined();
  });

  it("is validated rather than passed through to a deploy", () => {
    expect(resolveEnvironment({ [ENV_KEYS.oracleAddress]: "0x" + "ab".repeat(20) }).oracleAddress).toBe(
      "0x" + "ab".repeat(20),
    );
    expect(() => resolveEnvironment({ [ENV_KEYS.oracleAddress]: "0xnothex" })).toThrow(/20-byte EVM address/);
    expect(() => resolveEnvironment({ [ENV_KEYS.oracleAddress]: "1234" })).toThrow(/20-byte EVM address/);
  });
});
