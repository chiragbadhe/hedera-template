import { describe, it, expect } from "vitest";
import { getReownProjectId, DEFAULT_REOWN_PROJECT_ID, networks } from "./reown";

describe("Reown Configuration", () => {
  it("provides fallback project ID when environment variable is unset", () => {
    delete process.env.NEXT_PUBLIC_REOWN_PROJECT_ID;
    expect(getReownProjectId()).toBe(DEFAULT_REOWN_PROJECT_ID);
  });

  it("uses NEXT_PUBLIC_REOWN_PROJECT_ID when set", () => {
    process.env.NEXT_PUBLIC_REOWN_PROJECT_ID = "test-project-12345";
    expect(getReownProjectId()).toBe("test-project-12345");
    delete process.env.NEXT_PUBLIC_REOWN_PROJECT_ID;
  });

  it("includes Hedera testnet and mainnet in supported networks", () => {
    expect(networks).toHaveLength(2);
    expect(networks[0].id).toBe(296); // Hedera testnet chain id
    expect(networks[1].id).toBe(295); // Hedera mainnet chain id
  });
});
