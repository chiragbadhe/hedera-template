// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { IPythOracle } from "../interfaces/IPythOracle.sol";

/**
 * @title MockPythOracle
 * @notice A scriptable `IPythOracle` for unit tests.
 *
 * ## Scope warning
 *
 * This contract exists so the registry's policy can be tested against observations
 * that a live feed cannot currently produce — a 1-hour-old price, a flipped
 * exponent, a price that moved 5% between the attestation and the registration.
 * That is the only reason it exists.
 *
 * It must never be deployed to a public network and used as a price source. A
 * registry pointed at a mock oracle is an attestation of nothing, and the
 * difference between the two is invisible in the resulting transaction ids. The
 * deployment scripts only ever pass the real Pyth address for testnet and mainnet,
 * and `scripts/readOraclePrice.ts` prints the oracle address it actually read so
 * the distinction is visible in the terminal.
 */
contract MockPythOracle is IPythOracle {
    struct Feed {
        int64 price;
        int64 conf;
        int32 expo;
        uint32 publishTime;
        bool exists;
    }

    /// @notice Thrown for a feed id that has never been set, mirroring Pyth's behaviour on an unknown feed.
    error UnknownFeed(bytes32 feedId);

    mapping(bytes32 feedId => Feed feed) private _feeds;

    /// @notice Pyth's Hedera deployment answers 60 seconds; pinned here so tests can rely on it.
    uint256 public constant VALID_TIME_PERIOD = 60;

    /// @notice Settable so a test can prove the fee path is wired up. 1 wei matches Hedera.
    uint256 public updateFee;

    constructor(uint256 updateFee_) {
        updateFee = updateFee_;
    }

    /// @notice Sets or replaces a feed's observation.
    function setPrice(bytes32 feedId, int64 price, int64 conf, int32 expo, uint32 publishTime) external {
        _feeds[feedId] = Feed({ price: price, conf: conf, expo: expo, publishTime: publishTime, exists: true });
    }

    /// @notice Removes a feed, so `getPriceUnsafe` reverts the way an unknown feed does on Pyth.
    function deleteFeed(bytes32 feedId) external {
        delete _feeds[feedId];
    }

    function feedOf(bytes32 feedId) external view returns (Feed memory) {
        return _feeds[feedId];
    }

    function getPriceUnsafe(
        bytes32 feedId
    ) external view returns (int64 price, int64 conf, int32 expo, uint32 publishTime) {
        Feed memory feed = _feeds[feedId];
        if (!feed.exists) revert UnknownFeed(feedId);
        return (feed.price, feed.conf, feed.expo, feed.publishTime);
    }

    function getValidTimePeriod() external pure returns (uint256) {
        return VALID_TIME_PERIOD;
    }

    function getUpdateFee(bytes[] calldata) external view returns (uint256) {
        return updateFee;
    }
}
