// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { IPythOracle } from "./interfaces/IPythOracle.sol";
import { FullPrecisionMath } from "./libraries/FullPrecisionMath.sol";

/**
 * @title PricedAssetRegistry
 * @notice Records token issuances together with the oracle observation they were
 *         priced at, and refuses any attestation that the live oracle does not agree with.
 *
 * ## The problem this solves
 *
 * An issuance record — "1,000,000 units of token 0.0.1234 were created at
 * transaction `0.0.9` at some timestamp by account `0.0.5`" — is only as trustworthy as the process
 * that produced it. Anyone can publish such a claim. Binding it to an oracle
 * observation makes the *pricing* of the issuance checkable by the chain rather
 * than by assertion:
 *
 * - the record commits to the exact off-chain attestation envelope via a
 *   keccak256 digest, and HCS gives that envelope a consensus timestamp;
 * - the contract re-reads Pyth itself at registration time and refuses the
 *   record unless the observation matches on exponent, publish time and value;
 * - the accepted deviation and price age are stored alongside the record, so the
 *   margin a registration was allowed is auditable after the fact.
 *
 * ## What is deliberately not here
 *
 * - No token transfers. The registry is permissioned by authorised registrants
 *   and records intent; custody stays with HTS.
 * - No ERC-20 surface. Hedera tokens are HTS, addressed by `0.0.x` and reachable
 *   from the EVM as a long-zero address, so an ERC-20 wrapper would be a
 *   compatibility shim with no users.
 * - No price aggregation. Pyth publishes one observation per feed; this contract
 *   compares against it and does not try to be smarter than the oracle.
 *
 * ## Ordering of checks
 *
 * `recordIssuance` runs cheap local checks first (authorisation, empty inputs,
 * duplicates) and only then reads the oracle, so an unauthorised caller cannot
 * use the oracle as a free query endpoint. Within the policy checks the order
 * matches `evaluateAttestation` in the shared package exactly — zero units, exponent,
 * publish time, positivity, deviation, freshness — and
 * `test/PricedAssetRegistry.test.ts` asserts the two implementations agree,
 * including the rounding of the basis-point comparison.
 */
