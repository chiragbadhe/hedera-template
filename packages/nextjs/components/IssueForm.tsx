"use client";

import { useState } from "react";
import Link from "next/link";
import { useWallet } from "~~/hooks/useWallet";
import { usePolling } from "~~/hooks/usePolling";
import { apiFetch } from "~~/utils/api";
import {
  ShieldCheck,
  Zap,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  RefreshCw,
  Key,
  Copy,
  Check,
} from "lucide-react";

type OracleRes = {
  ok: boolean;
  value?: {
    feedSymbol: string;
    priceUsd: string;
    confidenceUsd: string;
    feedId: string;
    oracleAddress: string;
    freshness: { ageSeconds: number; maxAgeSeconds: number; stale: boolean };
    readOnly: boolean;
  };
  error?: string;
};

type AttestSubmitRes = {
  ok: boolean;
  transactionHash?: string;
  contractTxHash?: string;
  recordId?: string;
  digest?: string;
  alreadyRecorded?: boolean;
  hcs?: {
    topicId: string;
    transactionId: string;
    sequenceNumber: string | null;
    consensusTimestamp: string | null;
    runningHash: string | null;
    hashscanUrl: string | null;
  };
  priceUsd?: string;
  error?: string;
};

export function IssueForm() {
  const { targetNetworkConfig, activeNetwork } = useWallet();
  const oracle = usePolling(() => apiFetch<OracleRes>("/api/oracle"), 10_000);
  const serverConfig = usePolling(
    () => apiFetch<{ public?: Record<string, string>; operatorAccountId?: string | null }>("/api/config"),
    60_000,
  );

  const [assetToken, setAssetToken] = useState("0.0.10836302");
  const [units, setUnits] = useState("1000");

  const [txStep, setTxStep] = useState<
    "idle" | "evaluating" | "publishing_hcs" | "recording_contract" | "confirmed" | "failed"
  >("idle");
  const [txError, setTxError] = useState<string | null>(null);
  const [txResult, setTxResult] = useState<AttestSubmitRes | null>(null);
  const [copied, setCopied] = useState(false);

  const operatorAccountId = serverConfig.data?.operatorAccountId ?? "0.0.10828689";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setTxStep("evaluating");
      setTxError(null);
      setTxResult(null);

      // Step 1: Evaluating attestation policy & building envelope
      await new Promise((r) => setTimeout(r, 400));

      setTxStep("publishing_hcs");

      // Step 2: Submit attestation via API endpoint
      const res = await apiFetch<AttestSubmitRes>("/api/attest", {
        method: "POST",
        body: JSON.stringify({
          assetToken,
          units,
          signingMethod: "operator",
        }),
      });

      if (!res.ok) {
        setTxStep("failed");
        setTxError(res.error || "Transaction submission failed.");
        if (res.hcs || res.digest) {
          setTxResult(res);
        }
        return;
      }

      setTxStep("confirmed");
      setTxResult(res);
    } catch (err) {
      setTxStep("failed");
      setTxError(err instanceof Error ? err.message : "Unknown error occurred.");
    }
  }

  const handleCopyDigest = () => {
    if (txResult?.digest) {
      navigator.clipboard.writeText(txResult.digest);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6 md:p-8 backdrop-blur-sm shadow-xl space-y-6">
        <div className="flex items-center gap-3 border-b border-neutral-800 pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Issue &amp; Stamp Asset Record</h1>
            <p className="text-xs text-neutral-400">
              Stamp an HTS token reference with Pyth oracle pricing, publish to HCS &amp; record in the smart contract registry
            </p>
          </div>
        </div>

        {/* Live Oracle Price Badge */}
        {oracle.data?.ok && oracle.data.value && (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-emerald-400" />
              <div>
                <span className="font-semibold text-white">Live Pyth Oracle Feed:</span>{" "}
                <span className="text-emerald-300 font-mono font-bold">${oracle.data.value.priceUsd} USD</span>
              </div>
            </div>
            <span className="text-[11px] text-neutral-400">
              Age: {oracle.data.value.freshness.ageSeconds}s
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Form Field 1: Asset Token ID */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-300 flex items-center justify-between">
              <span>Hedera Asset Token ID</span>
              <span className="text-[11px] text-neutral-500 font-normal">HTS Entity ID (0.0.x)</span>
            </label>
            <input
              type="text"
              required
              value={assetToken}
              onChange={(e) => setAssetToken(e.target.value)}
              placeholder="e.g. 0.0.10840780"
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2.5 text-xs text-white font-mono placeholder:text-neutral-600 focus:border-indigo-500 focus:outline-none transition"
            />
          </div>

          {/* Form Field 2: Units */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-300">Base Units Count</label>
            <input
              type="text"
              required
              value={units}
              onChange={(e) => setUnits(e.target.value)}
              placeholder="1000"
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2.5 text-xs text-white font-mono placeholder:text-neutral-600 focus:border-indigo-500 focus:outline-none transition"
            />
          </div>

          {/* Active Signer Info Display Banner */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 flex items-center justify-between">
              <span>Transaction Signer</span>
              <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-mono text-emerald-400">
                Server Operator
              </span>
            </div>

            <div className="flex items-start gap-3 pt-1 text-xs">
              <Key className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-semibold text-white">
                  Operator Account ID:{" "}
                  <span className="font-mono text-emerald-300">{operatorAccountId}</span>
                </div>
                <p className="text-[11px] text-neutral-400 leading-relaxed">
                  Attestation payload and contract write will be signed automatically by the server operator on Hedera {activeNetwork}. Secret credentials remain strictly on the server.
                </p>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={txStep === "evaluating" || txStep === "publishing_hcs" || txStep === "recording_contract"}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-xs font-semibold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 active:scale-98 transition disabled:opacity-50"
          >
            {txStep === "evaluating" || txStep === "publishing_hcs" || txStep === "recording_contract" ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Processing Transaction Lifecycle...</span>
              </>
            ) : (
              <>
                <span>Stamp Asset &amp; Record Attestation</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        {/* Transaction Lifecycle Status Panel */}
        {txStep !== "idle" && (
          <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-5 space-y-4 animate-in fade-in duration-200">
            <div className="text-xs font-semibold text-white border-b border-neutral-800 pb-2 flex items-center justify-between">
              <span>Transaction Lifecycle Execution</span>
              <span className="text-[11px] text-neutral-400 font-mono">Network: {activeNetwork}</span>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3 text-xs">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    txStep === "evaluating"
                      ? "bg-indigo-400 animate-ping"
                      : txStep === "publishing_hcs" || txStep === "recording_contract" || txStep === "confirmed"
                        ? "bg-emerald-400"
                        : "bg-neutral-600"
                  }`}
                />
                <span className={txStep === "evaluating" ? "text-white font-medium" : "text-neutral-400"}>
                  1. Evaluating attestation policy &amp; computing keccak256 digest
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    txStep === "publishing_hcs"
                      ? "bg-indigo-400 animate-ping"
                      : txStep === "recording_contract" || txStep === "confirmed" || (txResult && txResult.hcs)
                        ? "bg-emerald-400"
                        : "bg-neutral-600"
                  }`}
                />
                <span
                  className={
                    txStep === "publishing_hcs"
                      ? "text-white font-medium"
                      : txResult && txResult.hcs
                        ? "text-emerald-400 font-medium"
                        : "text-neutral-400"
                  }
                >
                  2. Publishing canonical envelope to HCS topic
                  {txResult?.hcs?.sequenceNumber && ` (Seq #${txResult.hcs.sequenceNumber})`}
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    txStep === "recording_contract"
                      ? "bg-indigo-400 animate-ping"
                      : txStep === "confirmed"
                        ? "bg-emerald-400"
                        : txStep === "failed" && !txResult?.contractTxHash
                          ? "bg-red-500"
                          : "bg-neutral-600"
                  }`}
                />
                <span className={txStep === "confirmed" ? "text-emerald-400 font-medium" : "text-neutral-400"}>
                  3. Recording attestation digest in smart contract registry
                  {txResult?.alreadyRecorded && " (Already recorded on-chain)"}
                </span>
              </div>
            </div>

            {txError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">Execution Issue</div>
                  <p className="mt-0.5">{txError}</p>
                </div>
              </div>
            )}

            {txResult && txResult.ok && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs space-y-3">
                <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2">
                  <div className="flex items-center gap-2 text-emerald-300 font-semibold text-sm">
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                    Attestation Broadcast &amp; Recorded Successfully
                  </div>
                  {txResult.alreadyRecorded && (
                    <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold text-indigo-300 border border-indigo-500/30">
                      Idempotent Record
                    </span>
                  )}
                </div>

                {/* Digest display */}
                {txResult.digest && (
                  <div className="space-y-1">
                    <div className="text-[11px] font-semibold text-neutral-300 flex items-center justify-between">
                      <span>Attestation Digest (keccak256):</span>
                      <button
                        onClick={handleCopyDigest}
                        className="flex items-center gap-1 text-[10px] text-indigo-300 hover:text-white transition"
                      >
                        {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                        {copied ? "Copied" : "Copy Digest"}
                      </button>
                    </div>
                    <div className="font-mono text-white text-[11px] bg-neutral-900/80 p-2 rounded-lg break-all border border-neutral-800">
                      {txResult.digest}
                    </div>
                  </div>
                )}

                {/* HCS Publication Details */}
                {txResult.hcs && (
                  <div className="space-y-1 pt-1 border-t border-emerald-500/20">
                    <div className="text-[11px] font-semibold text-emerald-300 flex items-center justify-between">
                      <span>HCS Message Details:</span>
                      {txResult.hcs.hashscanUrl && (
                        <a
                          href={txResult.hcs.hashscanUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-300 hover:text-white transition"
                        >
                          View HCS Tx on HashScan
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-neutral-300 bg-neutral-900/50 p-2 rounded-lg border border-neutral-800">
                      <div><span className="text-neutral-500">Topic ID:</span> {txResult.hcs.topicId}</div>
                      <div><span className="text-neutral-500">Sequence #:</span> {txResult.hcs.sequenceNumber ?? "Pending"}</div>
                      <div className="col-span-2 truncate"><span className="text-neutral-500">Tx ID:</span> {txResult.hcs.transactionId}</div>
                      {txResult.hcs.consensusTimestamp && (
                        <div className="col-span-2"><span className="text-neutral-500">Consensus:</span> {txResult.hcs.consensusTimestamp}</div>
                      )}
                    </div>
                  </div>
                )}

                {/* Registry Contract Details */}
                {txResult.contractTxHash && txResult.contractTxHash !== "0x0000000000000000000000000000000000000000000000000000000000000000" && (
                  <div className="space-y-1 pt-1 border-t border-emerald-500/20">
                    <div className="text-[11px] font-semibold text-emerald-300 flex items-center justify-between">
                      <span>Registry Contract Write:</span>
                      <a
                        href={`${targetNetworkConfig.explorerUrl}/transaction/${txResult.contractTxHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-300 hover:text-white transition"
                      >
                        View EVM Tx on HashScan
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                    <div className="font-mono text-white text-[11px] bg-neutral-900/50 p-2 rounded-lg break-all border border-neutral-800">
                      {txResult.contractTxHash}
                    </div>
                  </div>
                )}

                {/* Verification CTA button */}
                {txResult.digest && (
                  <div className="pt-2">
                    <Link
                      href={`/verify?digest=${encodeURIComponent(txResult.digest)}`}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500 transition shadow-md"
                    >
                      <ShieldCheck className="h-4 w-4" />
                      <span>Verify This Attestation Now</span>
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
