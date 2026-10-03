import { NextResponse } from "next/server";
import { prepareAttestation } from "@/services/envelope";
import { publishAttestation, reserveTransactionId } from "@/services/hcs";
import { recordIssuanceOnChain } from "@/services/attestation";
import { describeError } from "@/services/chains";

export async function POST(request: Request) {
  try {
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

    // 1. Reserve real HCS transaction ID
    const txIdResult = reserveTransactionId();
    if (!txIdResult.ok) {
      return NextResponse.json(
        { ok: false, error: `Could not reserve HCS transaction ID: ${txIdResult.error}` },
        { status: 500 },
      );
    }
    const issuanceTxId = txIdResult.value;

    // 2. Build canonical attestation envelope and keccak256 digest
    const prepResult = await prepareAttestation({
      assetToken: assetToken.trim(),
      units: units.trim(),
      issuanceTxId,
    });

    if (!prepResult.ok) {
      return NextResponse.json(
        { ok: false, error: prepResult.error },
        { status: 400 },
      );
    }

    const prepared = prepResult.value;

    // 3. Submit canonical envelope to HCS topic
    const hcsResult = await publishAttestation(prepared, { transactionId: issuanceTxId });
    if (!hcsResult.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: `HCS message submission failed: ${hcsResult.error}`,
          digest: prepared.digest,
        },
        { status: 500 },
      );
    }

    const hcs = hcsResult.value;

    // 4. Record attestation digest on the smart contract registry
    const recordResult = await recordIssuanceOnChain(prepared);
    if (!recordResult.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: `HCS published successfully, but registry contract write failed: ${recordResult.error}`,
          digest: prepared.digest,
          recordId: prepared.digest,
          hcs: {
            topicId: hcs.topicId,
            transactionId: hcs.transactionId,
            sequenceNumber: hcs.sequenceNumber,
            consensusTimestamp: hcs.consensusTimestamp,
            runningHash: hcs.runningHash,
            hashscanUrl: hcs.hashscanUrl,
          },
        },
        { status: 500 },
      );
    }

    const contractRec = recordResult.value;

    return NextResponse.json({
      ok: true,
      digest: prepared.digest,
      recordId: prepared.digest,
      transactionHash: contractRec.transactionHash,
      contractTxHash: contractRec.transactionHash,
      alreadyRecorded: contractRec.alreadyRecorded,
      hcs: {
        topicId: hcs.topicId,
        transactionId: hcs.transactionId,
        sequenceNumber: hcs.sequenceNumber,
        consensusTimestamp: hcs.consensusTimestamp,
        runningHash: hcs.runningHash,
        hashscanUrl: hcs.hashscanUrl,
      },
      priceUsd: prepared.priceUsd,
      units: prepared.units.toString(),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: describeError(error) },
      { status: 500 },
    );
  }
}
