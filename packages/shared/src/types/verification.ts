/** Outcome of an independent verification run. */

export const VERIFICATION_STATUSES = ["verified", "mismatch", "unavailable", "not-found"] as const;

export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export type VerificationCheck = {
  readonly label: string;
  readonly status: "pass" | "fail" | "skipped";
  /** Concrete observed value, so a failure is diagnosable without leaving the page. */
  readonly detail: string;
  /** Link to the authoritative source for this check, when one exists. */
  readonly url?: string;
};

export type VerificationReport = {
  readonly status: VerificationStatus;
  /** What was being verified, e.g. the attestation digest or a transaction id. */
  readonly subject: string;
  readonly checks: readonly VerificationCheck[];
  /** Wall-clock time of the run, unix ms. */
  readonly checkedAt: number;
  /** Set when the Mirror Node or relay could not be reached at all. */
  readonly error?: string;
};

/** An HCS attestation message plus the Mirror Node fields that make it verifiable. */
export type VerifiedAttestation = {
  readonly topicId: string;
  readonly sequenceNumber: number;
  readonly consensusTimestamp: string;
  readonly runningHash: string;
  readonly runningHashVersion: number;
  readonly transactionId: string | null;
  readonly hashscanUrl: string;
  readonly payload: unknown;
};
