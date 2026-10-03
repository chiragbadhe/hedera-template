import { NextResponse } from "next/server";
import { readOracleSnapshot } from "@/services/oracle";
import { checkAttestationPolicy } from "@/services/attestation";
import { digestOf, HBAR_USD_FEED_ID } from "@sh/shared";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON request body." }, { status: 400 });
  }

  const { assetToken, units } = body as {
    assetToken?: string;
    units?: string;
    signingMethod?: string;
    userAddress?: string;
  };

  if (!assetToken || !units) {
    return NextResponse.json(
      { ok: false, error: "Both assetToken and units are required fields." },
      { status: 400 },
    );
  }

  const snapshotResult = await readOracleSnapshot(HBAR_USD_FEED_ID);
  if (!snapshotResult.ok || !snapshotResult.value) {
    const errorMsg = !snapshotResult.ok ? snapshotResult.error : "Oracle snapshot unavailable";
    return NextResponse.json(
      { ok: false, error: `Oracle read failed: ${errorMsg}` },
      { status: 500 },
    );
  }

  const oraclePrice = snapshotResult.value.price;
  const policyVerdict = await checkAttestationPolicy(oraclePrice, units);

  if (!policyVerdict.contractAccepted) {
    return NextResponse.json({
      ok: false,
      error: `Contract policy rejected attestation: ${policyVerdict.contractRejection || "policy mismatch"}`,
    });
  }

  // Derive attestation digest
  const digest = digestOf({
    feedId: HBAR_USD_FEED_ID,
    assetToken,
    units,
    observedPrice: oraclePrice,
  });

  const mockTxHash = `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`;

  return NextResponse.json({
    ok: true,
    transactionHash: mockTxHash,
    recordId: digest,
    digest,
    priceUsd: snapshotResult.value.priceUsd,
  });
}
