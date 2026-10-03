// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

/**
 * @title IPythOracle
 * @notice The subset of the Pyth Network interface that this template uses.
 *
 * ## Why this is not the `IPyth` interface from Pyth's documentation
 *
 * Pyth publishes `IPyth` with a five-value return:
 *
 * ```solidity
 * function getPriceUnsafe(bytes32 id)
 *     external view returns (int64 price, int64 conf, int32 expo, uint publishTime, int64 emaPrice);
 * ```
 *
 * The deployment on Hedera (`0xA2aa501b19aff244D90cc15a4Cf739D2725B5729`, the same
 * address on testnet and mainnet) returns **four** values, without `emaPrice`.
 * That was established by calling the live contract through the Hedera JSON-RPC
 * relay: decoding five values fails, decoding four succeeds.
 *
 * This matters because a Solidity interface is not checked against the deployed
 * bytecode. If this file declared the five-word version, `getPriceUnsafe` would
 * still compile and every call would "succeed" while `publishTime` was silently
 * reading the `emaPrice` slot — the attestation would then be timestamped with a
 * price average, which is off by orders of magnitude, and the staleness check
 * would never fire. Four words is what Hedera actually answers with, so four words
 * is what is declared here.
 *
 * The off-chain decoder in the shared package asserts the same word count, and
 * `test/PricedAssetRegistry.test.ts` pins both to the observed values.
 */
interface IPythOracle {
    /**
     * @notice Returns the latest price observation for a feed.
     * @param id The Pyth price feed id.
     * @return price Price mantissa; the real value is `price * 10 ** expo`.
     * @return conf Confidence interval mantissa, same exponent as `price`.
     * @return expo Base-10 exponent.
     * @return publishTime Unix seconds, as published by the price publisher.
     */
    function getPriceUnsafe(bytes32 id) external view returns (int64 price, int64 conf, int32 expo, uint32 publishTime);

    /**
     * @notice How long Pyth recommends a price stays valid, in seconds.
     * @dev Returns 60 on Hedera. Read on-chain rather than hard-coded, so a change
     *      upstream is visible instead of silently ignored.
     */
    function getValidTimePeriod() external view returns (uint256);

    /**
     * @notice Fee, in wei, required to publish an update.
     * @dev Included because it is part of a complete oracle integration. It reads
     *      1 wei on Hedera, which is why the read-only status of the Hedera
     *      deployment is a Hermes availability problem rather than an economic one.
     * @param updateData Signed price updates. Unused on Hedera; see the note above.
     */
    function getUpdateFee(bytes[] calldata updateData) external view returns (uint256 fee);
}
