// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

/**
 * @title FullPrecisionMath
 * @notice Full-precision fixed-point maths, without an external dependency.
 *
 * Only `mulDiv` is needed, and only because pricing a token supply means
 * `price * units / 10 ** decimals` — a three-way product that overflows `uint256`
 * in an intermediate step long before it overflows mathematically.
 *
 * The obvious alternatives are both worse than this function:
 *
 * - `a * b / denominator` reverts on any large supply, which turns a valuation
 *   into a denial of service;
 * - dividing first and multiplying afterwards is exact-looking but silently
 *   truncates, so a quoted value is wrong by up to one unit in the last place
 *   *and* the error compounds with the supply.
 *
 * This computes `floor(a * b / denominator)` exactly, for any inputs where the
 * mathematical result fits in `uint256`. The approach is the standard one:
 * compute the 512-bit product with `mulmod`, then recover the quotient by
 * computing the modular inverse of the (now odd) denominator with Newton–Raphson
 * iteration, which converges to 256 bits in six doublings.
 *
 * `test/PricedAssetRegistry.test.ts` checks it against an independent `bigint`
 * implementation, including `10 ** 30` base units where the naive form overflows.
 */
library FullPrecisionMath {
    /// @notice Thrown when the divisor is zero, which is never a meaningful division.
    error MathDivisionByZero();

    /**
     * @notice Computes `floor(a * b / denominator)` with full precision.
     * @dev Rounds down. Reverts on a zero denominator, and on a result that does
     *      not fit in `uint256`.
     */
    function mulDiv(uint256 a, uint256 b, uint256 denominator) internal pure returns (uint256 result) {
        if (denominator == 0) revert MathDivisionByZero();

        unchecked {
            // 512-bit product as (prod0 = low 256 bits, prod1 = high 256 bits).
            uint256 prod0;
            uint256 prod1;
            assembly {
                let mm := mulmod(a, b, not(0))
                prod0 := mul(a, b)
                prod1 := sub(sub(mm, prod0), lt(mm, prod0))
            }

            // No high word: the 256-bit product is already the whole number.
            if (prod1 == 0) return prod0 / denominator;

            // The denominator must be larger than the 512-bit product, otherwise
            // the quotient cannot fit in 256 bits.
            require(denominator > prod1, MathOverflow());

            // Subtract the part of the product that is already reduced mod denominator.
            uint256 remainder;
            assembly {
                remainder := mulmod(a, b, denominator)
                prod1 := sub(prod1, gt(remainder, prod0))
                prod0 := sub(prod0, remainder)
            }

            // Factor the powers of two out of the denominator so the modular
            // inverse below operates on an odd number, where it exists.
            uint256 twos = denominator & (~denominator + 1);
            assembly {
                denominator := div(denominator, twos)
                prod0 := div(prod0, twos)
                // Round `twos` up to the next power of two: `2 ** k + 1` style
                // scaling factor that pairs with the cleared low bits.
                twos := add(div(sub(0, twos), twos), 1)
            }
            prod0 |= prod1 * twos;

            // Newton–Raphson: inverse starts as a 3-bit approximation of
            // `denominator ** -1` and doubles in precision each step.
            uint256 inverse = (3 * denominator) ^ 2;
            inverse *= 2 - denominator * inverse; // 8 bits
            inverse *= 2 - denominator * inverse; // 16 bits
            inverse *= 2 - denominator * inverse; // 32 bits
            inverse *= 2 - denominator * inverse; // 64 bits
            inverse *= 2 - denominator * inverse; // 128 bits
            inverse *= 2 - denominator * inverse; // 256 bits

            // Because `denominator` is odd, `prod0` is divisible by 2 ** k, so this
            // is exact rather than an approximation.
            return prod0 * inverse;
        }
    }

    /// @notice Thrown when `floor(a * b / denominator)` exceeds `type(uint256).max`.
    error MathOverflow();
}
