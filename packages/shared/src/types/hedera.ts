/** Hedera transaction lifecycle vocabulary shared by the UI and the CLI. */

/**
 * Who signs a transaction. The UI colours every action by this, and no screen is
 * allowed to present an operator-signed operation as if the user signed it.
 */
export const TX_SIGNERS = ["user", "operator", "none"] as const;

export type TxSigner = (typeof TX_SIGNERS)[number];

/** Coarse lifecycle state. `rejected` is a first-class outcome, not an error. */
export const TX_STATUSES = [
  "idle",
  "awaiting-signature",
  "submitted",
  "pending",
  "succeeded",
  "failed",
  "rejected",
] as const;

export type TxStatus = (typeof TX_STATUSES)[number];

export const TX_STATUS_LABELS: Readonly<Record<TxStatus, string>> = {
  idle: "Not started",
  "awaiting-signature": "Awaiting wallet approval",
  submitted: "Submitted to the network",
  pending: "Waiting for consensus",
  succeeded: "Confirmed",
  failed: "Failed on-chain",
  rejected: "Rejected in wallet",
};

/** True once the transaction has a terminal outcome. */
export function isTerminalStatus(status: TxStatus): boolean {
  return status === "succeeded" || status === "failed" || status === "rejected";
}

/** A reference to a Hedera transaction, with everything needed to verify it later. */
export type TransactionRef = {
  readonly txId: string;
  readonly hashscanUrl: string;
  readonly signer: TxSigner;
  readonly operation: string;
  readonly status: TxStatus;
  readonly consensusTimestamp?: string;
  /** Human-readable reason for `failed` / `rejected`. */
  readonly detail?: string;
};

/** Mirror Node transaction status values that matter to this template. */
export const MIRROR_RESULT_CODES = [
  "SUCCESS",
  "CONTRACT_REVERT_EXECUTED",
  "INSUFFICIENT_TX_FEE",
  "INSUFFICIENT_ACCOUNT_BALANCE",
] as const;

export type MirrorResultCode = (typeof MIRROR_RESULT_CODES)[number];
