import { expect } from "chai";
import { parseUnits } from "ethers";
import { ethers } from "hardhat";
import {
  DEFAULT_MAX_DEVIATION_BPS,
  DEFAULT_MAX_PRICE_AGE_SECONDS,
  HBAR_USD_FEED_ID,
  PYTH_DEPLOYMENTS,
  REGISTRY_REJECTION_CODES,
  REJECTION_SOLIDITY_ERRORS,
  assessDeviation,
  assessFreshness,
  evaluateAttestation,
  formatScaled,
  toBigInt,
  valueOfBaseUnits,
  type OraclePrice,
} from "@sh/shared";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import type { PricedAssetRegistry } from "../typechain-types";
import type { MockPythOracle } from "../typechain-types";

/**
 * Observation of the real HBAR/USD feed on Hedera testnet, captured through the
 * JSON-RPC relay: price 8055012, conf 5531, expo -8, publishTime 1787525955.
 *
 * The tests use these numbers rather than invented ones so that the arithmetic
 * checked here is the arithmetic that runs against the live feed.
 */
const LIVE_HBAR: OraclePrice = {
  priceMantissa: "8055012",
  confidenceMantissa: "5531",
  exponent: -8,
  publishTime: 1787525955,
};

const FEED = HBAR_USD_FEED_ID;
const ASSET_TOKEN = "0x00000000000000000000000000000000004c4b41";
const ATTESTATION_HASH = `0x${"ab".repeat(32)}`;
const ZERO_HASH = `0x${"00".repeat(32)}`;

/** Age of the feed observation at the pinned block time, in seconds. */
const AGE = 45;

/**
 * The observation currently on the mock oracle.
 *
 * `pinnedNow` is the timestamp the *next* transaction will be mined at, and
 * `pinnedAgeSeconds` is how old the mock's `publishTime` will be at that block.
 * Tests that need a different freshness scenario call `publishThenPin`, which
 * updates both, so `pinnedLive()` and `observation()` always describe exactly what
 * the contract is about to read. The price and exponent are always the real
 * HBAR/USD values, so the arithmetic under test is the arithmetic that matters.
 */
let pinnedNow = 0;
let pinnedAgeSeconds = AGE;

function pinnedLive(): OraclePrice {
  return { ...LIVE_HBAR, publishTime: pinnedNow - pinnedAgeSeconds };
}

/** Builds the on-chain `Observation` argument from a possibly-overridden price observation. */
const observation = (overrides: Partial<OraclePrice> = {}) => ({
  price: overrides.priceMantissa ?? LIVE_HBAR.priceMantissa,
  conf: overrides.confidenceMantissa ?? LIVE_HBAR.confidenceMantissa,
  expo: overrides.exponent ?? LIVE_HBAR.exponent,
  publishTime: overrides.publishTime ?? pinnedNow - pinnedAgeSeconds,
});

async function latestTimestamp(): Promise<number> {
  const block = await ethers.provider.getBlock("latest");
  return block?.timestamp ?? 0;
}

/**
 * Pins the timestamp of the next block and returns it, so freshness assertions can
 * be exact. The local chain refuses a timestamp it has already used, so this
 * always moves strictly forward rather than re-pinning a value.
 */
async function pinNextBlock(): Promise<number> {
  const timestamp = (await latestTimestamp()) + 1;
  await ethers.provider.send("evm_setNextBlockTimestamp", [timestamp]);
  return timestamp;
}

/**
 * Publishes a price onto the mock oracle that will be exactly `ageSeconds` old when
 * the next block is mined, then pins that block.
 *
 * The `setPrice` transaction itself consumes one timestamp, so the block the caller
 * is about to send lands one later; `ageSeconds` is measured against *that* block,
 * which is the block the contract will read `block.timestamp` from. A negative
 * `ageSeconds` puts `publishTime` in the future, which the contract must treat as
 * age zero rather than as a fresher price.
 */