contract PricedAssetRegistry {
    /* ----------------------------------------------------------------------- */
    /*                                  Types                                  */
    /* ----------------------------------------------------------------------- */

    /// @notice A Pyth price observation, word for word as the oracle returns it.
    struct Observation {
        int64 price;
        int64 conf;
        int32 expo;
        uint32 publishTime;
    }

    /// @notice A recorded issuance and the oracle observation that priced it.
    struct IssuanceRecord {
        /// @dev keccak256 of the canonical attestation envelope published over HCS.
        bytes32 attestationHash;
        /// @dev Pyth feed id the attestation was built from.
        bytes32 feedId;
        /// @dev EVM address of the HTS token (`0.0.x` rendered as long-zero hex).
        address assetToken;
        /// @dev Account that submitted the registration.
        address registrant;
        /// @dev Units minted, in base units.
        uint256 units;
        /// @dev The live observation the contract itself read and accepted.
        Observation observed;
        /// @dev Deviation between the attested and live prices, in basis points.
        uint16 deviationBps;
        /// @dev Age of the live observation at registration, in seconds.
        uint64 priceAgeSeconds;
        /// @dev Block timestamp of the registration.
        uint32 recordedAt;
    }

    /* ----------------------------------------------------------------------- */
    /*                                  Errors                                 */
    /* ----------------------------------------------------------------------- */

    error NotOwner(address caller);
    error NotAuthorised(address caller);
    error ZeroAddress();
    error EmptyAttestationHash();
    error ZeroUnits();
    error AlreadyRecorded(bytes32 recordId);
    error ExpoMismatch(bytes32 feedId, int32 attested, int32 live);
    error PublishTimeMismatch(bytes32 feedId, uint32 attested, uint32 live);
    error NonPositivePrice(bytes32 feedId, int64 price);
    error DeviationTooHigh(uint16 deviationBps, uint16 maxDeviationBps);
    error PriceStale(uint64 ageSeconds, uint64 maxPriceAgeSeconds);
    error PolicyOutOfRange(uint16 maxDeviationBps, uint64 maxPriceAgeSeconds);
    error ExponentOutOfRange(int32 expo);

    /* ----------------------------------------------------------------------- */
    /*                                  Events                                 */
    /* ----------------------------------------------------------------------- */

    event RegistrantUpdated(address indexed account, bool authorized);
    event PolicyUpdated(uint16 maxDeviationBps, uint64 maxPriceAgeSeconds);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /**
     * @notice Emitted for every accepted issuance.
     * @dev The observation is included in full rather than only its digest: the
     *      whole point of the record is that a third party can re-derive the
     *      comparison from event data alone, without an RPC round trip.
     */
    event IssuanceRecorded(
        bytes32 indexed recordId,
        bytes32 indexed attestationHash,
        bytes32 indexed feedId,
        address assetToken,
        address registrant,
        uint256 units,
        int64 price,
        int64 conf,
        int32 expo,
        uint32 publishTime,
        uint16 deviationBps,
        uint64 priceAgeSeconds
    );

    /* ----------------------------------------------------------------------- */
    /*                                Constants                                */
    /* ----------------------------------------------------------------------- */

    /// @notice Basis-point denominator: 1 bp = 0.01%.
    uint256 public constant BPS_DENOMINATOR = 10_000;

    /// @notice Hard ceiling on the deviation policy, so a mis-set value cannot disable the check.
    uint16 public constant MAX_ALLOWED_DEVIATION_BPS = 1_000;

    /// @notice Hard ceiling on the freshness policy (ten years, spelled out because `years` is deprecated).
    uint64 public constant MAX_ALLOWED_MAX_PRICE_AGE_SECONDS = 365 days * 10;

    /// @notice Exponent range accepted by the pricing helpers.
    int32 public constant MIN_PRICE_EXPONENT = -18;
    int32 public constant MAX_PRICE_EXPONENT = 18;

    /* ----------------------------------------------------------------------- */
    /*                                 Storage                                 */
    /* ----------------------------------------------------------------------- */

    address public owner;

    /// @dev Immutable: the oracle a record was accepted against is part of what a record means.
    IPythOracle public immutable oracle;

    uint16 public maxDeviationBps;
    uint64 public maxPriceAgeSeconds;

    mapping(address account => bool authorized) public authorizedRegistrants;

    mapping(bytes32 recordId => IssuanceRecord record) private _records;
    bytes32[] private _recordIds;

    /* ----------------------------------------------------------------------- */
    /*                               Constructor                               */
    /* ----------------------------------------------------------------------- */

    constructor(IPythOracle oracle_, uint16 maxDeviationBps_, uint64 maxPriceAgeSeconds_) {
        if (address(oracle_) == address(0)) revert ZeroAddress();
        if (maxDeviationBps_ > MAX_ALLOWED_DEVIATION_BPS || maxPriceAgeSeconds_ > MAX_ALLOWED_MAX_PRICE_AGE_SECONDS) {
            revert PolicyOutOfRange(maxDeviationBps_, maxPriceAgeSeconds_);
        }

        oracle = oracle_;
        maxDeviationBps = maxDeviationBps_;
        maxPriceAgeSeconds = maxPriceAgeSeconds_;
        owner = msg.sender;

        emit OwnershipTransferred(address(0), msg.sender);
    }

    /* ----------------------------------------------------------------------- */
    /*                               Permissions                               */
    /* ----------------------------------------------------------------------- */

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner(msg.sender);
        _;
    }

    /**
     * @notice Grants or revokes registration rights.
     * @dev Permissioned on purpose: the registry is an institutional record, and an
     *      open door would let anyone flood it with attestations of assets they did
     *      not create. The owner is always authorised.
     */
    function setRegistrant(address account, bool authorized) external onlyOwner {
        if (account == address(0)) revert ZeroAddress();
        authorizedRegistrants[account] = authorized;
        emit RegistrantUpdated(account, authorized);
    }

    /**
     * @notice Tightens or widens the acceptance policy.
     * @dev Both bounds are hard-capped, so a mistake here cannot silently remove
     *      the protection the registry exists to provide.
     */
    function setPolicy(uint16 maxDeviationBps_, uint64 maxPriceAgeSeconds_) external onlyOwner {
        if (maxDeviationBps_ > MAX_ALLOWED_DEVIATION_BPS || maxPriceAgeSeconds_ > MAX_ALLOWED_MAX_PRICE_AGE_SECONDS) {
            revert PolicyOutOfRange(maxDeviationBps_, maxPriceAgeSeconds_);
        }
        maxDeviationBps = maxDeviationBps_;
        maxPriceAgeSeconds = maxPriceAgeSeconds_;
        emit PolicyUpdated(maxDeviationBps_, maxPriceAgeSeconds_);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// @notice True when `account` may record issuances. The owner always may.
    function isAuthorized(address account) public view returns (bool) {
        return account == owner || authorizedRegistrants[account];
    }

    /* ----------------------------------------------------------------------- */
    /*                              Price reading                              */
    /* ----------------------------------------------------------------------- */

    /// @notice Reads the oracle directly, so the caller cannot be fed a stale cached value.
    function livePrice(bytes32 feedId) public view returns (Observation memory observation) {
        (observation.price, observation.conf, observation.expo, observation.publishTime) = oracle.getPriceUnsafe(
            feedId
        );
    }

    /**
     * @notice Deviation between two mantissas that share an exponent, in basis points.
     * @dev Rounded half-up, matching `assessDeviation` in the shared package exactly.
     *
     *      The comparison the registry makes is therefore against a *rounded*
     *      basis-point figure, which means the effective bound is
     *      `maxDeviationBps +/- 0.5` bp. That is deliberate and asserted by tests:
     *      the same rounding on both sides is what keeps the off-chain preview and
     *      the on-chain verdict from disagreeing at the boundary.
     */
    function deviationBpsOf(int64 attested, int64 live) public pure returns (uint16) {
        if (live <= 0) return type(uint16).max;

        // Both prices share an exponent (checked separately), so the mantissa
        // difference is the value difference.
        uint256 difference =
            attested > live ? uint256(int256(attested) - int256(live)) : uint256(int256(live) - int256(attested));
        uint256 referencePrice = uint256(int256(live));
        uint256 rounded = (difference * BPS_DENOMINATOR + referencePrice / 2) / referencePrice;

        return rounded > type(uint16).max ? type(uint16).max : uint16(rounded);
    }

    /* ----------------------------------------------------------------------- */
    /*                             Price simulation                            */
    /* ----------------------------------------------------------------------- */

    /**
     * @notice Runs the acceptance policy without recording anything.
     * @dev Returns the custom-error selector that `recordIssuance` would revert
     *      with, or `bytes4(0)` when the attestation would be accepted. The UI
     *      calls this before signing, so a doomed transaction is explained instead
     *      of mined and reverted.
     * @param feedId Pyth feed id.
     * @param units Units the registration would carry, so the zero-units rule is
     *        covered too. Without this argument a simulation could answer
     *        "acceptable" for a registration that `recordIssuance` then rejects,
     *        which is the one outcome a preview must never produce.
     * @param attested The observation the off-chain attestation was built from.
     */
    function checkAttestation(
        bytes32 feedId,
        uint256 units,
        Observation memory attested
    ) external view returns (bool acceptable, bytes4 reason) {
        // Calls the strict version through a staticcall so the *exact* revert the
        // real transaction would produce can be read as data instead of thrown.
        // Duplicating the policy here would guarantee the preview drifts from the
        // verdict the first time one of them is edited.
        try this.checkAttestationStrict(feedId, units, attested) returns (bool) {
            return (true, bytes4(0));
        } catch (bytes memory revertData) {
            if (revertData.length < 4) return (false, bytes4(0));
            return (false, bytes4(revertData));
        }
    }

    /**
     * @notice Runs the acceptance policy and reverts on failure.
     * @dev The single definition of the policy, shared with `recordIssuance`. Exposed
     *      so a client can get the full revert data (with the mismatched values) rather
     *      than only the selector.
     */
    function checkAttestationStrict(
        bytes32 feedId,
        uint256 units,
        Observation memory attested
    ) external view returns (bool) {
        if (units == 0) revert ZeroUnits();
        _enforcePolicy(feedId, attested, livePrice(feedId));
        return true;
    }

    /* ----------------------------------------------------------------------- */
    /*                                Recording                                */
    /* ----------------------------------------------------------------------- */

    /**
     * @notice Records an issuance and the oracle observation it was priced at.
     * @param feedId Pyth feed id the attestation used.
     * @param attestationHash keccak256 of the canonical attestation envelope.
     * @param assetToken EVM address of the HTS token.
     * @param units Units minted, in base units.
     * @param attested Observation read off-chain when the attestation was built.
     * @return recordId The attestation hash itself, which is already a unique
     *         content address. It is not hashed again: callers derive it off-chain
     *         from the HCS payload, so the lookup key and the verified digest are
     *         the same value and there is nothing to keep in sync.
     */
    function recordIssuance(
        bytes32 feedId,
        bytes32 attestationHash,
        address assetToken,
        uint256 units,
        Observation memory attested
    ) external returns (bytes32 recordId) {
        if (!isAuthorized(msg.sender)) revert NotAuthorised(msg.sender);
        if (attestationHash == bytes32(0)) revert EmptyAttestationHash();
        if (assetToken == address(0)) revert ZeroAddress();
        if (units == 0) revert ZeroUnits();

        recordId = attestationHash;
        if (_records[recordId].attestationHash != bytes32(0)) revert AlreadyRecorded(recordId);

        // From here on the behaviour must match `evaluateAttestation` in the shared package,
        // including which check fires first.
        Observation memory live = livePrice(feedId);
        _enforcePolicy(feedId, attested, live);

        uint16 deviationBps = deviationBpsOf(attested.price, live.price);
        uint64 priceAgeSeconds = _ageSeconds(live.publishTime);

        _records[recordId] = IssuanceRecord({
            attestationHash: attestationHash,
            feedId: feedId,
            assetToken: assetToken,
            registrant: msg.sender,
            units: units,
            observed: live,
            deviationBps: deviationBps,
            priceAgeSeconds: priceAgeSeconds,
            recordedAt: uint32(block.timestamp)
        });
        _recordIds.push(recordId);

        emit IssuanceRecorded(
            recordId,
            attestationHash,
            feedId,
            assetToken,
            msg.sender,
            units,
            live.price,
            live.conf,
            live.expo,
            live.publishTime,
            deviationBps,
            priceAgeSeconds
        );
    }

    /* ----------------------------------------------------------------------- */
    /*                                  Views                                  */
    /* ----------------------------------------------------------------------- */

    function recordOf(bytes32 recordId) external view returns (IssuanceRecord memory) {
        return _records[recordId];
    }

    /// @notice True when an attestation has already been recorded. Used to keep the UI idempotent.
    function hasRecord(bytes32 recordId) external view returns (bool) {
        return _records[recordId].attestationHash != bytes32(0);
    }

    function recordCount() external view returns (uint256) {
        return _recordIds.length;
    }

    /// @notice Record ids in insertion order. Paged rather than returned whole, because the array is unbounded.
    function recordIdAt(uint256 index) external view returns (bytes32) {
        return _recordIds[index];
    }

    /// @notice Current acceptance policy, for display next to the observed price age.
    function policy() external view returns (uint16 deviationBps_, uint64 maxPriceAgeSeconds_) {
        return (maxDeviationBps, maxPriceAgeSeconds);
    }

    /// @notice Pyth's own recommended validity window, read from the oracle rather than hard-coded.
    function oracleValidTimePeriod() external view returns (uint256) {
        return oracle.getValidTimePeriod();
    }

    /* ----------------------------------------------------------------------- */
    /*                              USD valuation                              */
    /* ----------------------------------------------------------------------- */

    /**
     * @notice Price of one unit, scaled to 18 decimals.
     * @dev `price * 10 ** (18 + expo)`. Reverts outside `[-18, 18]` so a misread
     *      exponent cannot silently produce a number of the wrong magnitude.
     */
    function priceE18(bytes32 feedId) public view returns (uint256) {
        Observation memory observation = livePrice(feedId);
        return _scaleE18(uint256(uint64(observation.price)), observation.expo);
    }

    /**
     * @notice USD value of `units` base units of a token with `tokenDecimals` decimals.
     * @dev Valuation, not settlement: the registry does not move value. One 512-bit
     *      `mulDiv` keeps the result exact for supplies far beyond `uint128`.
     */
    function valueOfBaseUnits(bytes32 feedId, uint256 units, uint8 tokenDecimals) external view returns (uint256) {
        Observation memory observation = livePrice(feedId);
        if (observation.price <= 0) revert NonPositivePrice(feedId, observation.price);

        return
            FullPrecisionMath.mulDiv(
                _scaleE18(uint256(uint64(observation.price)), observation.expo),
                units,
                10 ** tokenDecimals
            );
    }

    /* ----------------------------------------------------------------------- */
    /*                               Internals                                 */
    /* ----------------------------------------------------------------------- */

    /**
     * @dev The single definition of the acceptance policy, shared by
     *      `recordIssuance`, `checkAttestation` and `checkAttestationStrict` so the
     *      preview can never drift from the verdict.
     *
     *      The check order is fixed and matches `evaluateAttestation` in the shared package:
     *      exponent, publish time, positivity, deviation, freshness. Exponent first
     *      because a mismatched exponent means the two observations are not comparable
     *      at all, and every comparison below it would be meaningless.
     */
    function _enforcePolicy(bytes32 feedId, Observation memory attested, Observation memory live) private view {
        if (attested.expo != live.expo) revert ExpoMismatch(feedId, attested.expo, live.expo);
        if (attested.publishTime != live.publishTime)
            revert PublishTimeMismatch(feedId, attested.publishTime, live.publishTime);
        if (live.price <= 0 || attested.price <= 0) revert NonPositivePrice(feedId, attested.price);

        uint16 deviationBps = deviationBpsOf(attested.price, live.price);
        if (deviationBps > maxDeviationBps) revert DeviationTooHigh(deviationBps, maxDeviationBps);

        uint64 ageSeconds = _ageSeconds(live.publishTime);
        if (ageSeconds > maxPriceAgeSeconds) revert PriceStale(ageSeconds, maxPriceAgeSeconds);
    }

    /**
     * @dev Age of the observation, in seconds.
     *
     *      A `publishTime` in the future means clock skew or a bad relay, and is
     *      treated as zero age rather than a negative one: a negative age would
     *      satisfy any freshness bound, which is exactly the wrong direction to fail.
     */
    function _ageSeconds(uint32 publishTime) private view returns (uint64) {
        uint256 nowSeconds = block.timestamp;
        return publishTime > nowSeconds ? uint64(0) : uint64(nowSeconds - uint256(publishTime));
    }

    function _scaleE18(uint256 price, int32 expo) private pure returns (uint256) {
        if (expo < MIN_PRICE_EXPONENT || expo > MAX_PRICE_EXPONENT) revert ExponentOutOfRange(expo);

        // `expo >= -18`, so the shift is always upward and stays inside uint256:
        // int64 price (2^63) times 10 ** 36 is about 9.2e54.
        return price * (10 ** uint256(int256(18 + expo)));
    }
}
