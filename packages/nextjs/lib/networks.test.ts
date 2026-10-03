import { describe, it, expect } from "vitest";
import { HEDERA_NETWORKS, getNetworkConfig, isNetworkSupported } from "./networks";

describe("Hedera Network Configuration", () => {
  it("provides configuration for all supported Hedera networks", () => {
    expect(HEDERA_NETWORKS.testnet.chainId).toBe(296);
    expect(HEDERA_NETWORKS.mainnet.chainId).toBe(295);
    expect(HEDERA_NETWORKS.previewnet.chainId).toBe(297);
    expect(HEDERA_NETWORKS.localnode.chainId).toBe(31337);
  });

  it("identifies testnet vs mainnet correctly", () => {
    expect(HEDERA_NETWORKS.testnet.isTestnet).toBe(true);
    expect(HEDERA_NETWORKS.mainnet.isTestnet).toBe(false);
  });

  it("returns testnet as default fallback", () => {
    // @ts-expect-error testing invalid network input
    const config = getNetworkConfig("unknown-net");
    expect(config.id).toBe("testnet");
  });

  it("validates chain ID support correctly", () => {
    expect(isNetworkSupported(296)).toBe(true);
    expect(isNetworkSupported(295)).toBe(true);
    expect(isNetworkSupported(99999)).toBe(false);
  });
});
