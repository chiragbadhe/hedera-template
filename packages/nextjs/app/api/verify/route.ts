/**
 * `/api/verify` — independent verification of an attestation digest.
 *
 * Expects JSON with a `digest` field and optional `topicId` and `network`. The result
 * is the full `VerificationOutcome` the UI renders: every check, links, and the
 * recovered attestation when found.
 */

import { NextResponse } from "next/server";
import { verifyAttestation } from "@/services/attestation";
import { isHex32 } from "@sh/shared";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "The request body must be valid JSON." }, { status: 400 });
  }

  const input = body as { digest?: string; topicId?: string };
  const digest = typeof input.digest === "string" ? input.digest.trim() : "";
  if (!isHex32(digest)) {
    return NextResponse.json({ error: `"${digest}" is not a 32-byte 0x-prefixed digest.` }, { status: 400 });
  }

  const outcome = await verifyAttestation(digest, { topicId: input.topicId });
  return NextResponse.json(outcome);
}
