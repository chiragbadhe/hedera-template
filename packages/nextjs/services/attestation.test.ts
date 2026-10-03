import { describe, expect, it, vi, beforeEach } from "vitest";
import { verifyAttestation } from "./attestation";
import * as mirrorService from "./mirror";
import * as chainsService from "./chains";
import { buildAttestation, attestationDigest, type AttestationDraft } from "@sh/shared";

// Mock server-only so Vitest in node environment doesn't fail on next.js server-only import
vi.mock("server-only", () => ({}));

vi.mock("./env", () => ({
  serverEnvironment: () => ({
    network: "testnet",
    registryAddress: "0x2f2efce259e11f95c76273c882a18baf166fc056",
    attestationTopicId: "0.0.10839958",
  }),
  operatorEnvironment: () => ({
    network: "testnet",
    operatorAccountId: "0.0.10828689",
    operatorPrivateKey: "0xdbce0b019950166fa42d07a50be112387a263c3259f972f5974fb6ea44dc92ed",
    registryAddress: "0x2f2efce259e11f95c76273c882a18baf166fc056",
    attestationTopicId: "0.0.10839958",
  }),
}));

const sampleDraft: AttestationDraft = {
  network: "testnet",
  asset: {
    tokenId: "0.0.5000001",
    tokenAddress: "0x00000000000000000000000000000000004c4b41",
    name: "Registered HBAR",
    symbol: "RHBAR",
    decimals: 6,
  },
  issuance: { units: "1000000000", txId: "0.0.5000002@1787525955.000000000" },
  pricing: {
    oracle: "pyth",
    oracleAddress: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729",
    feedId: "0x3728e591097635310e6341af53db8b7ee42da9b3a8d918f9463ce9cca886dfbd",
    feedSymbol: "Crypto.HBAR/USD",
    priceMantissa: "8055012",
    confidenceMantissa: "5531",
    exponent: -8,
    publishTime: 1787525955,
    validTimePeriodSeconds: 60,
    priceUsd: "0.080550120000000000",
  },
  registry: {
    contractAddress: "0x2f2efce259e11f95c76273c882a18baf166fc056",
    contractId: "0.0.5000003",
    maxDeviationBps: 50,
    observedDeviationBps: 0,
    observedPriceAgeSeconds: 10, // Payload has price age = 10s
  },
};

