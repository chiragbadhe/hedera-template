/**
 * Validation schemas shared by the browser form, the API routes and the CLI.
 *
 * Every schema here is the single source of truth for a rule: the form validates
 * with it, the server re-validates with it, and the tests assert against it. A
 * client-side check that the server does not repeat is not a check.
 */

import { z } from "zod";
import { MAX_TOKEN_NAME_LENGTH, MAX_TOKEN_SYMBOL_LENGTH } from "../constants/registry";
import { HEDERA_NETWORKS } from "../constants/networks";
import { ATTESTATION_SCHEMA, LEDGER_HEDERA } from "../constants/registry";

/**
 * HTS token names: printable ASCII, including internal spaces.
 *
 * Space (0x20) is allowed because HTS names routinely contain words; the
 * restrictions that actually matter are leading/trailing whitespace (removed by
 * `.trim()`) and repeated spaces, which some explorers render as one.
 */
export const tokenNameSchema = z
  .string()
  .trim()
  .min(1, "Token name is required.")
  .max(MAX_TOKEN_NAME_LENGTH, `Token name must be at most ${MAX_TOKEN_NAME_LENGTH} characters.`)
  .regex(/^[\x20-\x7E]+$/, "Token name must be printable ASCII (0x20–0x7E) and must not start or end with a space.")
  .refine((value) => !/ {2,}/.test(value), "Token name must not contain repeated spaces.");

/** HTS token symbols are uppercase letters and digits only. */
export const tokenSymbolSchema = z
  .string()
  .trim()
  .min(1, "Token symbol is required.")
  .max(MAX_TOKEN_SYMBOL_LENGTH, `Token symbol must be at most ${MAX_TOKEN_SYMBOL_LENGTH} characters.`)
  .regex(/^[A-Z0-9]+$/, "Token symbol must be uppercase letters and digits only (A-Z, 0-9).");

export const decimalsSchema = z
  .number()
  .int("Decimals must be a whole number.")
  .min(0, "Decimals cannot be negative.")
  .max(18, "Hedera tokens support at most 18 decimals.");

/** Human-entered amount with no more precision than the token allows. */
export const amountSchema = (decimals: number) =>
  z
    .string()
    .trim()
    .min(1, "Amount is required.")
    .regex(/^\d*(\.\d*)?$/, "Amount must be a positive decimal number.")
    .refine((value) => value !== "." && /\d/.test(value), "Amount must be greater than zero.")
    .refine(
      (value) => {
        const [, fraction = ""] = value.split(".");
        return fraction.length <= decimals;
      },
      {
        message: `This token supports at most ${decimals} decimal places. Reduce the precision — it will not be rounded for you.`,
      },
    );

/** Hedera entity id, `0.0.x`. */
export const entityIdSchema = z
  .string()
  .trim()
  .regex(/^\d+\.\d+\.\d+$/, "Expected a Hedera entity id such as 0.0.12345.");

/** 32-byte hex, `0x`-prefixed. */
export const hex32Schema = z
  .string()
  .trim()
  .regex(/^0x[0-9a-fA-F]{64}$/, "Expected a 32-byte hex value such as 0x1234…abcd.");

/** 20-byte EVM address, `0x`-prefixed. */
export const addressSchema = z
  .string()
  .trim()
  .regex(/^0x[0-9a-fA-F]{40}$/, "Expected an EVM address such as 0x1234…cdef.");

export const networkNameSchema = z.enum(HEDERA_NETWORKS);

/** The reference application's issuance form. */
export const issuanceFormSchema = z.object({
  tokenName: tokenNameSchema,
  tokenSymbol: tokenSymbolSchema,
  decimals: decimalsSchema.default(6),
  supply: amountSchema(18).describe("Total supply in whole token units, before decimals are applied."),
  memo: z
    .string()
    .trim()
    .max(100, "Memo must be at most 100 characters.")
    .regex(/^[\x20-\x7E]*$/, "Memo must be printable ASCII.")
    .optional()
    .or(z.literal("")),
});

export type IssuanceFormValues = z.infer<typeof issuanceFormSchema>;

/**
 * Canonical attestation envelope, validated whenever a payload arrives from HCS
 * or from a user-supplied paste. Unknown schema tags are rejected outright rather
 * than coerced, so an old verifier can never "succeed" against a newer envelope.
 */
export const attestationEnvelopeSchema = z.object({
  schema: z.literal(ATTESTATION_SCHEMA),
  ledger: z.literal(LEDGER_HEDERA),
  network: z.string().min(1),
  asset: z.object({
    tokenId: entityIdSchema,
    tokenAddress: addressSchema,
    name: z.string().min(1),
    symbol: tokenSymbolSchema,
    decimals: decimalsSchema,
  }),
  issuance: z.object({
    units: z.string().regex(/^\d+$/, "Units must be a non-negative integer string."),
    txId: z.string().trim().min(1, "Issuance transaction id is required."),
  }),
  pricing: z.object({
    oracle: z.literal("pyth"),
    oracleAddress: addressSchema,
    feedId: hex32Schema,
    feedSymbol: z.string().min(1),
    priceMantissa: z.string().regex(/^-?\d+$/),
    confidenceMantissa: z.string().regex(/^\d+$/),
    exponent: z.number().int().min(-30).max(30),
    publishTime: z.number().int().nonnegative(),
    validTimePeriodSeconds: z.number().int().nonnegative(),
    priceUsd: z.string().regex(/^-?\d+(\.\d+)?$/),
  }),
  registry: z.object({
    contractAddress: addressSchema,
    contractId: entityIdSchema,
    maxDeviationBps: z.number().int().nonnegative(),
    observedDeviationBps: z.number().int().nonnegative(),
    observedPriceAgeSeconds: z.number().int().nonnegative(),
  }),
});

export type ParsedAttestationEnvelope = z.infer<typeof attestationEnvelopeSchema>;

/** Input to the `/verify` screen and the `registry:verify` CLI script. */
export const verificationRequestSchema = z.object({
  /** Either an HCS topic to replay, or a transaction id to look up. */
  topicId: entityIdSchema.optional(),
  txId: z
    .string()
    .trim()
    .regex(/^\d+\.\d+\.\d+@\d+\.\d+$/, "Expected a transaction id such as 0.0.1234@1700000000.123456789.")
    .optional(),
});

export type VerificationRequest = z.infer<typeof verificationRequestSchema>;

/** Collapses a Zod error into a single-line, human-readable string. */
export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "value";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}
