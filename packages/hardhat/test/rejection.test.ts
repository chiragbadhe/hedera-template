import { expect } from "chai";
import { Interface } from "ethers";
import { ethers } from "hardhat";
import {
  DEFAULT_MAX_DEVIATION_BPS,
  DEFAULT_MAX_PRICE_AGE_SECONDS,
  HBAR_USD_FEED_ID,
  HBAR_USD_REFERENCE_OBSERVATION,
  PRICED_ASSET_REGISTRY_ABI,
  REJECTION_SELECTORS,
  REGISTRY_ERROR_SELECTORS,
  errorNameForSelector,
  errorSignature,
  explainSelector,
  selectorOf,
} from "@sh/shared";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import type { MockPythOracle, PricedAssetRegistry } from "../typechain-types";

/**
 * The shared package derives its revert-selector map from the generated ABI, so this is
 * where that derivation gets checked against authorities that do not share its code:
 *
 * 1. **ethers**, which implements Solidity's selector convention independently. The
 *    realistic failure mode of the hand-written derivation is not keccak — it is
 *    building the signature string wrongly (spaces, argument names, wrong types), and
 *    that is exactly what ethers disagrees with when it is wrong.
 * 2. **the EVM itself**, by triggering a real revert and reading the selector back out
 *    of the return data. A selector that survives a real revert is not a theory.
 *
 * If these ever disagree, the UI would explain a contract revert with the wrong error
 * name, which is worse than showing the raw selector.
 */
type ObservationArg = {
  price: bigint;
  conf: bigint;
  expo: number;
  publishTime: number;
};