async function publishThenPin(ageSeconds: number, overrides: Partial<OraclePrice> = {}): Promise<number> {
  const blockTimestamp = (await latestTimestamp()) + 2;
  pinnedAgeSeconds = ageSeconds;
  pinnedNow = blockTimestamp;
  await oracle.setPrice(
    FEED,
    overrides.priceMantissa ?? LIVE_HBAR.priceMantissa,
    overrides.confidenceMantissa ?? LIVE_HBAR.confidenceMantissa,
    overrides.exponent ?? LIVE_HBAR.exponent,
    overrides.publishTime ?? blockTimestamp - ageSeconds,
  );
  return pinNextBlock();
}

/**
 * Deployed per test by `beforeEach`; declared here so the time helpers above can
 * reach it without threading it through every call site.
 */
let oracle: MockPythOracle;

describe("PricedAssetRegistry", () => {
  let owner: HardhatEthersSigner;
  let registrar: HardhatEthersSigner;
  let stranger: HardhatEthersSigner;
  let registry: PricedAssetRegistry;

  beforeEach(async () => {
    const [ownerSigner, registrarSigner, strangerSigner] = await ethers.getSigners();
    if (!ownerSigner || !registrarSigner || !strangerSigner) {
      throw new Error("the in-process network must expose at least 3 signers");
    }
    owner = ownerSigner;
    registrar = registrarSigner;
    stranger = strangerSigner;

    const oracleFactory = await ethers.getContractFactory("MockPythOracle");
    oracle = await oracleFactory.deploy(1n);

    const registryFactory = await ethers.getContractFactory("PricedAssetRegistry");
    registry = await registryFactory.deploy(
      await oracle.getAddress(),
      DEFAULT_MAX_DEVIATION_BPS,
      DEFAULT_MAX_PRICE_AGE_SECONDS,
    );

    await registry.setRegistrant(await registrar.getAddress(), true);

    // Pin the chain slightly ahead of wall-clock time; the local network only ever
    // moves forward, and the shipped 90 day bound means this age is acceptable.
    await publishThenPin(AGE);
  });

  describe("deployment", () => {
    it("stores the policy it was deployed with", async () => {
      const [deviation, age] = await registry.policy();
      expect(deviation).to.equal(DEFAULT_MAX_DEVIATION_BPS);
      expect(age).to.equal(DEFAULT_MAX_PRICE_AGE_SECONDS);
    });

    it("makes the owner the first authorised registrant", async () => {
      expect(await registry.owner()).to.equal(await owner.getAddress());
      expect(await registry.isAuthorized(await owner.getAddress())).to.equal(true);
      expect(await registry.isAuthorized(await stranger.getAddress())).to.equal(false);
    });

    it("rejects a zero oracle address", async () => {
      const factory = await ethers.getContractFactory("PricedAssetRegistry");
      await expect(factory.deploy(ethers.ZeroAddress, 50, 3600)).to.be.revertedWithCustomError(factory, "ZeroAddress");
    });

    it("rejects a policy outside the hard bounds", async () => {
      const factory = await ethers.getContractFactory("PricedAssetRegistry");
      await expect(factory.deploy(await oracle.getAddress(), 1001, 3600)).to.be.revertedWithCustomError(
        factory,
        "PolicyOutOfRange",
      );
      await expect(
        factory.deploy(await oracle.getAddress(), 50, 3650n * 86_400n * 10n + 1n),
      ).to.be.revertedWithCustomError(factory, "PolicyOutOfRange");
    });

    it("reads Pyth's own validity window through the oracle instead of hard-coding it", async () => {
      // 60 is what the real Hedera deployment returns; asserted here so a change
      // upstream shows up as a failing test rather than a stale comment.
      expect(await registry.oracleValidTimePeriod()).to.equal(60n);
      expect(await oracle.getValidTimePeriod()).to.equal(60n);
    });

    it("exposes the deviation and update-fee reads a complete integration needs", async () => {
      expect(await oracle.updateFee()).to.equal(1n);
      expect(await registry.deviationBpsOf(LIVE_HBAR.priceMantissa, LIVE_HBAR.priceMantissa)).to.equal(0);
    });
  });

  describe("permissions", () => {
    it("refuses a registration from an unauthorised account", async () => {
      await expect(
        registry.connect(stranger).recordIssuance(FEED, ATTESTATION_HASH, ASSET_TOKEN, 1000n, observation()),
      ).to.be.revertedWithCustomError(registry, "NotAuthorised");
    });

    it("only lets the owner change the registrant list", async () => {
      // `registrar` is authorised to record but is not the owner, so it must not be
      // able to widen the list — authorisation to record is not administration.
      await expect(
        registry.connect(registrar).setRegistrant(await stranger.getAddress(), true),
      ).to.be.revertedWithCustomError(registry, "NotOwner");
      await registry.setRegistrant(await stranger.getAddress(), true);
      expect(await registry.isAuthorized(await stranger.getAddress())).to.equal(true);
    });

    it("revokes access", async () => {
      await registry.setRegistrant(await registrar.getAddress(), false);
      await expect(
        registry.connect(registrar).recordIssuance(FEED, ATTESTATION_HASH, ASSET_TOKEN, 1000n, observation()),
      ).to.be.revertedWithCustomError(registry, "NotAuthorised");
    });

    it("only lets the owner change the policy", async () => {
      await expect(registry.connect(registrar).setPolicy(10, 60)).to.be.revertedWithCustomError(registry, "NotOwner");
      await registry.setPolicy(10, 60);
      const [deviation, age] = await registry.policy();
      expect(deviation).to.equal(10);
      expect(age).to.equal(60n);
    });

    it("refuses a policy that would disable the check", async () => {
      await expect(registry.setPolicy(1001, 60)).to.be.revertedWithCustomError(registry, "PolicyOutOfRange");
    });

    it("rejects a zero address in the registrant list and in ownership transfer", async () => {
      await expect(registry.setRegistrant(ethers.ZeroAddress, true)).to.be.revertedWithCustomError(
        registry,
        "ZeroAddress",
      );
      await expect(registry.transferOwnership(ethers.ZeroAddress)).to.be.revertedWithCustomError(
        registry,
        "ZeroAddress",
      );
    });

    it("transfers ownership and moves the implicit authorisation with it", async () => {
      await registry.transferOwnership(await stranger.getAddress());
      expect(await registry.owner()).to.equal(await stranger.getAddress());
      expect(await registry.isAuthorized(await stranger.getAddress())).to.equal(true);
      expect(await registry.isAuthorized(await owner.getAddress())).to.equal(false);
    });
  });

  describe("recording an issuance", () => {
    it("stores the observation the contract itself read", async () => {
      await registry
        .connect(registrar)
        .recordIssuance(FEED, ATTESTATION_HASH, ASSET_TOKEN, 1_000_000_000n, observation());

      const record = await registry.recordOf(ATTESTATION_HASH);
      expect(record.attestationHash).to.equal(ATTESTATION_HASH);
      expect(record.feedId).to.equal(FEED);
      expect(record.assetToken).to.equal(ethers.getAddress(ASSET_TOKEN));
      expect(record.registrant).to.equal(await registrar.getAddress());
      expect(record.units).to.equal(1_000_000_000n);
      expect(record.observed.price).to.equal(BigInt(LIVE_HBAR.priceMantissa));
      expect(record.observed.expo).to.equal(LIVE_HBAR.exponent);
      expect(record.observed.publishTime).to.equal(pinnedNow - AGE);
      expect(record.deviationBps).to.equal(0);
      expect(record.priceAgeSeconds).to.equal(BigInt(AGE));
      expect(record.recordedAt).to.equal(pinnedNow);
    });

    it("derives the record id from the attestation hash", async () => {
      await registry.recordIssuance(FEED, ATTESTATION_HASH, ASSET_TOKEN, 1n, observation());
      const id = await registry.recordIdAt(0);
      expect(id).to.equal(ATTESTATION_HASH);
      expect(await registry.recordCount()).to.equal(1);
      expect(await registry.hasRecord(ATTESTATION_HASH)).to.equal(true);
    });

    it("emits the full observation, so a third party can re-derive the check from logs", async () => {
      await expect(registry.recordIssuance(FEED, ATTESTATION_HASH, ASSET_TOKEN, 42n, observation()))
        .to.emit(registry, "IssuanceRecorded")
        .withArgs(
          ATTESTATION_HASH,
          ATTESTATION_HASH,
          FEED,
          ethers.getAddress(ASSET_TOKEN),
          await owner.getAddress(),
          42n,
          BigInt(LIVE_HBAR.priceMantissa),
          BigInt(LIVE_HBAR.confidenceMantissa),
          LIVE_HBAR.exponent,
          pinnedNow - AGE,
          0,
          BigInt(AGE),
        );
    });

    it("records the price age it measured", async () => {
      await publishThenPin(3600);
      await registry.recordIssuance(FEED, ATTESTATION_HASH, ASSET_TOKEN, 1n, observation());
      const record = await registry.recordOf(ATTESTATION_HASH);
      expect(record.priceAgeSeconds).to.equal(3600);
    });

    it("treats a future publishTime as zero age rather than as a fresher price", async () => {
      // A relay with a skewed clock, or a feed that jumped ahead. An age computed
      // by naive subtraction would come out negative and could pass a freshness
      // bound that everything else fails.
      await publishThenPin(-3600);
      await registry.recordIssuance(FEED, ATTESTATION_HASH, ASSET_TOKEN, 1n, observation());
      const record = await registry.recordOf(ATTESTATION_HASH);
      expect(record.priceAgeSeconds).to.equal(0);
    });

    it("refuses an empty attestation hash, a zero token and zero units", async () => {
      await expect(
        registry.recordIssuance(FEED, ZERO_HASH, ASSET_TOKEN, 1n, observation()),
      ).to.be.revertedWithCustomError(registry, "EmptyAttestationHash");
      await expect(
        registry.recordIssuance(FEED, ATTESTATION_HASH, ethers.ZeroAddress, 1n, observation()),
      ).to.be.revertedWithCustomError(registry, "ZeroAddress");
      await expect(
        registry.recordIssuance(FEED, ATTESTATION_HASH, ASSET_TOKEN, 0n, observation()),
      ).to.be.revertedWithCustomError(registry, "ZeroUnits");
    });

    it("refuses to record the same attestation twice", async () => {
      await registry.recordIssuance(FEED, ATTESTATION_HASH, ASSET_TOKEN, 1n, observation());
      await expect(
        registry.recordIssuance(FEED, ATTESTATION_HASH, ASSET_TOKEN, 2n, observation()),
      ).to.be.revertedWithCustomError(registry, "AlreadyRecorded");
      expect(await registry.recordCount()).to.equal(1);
    });
  });

  describe("policy enforcement", () => {
    it("refuses an attestation built from a different exponent", async () => {
      await expect(
        registry.recordIssuance(FEED, ATTESTATION_HASH, ASSET_TOKEN, 1n, observation({ exponent: -6 })),
      ).to.be.revertedWithCustomError(registry, "ExpoMismatch");
    });

    it("refuses an attestation built from a different observation", async () => {
      await expect(
        registry.recordIssuance(FEED, ATTESTATION_HASH, ASSET_TOKEN, 1n, observation({ publishTime: 1_799_999_999 })),
      ).to.be.revertedWithCustomError(registry, "PublishTimeMismatch");
    });

    it("refuses a non-positive price", async () => {
      await oracle.setPrice(FEED, 0, LIVE_HBAR.confidenceMantissa, LIVE_HBAR.exponent, pinnedNow - AGE);
      await expect(
        registry.recordIssuance(FEED, ATTESTATION_HASH, ASSET_TOKEN, 1n, observation()),
      ).to.be.revertedWithCustomError(registry, "NonPositivePrice");

      await oracle.setPrice(
        FEED,
        LIVE_HBAR.priceMantissa,
        LIVE_HBAR.confidenceMantissa,
        LIVE_HBAR.exponent,
        pinnedNow - AGE,
      );
      await expect(
        registry.recordIssuance(FEED, ATTESTATION_HASH, ASSET_TOKEN, 1n, observation({ priceMantissa: "-1" })),
      ).to.be.revertedWithCustomError(registry, "NonPositivePrice");
    });

    it("refuses a price that moved beyond the deviation bound", async () => {
      // 5% high: 8055012 * 1.05 = 8457762.6
      await expect(
        registry.recordIssuance(FEED, ATTESTATION_HASH, ASSET_TOKEN, 1n, observation({ priceMantissa: "8457763" })),
      ).to.be.revertedWithCustomError(registry, "DeviationTooHigh");
    });

    it("refuses a price older than the freshness bound", async () => {
      await registry.setPolicy(DEFAULT_MAX_DEVIATION_BPS, 3600);
      await publishThenPin(3601);
      await expect(
        registry.recordIssuance(FEED, ATTESTATION_HASH, ASSET_TOKEN, 1n, observation()),
      ).to.be.revertedWithCustomError(registry, "PriceStale");
    });

    it("accepts a price exactly at the freshness bound", async () => {
      await registry.setPolicy(DEFAULT_MAX_DEVIATION_BPS, 3600);
      await publishThenPin(3600);
      await registry.recordIssuance(FEED, ATTESTATION_HASH, ASSET_TOKEN, 1n, observation());
      const record = await registry.recordOf(ATTESTATION_HASH);
      expect(record.priceAgeSeconds).to.equal(3600);
    });

    it("reverts an unknown feed, as Pyth does", async () => {
      const unknownFeed = `0x${"11".repeat(32)}`;
      await expect(
        registry.recordIssuance(unknownFeed, ATTESTATION_HASH, ASSET_TOKEN, 1n, observation()),
      ).to.be.revertedWithCustomError(oracle, "UnknownFeed");
    });

    it("keeps the shipped default usable with the real, currently stale Hedera feed", () => {
      // The live HBAR/USD observation is ~40 days old. With the shipped 90 day bound
      // that is acceptable; the point of this test is that the default is not a
      // placeholder that only passes because nothing reads the real feed.
      const realFeedAge = assessFreshness(
        LIVE_HBAR.publishTime,
        LIVE_HBAR.publishTime + 40 * 86_400,
        DEFAULT_MAX_PRICE_AGE_SECONDS,
      );
      expect(realFeedAge.stale).to.equal(false);
      // And the same age is refused at an hour, which is what a production policy would use.
      expect(assessFreshness(LIVE_HBAR.publishTime, LIVE_HBAR.publishTime + 3601, 3600).stale).to.equal(true);
    });
  });

  describe("simulation parity with @sh/shared", () => {
    // `live` is the observation the contract actually reads, which is the pinned one.
    const live = () => pinnedLive();
    const cases: Array<{ label: string; attested: Partial<OraclePrice>; units: string }> = [
      { label: "exact match", attested: {}, units: "1000000" },
      { label: "50 bp high, exactly at the bound", attested: { priceMantissa: "8095287" }, units: "1000000" },
      { label: "51 bp high", attested: { priceMantissa: "8096093" }, units: "1000000" },
      { label: "50 bp low", attested: { priceMantissa: "8014737" }, units: "1000000" },
      { label: "exponent differs", attested: { exponent: -6 }, units: "1000000" },
      { label: "publish time differs", attested: { publishTime: pinnedNow - AGE + 60 }, units: "1000000" },
      { label: "zero units", attested: {}, units: "0" },
    ];

    for (const testCase of cases) {
      it(`agrees with the off-chain evaluator: ${testCase.label}`, async () => {
        const attested: OraclePrice = { ...live(), ...testCase.attested };
        const [accepting, reason] = await registry.checkAttestation(
          FEED,
          BigInt(testCase.units),
          observation({
            priceMantissa: attested.priceMantissa,
            exponent: attested.exponent,
            publishTime: attested.publishTime,
          }),
        );

        const offChain = evaluateAttestation({
          attested,
          live: live(),
          nowSeconds: pinnedNow,
          maxDeviationBps: DEFAULT_MAX_DEVIATION_BPS,
          maxPriceAgeSeconds: DEFAULT_MAX_PRICE_AGE_SECONDS,
          units: testCase.units,
        });

        // `checkAttestation` takes the unit count for exactly this reason: a preview that
        // cannot see every rule `recordIssuance` enforces is a preview that will lie.
        expect(accepting).to.equal(offChain.accepted);

        if (testCase.units === "0") {
          // The contract checks units before consulting the oracle, so both sides
          // report the same first failure even though the price itself is fine.
          await expect(
            registry.recordIssuance(FEED, ATTESTATION_HASH, ASSET_TOKEN, 0n, observation()),
          ).to.be.revertedWithCustomError(registry, "ZeroUnits");
          expect(reason).to.equal(registry.interface.getError("ZeroUnits")?.selector);
          expect(offChain.rejection?.code).to.equal("zero-units");
          return;
        }

        if (accepting) {
          await registry.recordIssuance(
            FEED,
            ATTESTATION_HASH,
            ASSET_TOKEN,
            BigInt(testCase.units),
            observation(attested),
          );
          expect(offChain.accepted).to.equal(true);
        } else {
          // The off-chain code and the Solidity error are separate vocabularies; the
          // shared table is the only thing allowed to translate between them.
          const errorName = REJECTION_SOLIDITY_ERRORS[offChain.rejection!.code];
          // `getError`, not `Interface.errors`: ethers only populates that map when
          // the ABI is given as a dict, and hardhat hands it a fragment array.
          const expectedSelector = registry.interface.getError(errorName)?.selector;
          expect(reason, `expected the ${offChain.rejection!.code} selector`).to.equal(expectedSelector);
        }
      });
    }

    it("maps every rejection code to a real custom error", () => {
      // Guards against a code, or an error name, existing only in TypeScript. Driven
      // by the shared table so adding a rejection code without adding the Solidity
      // error fails here instead of in production.
      expect(Object.keys(REJECTION_SOLIDITY_ERRORS).sort()).to.deep.equal([...REGISTRY_REJECTION_CODES].sort());
      for (const [code, errorName] of Object.entries(REJECTION_SOLIDITY_ERRORS)) {
        expect(
          registry.interface.getError(errorName),
          `${code} -> ${errorName} must be declared on the contract`,
        ).to.not.equal(null);
      }
    });

    it("computes basis points identically on and off chain, including at the rounding boundary", async () => {
      const pairs: Array<[string, string]> = [
        ["8055012", "8055012"],
        ["8055012", "8095287"], // exactly 50 bp
        ["8055012", "8095288"], // still rounds to 50 bp
        ["8055012", "8096093"], // 51 bp
        ["8055012", "8014737"],
        ["1", "20000"],
        ["20001", "20000"], // exactly 0.5 bp -> rounds up
        ["1", "1"],
        ["9223372036854775807", "1"], // int64 extremes
        ["9007199254740993", "9007199254740992"], // beyond float precision
      ];

      // `deviationBpsOf` stores the result in a uint16, so it saturates at 65535 rather
      // than reverting. Every pair below either fits, or must clamp to that ceiling.
      const BPS_CEILING = 65_535;
      for (const [attested, live] of pairs) {
        const onChain = await registry.deviationBpsOf(attested, live);
        const offChain = assessDeviation(attested, live, Number.MAX_SAFE_INTEGER).deviationBps;
        const expected = offChain > BPS_CEILING ? BPS_CEILING : offChain;
        expect(onChain, `deviation for ${attested} vs ${live}`).to.equal(expected);
      }

      // And the ceiling really is reached, so the clamp is not merely theoretical:
      // 99999 * 10000 / 1 is far past 65535 bps.
      expect(await registry.deviationBpsOf(100_000, 1)).to.equal(BPS_CEILING);
    });

    it("fails closed when the reference price is not positive", async () => {
      expect(await registry.deviationBpsOf(1, 0)).to.equal(65_535);
      expect(await registry.deviationBpsOf(1, -1)).to.equal(65_535);
    });
  });

  describe("USD valuation", () => {
    const tokenDecimals = 6n;

    it("prices one unit to 18 decimals", async () => {
      // `priceE18` returns an 18-decimal integer, so the off-chain decimal string is
      // parsed rather than compared as text.
      const onChain = await registry.priceE18(FEED);
      const offChain = formatScaled(LIVE_HBAR.priceMantissa, LIVE_HBAR.exponent, 18);
      expect(onChain).to.equal(parseUnits(offChain, 18));
    });

    it("values a base-unit amount the same way the off-chain helper does", async () => {
      const units = 2_500_000n; // 2.5 tokens at 6 decimals
      const onChain = await registry.valueOfBaseUnits(FEED, units, tokenDecimals);
      const offChain = valueOfBaseUnits(LIVE_HBAR, units, Number(tokenDecimals), 18);
      expect(onChain).to.equal(parseUnits(offChain, 18));
      // 2.5 HBAR at $0.08055012, so the quote must be 0.20137530 exactly.
      expect(formatScaled(onChain, -18, 18)).to.equal("0.2013753");
    });

    it("stays exact for supplies that overflow an intermediate product", async () => {
      // 10 ** 30 base units: `price * 10 ** 10 * units` overflows uint256, so this
      // only passes with the 512-bit mulDiv.
      const units = 10n ** 30n;
      const onChain = await registry.valueOfBaseUnits(FEED, units, tokenDecimals);
      const offChain = valueOfBaseUnits(LIVE_HBAR, units, Number(tokenDecimals), 18);
      expect(onChain).to.equal(parseUnits(offChain, 18));
    });

    it("refuses to value an asset at a zero price", async () => {
      await oracle.setPrice(FEED, 0, 0, -8, pinnedNow - AGE);
      await expect(registry.valueOfBaseUnits(FEED, 1_000_000n, tokenDecimals)).to.be.revertedWithCustomError(
        registry,
        "NonPositivePrice",
      );
    });

    it("refuses an exponent outside the supported window instead of guessing a magnitude", async () => {
      await oracle.setPrice(FEED, 8055012, 5531, -19, pinnedNow - AGE);
      await expect(registry.priceE18(FEED)).to.be.revertedWithCustomError(registry, "ExponentOutOfRange");
      await oracle.setPrice(FEED, 8055012, 5531, 19, pinnedNow - AGE);
      await expect(registry.priceE18(FEED)).to.be.revertedWithCustomError(registry, "ExponentOutOfRange");
    });
  });

  describe("live reads", () => {
    it("reads the current observation straight from the oracle", async () => {
      const live = await registry.livePrice(FEED);
      expect(live.price).to.equal(toBigInt(LIVE_HBAR.priceMantissa, "price"));
      expect(live.conf).to.equal(toBigInt(LIVE_HBAR.confidenceMantissa, "conf"));
      expect(live.expo).to.equal(LIVE_HBAR.exponent);
      expect(live.publishTime).to.equal(pinnedNow - AGE);
    });

    it("records the same observation the operator would verify against", async () => {
      await registry.recordIssuance(FEED, ATTESTATION_HASH, ASSET_TOKEN, 1n, observation());
      const [live, record] = await Promise.all([registry.livePrice(FEED), registry.recordOf(ATTESTATION_HASH)]);
      expect(record.observed.price).to.equal(live.price);
      expect(record.observed.publishTime).to.equal(live.publishTime);
    });
  });

  describe("deployment configuration", () => {
    it("names the real Pyth deployment for Hedera, and marks it read-only", () => {
      const deployment = PYTH_DEPLOYMENTS.testnet;
      expect(deployment?.contractAddress).to.equal("0xA2aa501b19aff244D90cc15a4Cf739D2725B5729");
      expect(deployment?.readOnly).to.equal(true);
      expect(deployment?.readOnlyReason, "the read-only status must be explained").to.be.a("string");
      expect((deployment?.readOnlyReason ?? "").length).to.be.greaterThan(0);
    });
  });
});
