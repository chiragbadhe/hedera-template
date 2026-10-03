/**
 * Reads the live Pyth price for a feed and explains it against the registry policy.
 *
 * Usage:
 *   yarn hardhat oracle:read                       # HBAR/USD on testnet
 *   yarn hardhat oracle:read --feed 0x…            # a specific feed
 *   HEDERA_NETWORK=mainnet yarn hardhat oracle:read
 *
 * This is a read-only script: it needs no credentials, spends nothing, and talks to
 * the same JSON-RPC relay the deployed contract reads through. It prints the raw
 * 4-word Pyth observation next to the decoded price so the encoding is checkable by
 * eye, plus the age and whether the shipped policy would accept it right now.
 */

import hre from "hardhat";
import {
  HBAR_USD_FEED_ID,
  PYTH_DEPLOYMENTS,
  assessFreshness,
  decodeOraclePrice,
  formatAge,
  formatScaled,
  formatUnixSeconds,
  hashscanUrl,
  publishTimeToIso,
  type OraclePrice,
} from "@sh/shared";
import { fields, heading, hederaNetworkForHardhatNetwork, requireEnvironment } from "./lib/scriptHelpers";

/** The 4-word `(price, conf, expo, publishTime)` tuple as `getPriceUnsafe` returns it. */
const WORD_BITS = 256n;

function readFeedArgument(): string {
  const flag = process.argv.indexOf("--feed");
  if (flag === -1) return HBAR_USD_FEED_ID;
  const value = process.argv[flag + 1];
  if (!value) throw new Error("--feed requires a 32-byte hex feed id");
  return value;
}

async function main(): Promise<void> {
  const environment = requireEnvironment();
  const hederaNetwork = hederaNetworkForHardhatNetwork();
  const feedId = readFeedArgument();

  if (!/^0x[0-9a-fA-F]{64}$/.test(feedId)) {
    throw new Error(`feed id must be 32 bytes of hex, received "${feedId}"`);
  }

  const deployment = PYTH_DEPLOYMENTS[hederaNetwork];
  if (!deployment) {
    throw new Error(`No Pyth deployment is configured for ${hederaNetwork}. Set PYTH_ORACLE_ADDRESS to override.`);
  }

  const oracle = await hre.ethers.getContractAt("IPythOracle", deployment.contractAddress);

  heading(`Pyth ${feedId === HBAR_USD_FEED_ID ? "HBAR/USD" : feedId} on ${hederaNetwork}`);
  fields({
    oracle: deployment.contractAddress,
    "validity window": `${(await oracle.getValidTimePeriod()).toString()}s`,
    "update fee": `${(await oracle.getUpdateFee([])).toString()} wei`,
  });

  const words: bigint[] = await oracle.getPriceUnsafe(feedId);
  if (words.length !== 4) {
    throw new Error(`expected the 4-word Pyth observation, received ${words.length} words`);
  }

  // The ABI is four words, not the five-field `IPyth` struct Pyth's own docs show for
  // other chains. Decoding through the shared decoder keeps that assumption in one place.
  const price: OraclePrice = decodeOraclePrice(words);

  // Checked above to be exactly four words, so the tuple cast is safe.
  const [wordPrice, wordConf, wordExpo, wordPublishTime] = words as [bigint, bigint, bigint, bigint];
  const signed = (value: bigint) => (value >= 1n << (WORD_BITS - 1n) ? value - (1n << WORD_BITS) : value);

  heading("Raw observation");
  fields({
    "word 0 (price)": `${wordPrice} (int64 ${signed(wordPrice)})`,
    "word 1 (conf)": `${wordConf} (uint ${wordConf})`,
    "word 2 (expo)": `${wordExpo} (int32 ${signed(wordExpo)})`,
    "word 3 (publishTime)": `${wordPublishTime} (uint32)`,
  });

  const nowSeconds = Math.floor(Date.now() / 1000);
  const freshness = assessFreshness(price.publishTime, nowSeconds, environment.maxPriceAgeSeconds);

  heading("Decoded");
  fields({
    price: `$${formatScaled(price.priceMantissa, price.exponent, 8)}`,
    confidence: `$${formatScaled(price.confidenceMantissa, price.exponent, 8)}`,
    exponent: price.exponent,
    published: `${formatUnixSeconds(price.publishTime)} (${publishTimeToIso(price.publishTime)})`,
    age: formatAge(price.publishTime, nowSeconds),
    "policy bound": `${environment.maxPriceAgeSeconds}s`,
    "policy verdict": freshness.stale
      ? `STALE — a registration priced on this observation would be refused`
      : `within bound (${freshness.agePercentOfBound}% of it used)`,
    "pyth on hedera": deployment.readOnly ? `read-only: ${deployment.readOnlyReason}` : "writable",
    explorer: hashscanUrl(hederaNetwork, "contract", deployment.contractAddress),
  });

  if (freshness.stale) {
    console.log(
      "\n  The observation is older than the configured bound. Either the bound is too tight for a\n" +
        "  feed that updates rarely, or the feed genuinely is not being updated. Raise\n" +
        `  REGISTRY_MAX_PRICE_AGE_SECONDS above ${environment.maxPriceAgeSeconds} if the latter is not the case.\n`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(`\nOracle read failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
