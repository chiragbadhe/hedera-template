import { expect } from "chai";
import hre from "hardhat";
import { PRICED_ASSET_REGISTRY_ABI } from "@sh/shared";

/**
 * Guards the generated ABI the browser bundle ships.
 *
 * `packages/shared/src/abi/generated.ts` is written by `yarn generate:abis` and checked
 * in, because the Next.js bundle must not depend on the Hardhat artifact directory.
 * That only works if the file cannot fall behind the contract, so it is compared here
 * against the freshly compiled artifact.
 *
 * A failure means: run `yarn generate:abis` and commit the result in the same change as
 * the contract edit. Nothing else in the suite would notice a stale ABI — the app would
 * simply call a function that no longer exists, or miss one that does.
 */
describe("generated contract ABI", () => {
  it("matches the compiled PricedAssetRegistry artifact", async () => {
    const artifact = await hre.artifacts.readArtifact("PricedAssetRegistry");

    // Compared as sets, not as ordered lists. ABI entry order carries no meaning — a
    // client looks entries up by name — so an order-sensitive assertion here would fail
    // on a cosmetic reordering with nothing behaviourally changed. Stringifying each
    // entry makes the comparison exact: two entries can only stringify alike if they are
    // alike. `as const` also gives a readonly literal type, which `JSON` normalises away.
    const canonical = (entries: readonly unknown[]): string[] => entries.map((entry) => JSON.stringify(entry)).sort();

    const fromShared: unknown = JSON.parse(JSON.stringify(PRICED_ASSET_REGISTRY_ABI));
    expect(canonical(fromShared as unknown[])).to.deep.equal(canonical(artifact.abi as unknown[]));
  });

  it("includes the custom errors the app decodes, so a revert is identifiable", () => {
    const names = PRICED_ASSET_REGISTRY_ABI.filter((entry) => entry.type === "error").map((entry) => entry.name);

    // Every code `evaluateAttestation` can return must be nameable on-chain, or the UI
    // cannot tell a user why their registration was refused.
    expect(names).to.include.members([
      "ExpoMismatch",
      "PublishTimeMismatch",
      "DeviationTooHigh",
      "PriceStale",
      "NonPositivePrice",
      "ZeroUnits",
      "AlreadyRecorded",
      "NotAuthorised",
    ]);
  });

  it("exposes the views the app reads without a transaction", () => {
    const functions = PRICED_ASSET_REGISTRY_ABI.filter((entry) => entry.type === "function").map((entry) => entry.name);

    expect(functions).to.include.members([
      "policy",
      "livePrice",
      "recordOf",
      "hasRecord",
      "recordCount",
      "recordIdAt",
      "owner",
      "oracle",
      "isAuthorized",
      "oracleValidTimePeriod",
      "checkAttestation",
      "priceE18",
      "valueOfBaseUnits",
    ]);
  });
});