describe("verifyAttestation", () => {
  const attestationPayload = buildAttestation(sampleDraft);
  const targetDigest = attestationDigest(attestationPayload);

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("passes verification even when contract priceAgeSeconds differs by 5 seconds (Price age check removed)", async () => {
    // Mock publicClient for readRecord
    const mockReadContract = vi.fn().mockResolvedValue({
      attestationHash: targetDigest,
      feedId: attestationPayload.pricing.feedId,
      assetToken: attestationPayload.asset.tokenAddress,
      registrant: "0x0000000000000000000000000000000000000001",
      units: BigInt(attestationPayload.issuance.units),
      observed: {
        price: BigInt(attestationPayload.pricing.priceMantissa),
        conf: BigInt(attestationPayload.pricing.confidenceMantissa),
        expo: attestationPayload.pricing.exponent,
        publishTime: BigInt(attestationPayload.pricing.publishTime),
      },
      deviationBps: BigInt(attestationPayload.registry.observedDeviationBps),
      priceAgeSeconds: BigInt(15), // Contract record priceAge = 15s (5 seconds difference from payload's 10s)
      recordedAt: BigInt(1787526000),
    });

    vi.spyOn(chainsService, "publicClient").mockReturnValue({
      readContract: mockReadContract,
    } as unknown as ReturnType<typeof chainsService.publicClient>);

    // Mock readTopicMessages
    vi.spyOn(mirrorService, "readTopicMessages").mockResolvedValue({
      ok: true,
      value: [
        {
          topicId: "0.0.10839958",
          sequenceNumber: 1,
          consensusTimestamp: "1787525960.000000000",
          runningHash: "0x1234",
          runningHashVersion: 3,
          payload: attestationPayload,
          transactionId: "0.0.5000002@1787525955.000000000",
          hashscanUrl: "https://hashscan.io/testnet/topic/0.0.10839958/message/1",
        },
      ],
    });

    // Mock readToken
    vi.spyOn(mirrorService, "readToken").mockResolvedValue({
      ok: true,
      value: {
        tokenId: attestationPayload.asset.tokenId,
        name: attestationPayload.asset.name,
        symbol: attestationPayload.asset.symbol,
        decimals: attestationPayload.asset.decimals,
        totalSupply: "1000000000",
        treasuryAccountId: "0.0.5000002",
        evmAddress: attestationPayload.asset.tokenAddress,
      },
    });

    const result = await verifyAttestation(targetDigest);

    // Outcome MUST be verified
    expect(result.status).toBe("verified");

    // "Price age agrees" MUST NOT be present in checks list
    const priceAgeCheck = result.checks.find((c) => c.label === "Price age agrees");
    expect(priceAgeCheck).toBeUndefined();

    // Verify key checks passed
    const passedCheckLabels = result.checks.filter((c) => c.status === "pass").map((c) => c.label);
    expect(passedCheckLabels).toContain("Recorded on chain");
    expect(passedCheckLabels).toContain("Digest recomputed from the HCS payload");
    expect(passedCheckLabels).toContain("Feed id agrees");
    expect(passedCheckLabels).toContain("Oracle observation agrees");
    expect(passedCheckLabels).toContain("Units agree");
    expect(passedCheckLabels).toContain("Deviation agrees");
    expect(passedCheckLabels).toContain("Asset exists on HTS");
  });

  it("fails verification and returns mismatch status when a genuine mismatch occurs (e.g. units mismatch)", async () => {
    // Mock publicClient for readRecord with conflicting units
    const mockReadContract = vi.fn().mockResolvedValue({
      attestationHash: targetDigest,
      feedId: attestationPayload.pricing.feedId,
      assetToken: attestationPayload.asset.tokenAddress,
      registrant: "0x0000000000000000000000000000000000000001",
      units: BigInt("9999999999"), // Disagrees with payload units "1000000000"
      observed: {
        price: BigInt(attestationPayload.pricing.priceMantissa),
        conf: BigInt(attestationPayload.pricing.confidenceMantissa),
        expo: attestationPayload.pricing.exponent,
        publishTime: BigInt(attestationPayload.pricing.publishTime),
      },
      deviationBps: BigInt(attestationPayload.registry.observedDeviationBps),
      priceAgeSeconds: BigInt(10),
      recordedAt: BigInt(1787526000),
    });

    vi.spyOn(chainsService, "publicClient").mockReturnValue({
      readContract: mockReadContract,
    } as unknown as ReturnType<typeof chainsService.publicClient>);

    vi.spyOn(mirrorService, "readTopicMessages").mockResolvedValue({
      ok: true,
      value: [
        {
          topicId: "0.0.10839958",
          sequenceNumber: 1,
          consensusTimestamp: "1787525960.000000000",
          runningHash: "0x1234",
          runningHashVersion: 3,
          payload: attestationPayload,
          transactionId: "0.0.5000002@1787525955.000000000",
          hashscanUrl: "https://hashscan.io/testnet/topic/0.0.10839958/message/1",
        },
      ],
    });

    vi.spyOn(mirrorService, "readToken").mockResolvedValue({
      ok: true,
      value: {
        tokenId: attestationPayload.asset.tokenId,
        name: attestationPayload.asset.name,
        symbol: attestationPayload.asset.symbol,
        decimals: attestationPayload.asset.decimals,
        totalSupply: "1000000000",
        treasuryAccountId: "0.0.5000002",
        evmAddress: attestationPayload.asset.tokenAddress,
      },
    });

    const result = await verifyAttestation(targetDigest);

    // Outcome MUST be mismatch
    expect(result.status).toBe("mismatch");

    // Specific failed check MUST be Units agree
    const unitsCheck = result.checks.find((c) => c.label === "Units agree");
    expect(unitsCheck).toBeDefined();
    expect(unitsCheck?.status).toBe("fail");
  });
});