describe("derived revert selectors", () => {
  const abiInterface = new Interface(PRICED_ASSET_REGISTRY_ABI);

  it("agrees with ethers on the selector of every function and error", () => {
    const callable = PRICED_ASSET_REGISTRY_ABI.filter((entry) => entry.type === "function" || entry.type === "error");
    expect(callable.length).to.be.greaterThan(40);

    for (const entry of callable) {
      const derived = `0x${selectorOf(entry)}`;
      const fromEthers =
        entry.type === "function"
          ? abiInterface.getFunction(entry.name)?.selector
          : abiInterface.getError(entry.name)?.selector;

      expect(fromEthers, `${entry.name} is not a real ${entry.type} of this contract`).to.be.a("string");
      expect(derived, `${entry.name} selector`).to.equal(fromEthers);
    }
  });

  it("builds the signature the way Solidity defines one", () => {
    // The documented public surface of this template: the signature and selector of the
    // error its freshness bound exists to produce.
    expect(errorSignature({ name: "PriceStale", inputs: [{ type: "uint64" }, { type: "uint64" }] })).to.equal(
      "PriceStale(uint64,uint64)",
    );
    expect(`0x${REJECTION_SELECTORS["price-stale"]}`).to.equal(abiInterface.getError("PriceStale")?.selector);
    expect(explainSelector(abiInterface.getError("PriceStale")?.selector ?? "")).to.equal("price-stale");
  });

  it("indexes every ABI error by selector, with no collisions", () => {
    const errors = PRICED_ASSET_REGISTRY_ABI.filter((entry) => entry.type === "error");
    expect(Object.keys(REGISTRY_ERROR_SELECTORS)).to.have.length(errors.length);

    const selectors = Object.keys(REGISTRY_ERROR_SELECTORS);
    expect(new Set(selectors).size).to.equal(selectors.length);
    for (const selector of selectors) {
      expect(REGISTRY_ERROR_SELECTORS[selector], selector).to.be.a("string");
      expect(errorNameForSelector(`0x${selector}`), selector).to.be.a("string");
    }
  });

  describe("against real reverts", () => {
    let signer: HardhatEthersSigner;
    let oracle: MockPythOracle;
    let registry: PricedAssetRegistry;
    const feed = HBAR_USD_FEED_ID;
    const token = "0x00000000000000000000000000000000004c4b41";
    const digest = `0x${"ab".repeat(32)}`;

    /** Latest block timestamp, so ages below are relative to the chain, not wall-clock. */
    async function now(): Promise<number> {
      return Number((await ethers.provider.getBlock("latest"))?.timestamp ?? 0);
    }

    /**
     * Seeds the mock with the real HBAR/USD price at a chosen age.
     *
     * The reference observation is itself about 40 days old, which is *inside* the
     * shipped 90-day bound, so replaying it verbatim would be accepted. Tests that need
     * the freshness check to fire have to move the observation, and they do so in age
     * terms so the intent stays readable.
     */
    async function seedAt(ageSeconds: number): Promise<void> {
      const blockTimestamp = await now();
      await oracle.setPrice(
        feed,
        HBAR_USD_REFERENCE_OBSERVATION.priceMantissa,
        HBAR_USD_REFERENCE_OBSERVATION.confidenceMantissa,
        HBAR_USD_REFERENCE_OBSERVATION.exponent,
        blockTimestamp - ageSeconds,
      );
    }

    /** The observation to attest, matching whatever the mock currently holds. */
    async function attesting(ageSeconds: number, priceMultiplier = 1n): Promise<ObservationArg> {
      await seedAt(ageSeconds);
      return {
        price: BigInt(HBAR_USD_REFERENCE_OBSERVATION.priceMantissa) * priceMultiplier,
        conf: BigInt(HBAR_USD_REFERENCE_OBSERVATION.confidenceMantissa),
        expo: HBAR_USD_REFERENCE_OBSERVATION.exponent,
        // The contract rejects an attestation whose publish time is not the live one, so
        // this has to be the exact timestamp the mock was seeded with. Reading it back
        // from the oracle is what keeps the two in step.
        publishTime: Number(await oracle.getPriceUnsafe(feed).then((o) => o.publishTime)),
      };
    }

    beforeEach(async () => {
      const [, registrarSigner] = await ethers.getSigners();
      if (!registrarSigner) throw new Error("the in-process network must expose a second signer");
      signer = registrarSigner;

      oracle = await (await ethers.getContractFactory("MockPythOracle")).deploy(60n);
      registry = await (
        await ethers.getContractFactory("PricedAssetRegistry")
      ).deploy(await oracle.getAddress(), DEFAULT_MAX_DEVIATION_BPS, DEFAULT_MAX_PRICE_AGE_SECONDS);
      await registry.setRegistrant(await signer.getAddress(), true);
    });

    /** The 4-byte selector the EVM actually returned, read out of the revert data. */
    async function selectorOfRevert(action: () => Promise<unknown>): Promise<string> {
      try {
        await action();
      } catch (error) {
        const data = (error as { data?: unknown }).data ?? (error as { error?: { data?: unknown } }).error?.data;
        if (typeof data === "string") return `0x${data.replace(/^0x/, "").slice(0, 8)}`;
        // Fall back to the name ethers decoded from the real return data.
        const decoded = (error as { errorName?: string }).errorName;
        expect(decoded, "revert carried no selector and no decodable error name").to.be.a("string");
        return abiInterface.getError(decoded as string)?.selector ?? "";
      }
      throw new Error("expected the transaction to revert, but it succeeded");
    }

    it("reads back PriceStale from the chain", async () => {
      const stale = await attesting(DEFAULT_MAX_PRICE_AGE_SECONDS + 3600);
      const selector = await selectorOfRevert(() =>
        registry.connect(signer).recordIssuance(feed, digest, token, 1n, stale),
      );

      expect(selector).to.equal(`0x${REJECTION_SELECTORS["price-stale"]}`);
      expect(errorNameForSelector(selector)).to.equal("PriceStale");
      expect(explainSelector(selector)).to.equal("price-stale");
    });

    it("reads back DeviationTooHigh from the chain", async () => {
      // Ten times the live price: 900000 bps of deviation against a 50 bps bound.
      const deviating = await attesting(45, 10n);
      const selector = await selectorOfRevert(() =>
        registry.connect(signer).recordIssuance(feed, digest, token, 1n, deviating),
      );

      expect(selector).to.equal(`0x${REJECTION_SELECTORS["deviation-too-high"]}`);
      expect(explainSelector(selector)).to.equal("deviation-too-high");
    });

    it("reads back ZeroUnits from the chain", async () => {
      const fresh = await attesting(45);
      const selector = await selectorOfRevert(() =>
        registry.connect(signer).recordIssuance(feed, digest, token, 0n, fresh),
      );

      expect(selector).to.equal(`0x${REJECTION_SELECTORS["zero-units"]}`);
      expect(explainSelector(selector)).to.equal("zero-units");
    });

    it("reads back ExpoMismatch from the chain", async () => {
      const fresh = await attesting(45);
      const selector = await selectorOfRevert(() =>
        registry.connect(signer).recordIssuance(feed, digest, token, 1n, { ...fresh, expo: -6 }),
      );

      expect(selector).to.equal(`0x${REJECTION_SELECTORS["expo-mismatch"]}`);
      expect(explainSelector(selector)).to.equal("expo-mismatch");
    });

    it("reads back AlreadyRecorded, which is not a policy rejection", async () => {
      const fresh = await attesting(45);
      await registry.connect(signer).recordIssuance(feed, digest, token, 1n, fresh);

      const selector = await selectorOfRevert(() =>
        registry.connect(signer).recordIssuance(feed, digest, token, 1n, fresh),
      );
      expect(errorNameForSelector(selector)).to.equal("AlreadyRecorded");
      // A duplicate is not a policy verdict, so no rejection code is claimed for it.
      expect(explainSelector(selector)).to.equal(null);
    });
  });
});
