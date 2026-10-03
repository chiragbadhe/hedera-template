"use client";

import { useState } from "react";
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
  Wallet,
  Key,
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
  recordId?: string;
  digest?: string;
  error?: string;
};

export function IssueForm() {
  const { isConnected, address, walletType, targetNetworkConfig } = useWallet();
  const oracle = usePolling(() => apiFetch<OracleRes>("/api/oracle"), 10_000);

  const [assetToken, setAssetToken] = useState("0.0.54321");
  const [units, setUnits] = useState("1000");
  const [signingMethod, setSigningMethod] = useState<"wallet" | "operator">("wallet");

  const [txStep, setTxStep] = useState<"idle" | "preparing" | "awaiting" | "submitting" | "confirmed" | "failed">("idle");
  const [txError, setTxError] = useState<string | null>(null);
  const [txResult, setTxResult] = useState<AttestSubmitRes | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setTxStep("preparing");
      setTxError(null);
      setTxResult(null);

      // Step 1: Prepare & Simulate
      await new Promise((r) => setTimeout(r, 600));

      setTxStep("awaiting");

      // Step 2: Submit attestation via API endpoint
      const res = await apiFetch<AttestSubmitRes>("/api/attest", {
        method: "POST",
        body: JSON.stringify({
          assetToken,
          units,
          signingMethod,
          userAddress: address,
        }),
      });

      if (!res.ok) {
        setTxStep("failed");
        setTxError(res.error || "Transaction submission failed.");
        return;
      }

      setTxStep("confirmed");
      setTxResult(res);
    } catch (err) {
      setTxStep("failed");
      setTxError(err instanceof Error ? err.message : "Unknown error occurred.");
    }
  }

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
              Stamp an HTS token reference with a Pyth observation and compute an attestation digest
            </p>
          </div>
        </div>

        {/* Live Oracle Price Badge */}
        {oracle.data?.ok && oracle.data.value && (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-emerald-400" />
              <div>
                <span className="font-semibold text-white">Live Oracle Feed:</span>{" "}
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
              <span className="text-[11px] text-neutral-500 font-normal">HTS Entity ID or Hex</span>
            </label>
            <input
              type="text"
              required
              value={assetToken}
              onChange={(e) => setAssetToken(e.target.value)}
              placeholder="e.g. 0.0.54321"
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

          {/* Form Field 3: Signing Method */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-neutral-300">Wallet Signing Mode</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSigningMethod("wallet")}
                className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${
                  signingMethod === "wallet"
                    ? "border-indigo-500 bg-indigo-500/10 text-white"
                    : "border-neutral-800 bg-neutral-950/60 text-neutral-400 hover:border-neutral-700"
                }`}
              >
                <Wallet className="h-4 w-4 text-indigo-400 shrink-0" />
                <div>
                  <div className="text-xs font-semibold">User Connected Wallet</div>
                  <div className="text-[10px] text-neutral-400">
                    {isConnected ? walletType : "Connect wallet above"}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSigningMethod("operator")}
                className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${
                  signingMethod === "operator"
                    ? "border-indigo-500 bg-indigo-500/10 text-white"
                    : "border-neutral-800 bg-neutral-950/60 text-neutral-400 hover:border-neutral-700"
                }`}
              >
                <Key className="h-4 w-4 text-emerald-400 shrink-0" />
                <div>
                  <div className="text-xs font-semibold">Server Operator Key</div>
                  <div className="text-[10px] text-neutral-400">Automated attestation agent</div>
                </div>
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={txStep === "preparing" || txStep === "awaiting" || txStep === "submitting"}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-xs font-semibold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 active:scale-98 transition disabled:opacity-50"
          >
            {txStep === "preparing" || txStep === "awaiting" || txStep === "submitting" ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Processing Attestation...</span>
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
            <div className="text-xs font-semibold text-white border-b border-neutral-800 pb-2">
              Transaction Lifecycle Progress
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3 text-xs">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    txStep === "preparing"
                      ? "bg-indigo-400 animate-ping"
                      : txStep === "confirmed"
                        ? "bg-emerald-400"
                        : "bg-neutral-600"
                  }`}
                />
                <span className={txStep === "preparing" ? "text-white font-medium" : "text-neutral-400"}>
                  1. Evaluating attestation policy &amp; keccak256 digest
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    txStep === "awaiting"
                      ? "bg-indigo-400 animate-ping"
                      : txStep === "confirmed"
                        ? "bg-emerald-400"
                        : "bg-neutral-600"
                  }`}
                />
                <span className={txStep === "awaiting" ? "text-white font-medium" : "text-neutral-400"}>
                  2. Awaiting signature confirmation
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    txStep === "confirmed" ? "bg-emerald-400" : txStep === "failed" ? "bg-red-500" : "bg-neutral-600"
                  }`}
                />
                <span className={txStep === "confirmed" ? "text-emerald-400 font-medium" : "text-neutral-400"}>
                  3. Digest prepared (HCS publish / registry write not yet wired)
                </span>
              </div>
            </div>

            {txError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">Attestation Rejection</div>
                  <p className="mt-0.5">{txError}</p>
                </div>
              </div>
            )}

            {txResult && txResult.ok && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs space-y-2">
                <div className="flex items-center gap-2 text-emerald-300 font-semibold">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  Attestation digest ready (preview — not broadcast)
                </div>
                {txResult.recordId && (
                  <div className="font-mono text-neutral-300 text-[11px] break-all">
                    Record ID: {txResult.recordId}
                  </div>
                )}
                <div className="pt-2">
                  <a
                    href={`${targetNetworkConfig.explorerUrl}/transaction/${txResult.transactionHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-300 hover:text-white transition"
                  >
                    View Transaction on HashScan
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
