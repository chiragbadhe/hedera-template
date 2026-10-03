"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "~~/utils/api";
import {
  Search,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  RefreshCw,
  Copy,
  Check,
} from "lucide-react";

type VerificationCheck = {
  label: string;
  status: "pass" | "fail" | "skipped";
  detail: string;
  url?: string;
};

type VerifyRes = {
  status: "verified" | "mismatch" | "unavailable" | "not-found";
  subject: string;
  checkedAt: number;
  checks: VerificationCheck[];
  error?: string;
};

const SAMPLE_DIGESTS = [
  {
    label: "Sample 1 (Zero Digest Test)",
    digest: "0x0000000000000000000000000000000000000000000000000000000000000001",
  },
  {
    label: "Sample 2 (Testnet Attestation Digest)",
    digest: "0xa1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0",
  },
];

export function VerifyForm() {
  const searchParams = useSearchParams();
  const initialDigest = searchParams.get("digest") || "";

  const [digest, setDigest] = useState(initialDigest);
  const [result, setResult] = useState<VerifyRes | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (initialDigest && initialDigest.startsWith("0x")) {
      runVerification(initialDigest);
    }
  }, [initialDigest]);

  async function runVerification(targetDigest: string) {
    try {
      setLoading(true);
      setError(null);
      setResult(null);

      const res = await apiFetch<VerifyRes>("/api/verify", {
        method: "POST",
        body: JSON.stringify({ digest: targetDigest }),
      });

      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification request failed.");
    } finally {
      setLoading(false);
    }
  }

  const handleCopy = () => {
    if (digest) {
      navigator.clipboard.writeText(digest);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6 md:p-8 backdrop-blur-sm shadow-xl space-y-6">
        <div className="flex items-center gap-3 border-b border-neutral-800 pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Attestation Digest Verifier</h1>
            <p className="text-xs text-neutral-400">
              Independently verify off-chain HCS payloads against EVM contract state and Mirror Nodes
            </p>
          </div>
        </div>

        {/* Input & Quick Fill Section */}
        <div className="space-y-3">
          <label className="text-xs font-semibold text-neutral-300 flex items-center justify-between">
            <span>Attestation Digest (0x + 64 hex characters)</span>
            <span className="text-[11px] text-neutral-500 font-mono">keccak256 hash</span>
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-neutral-500" />
              <input
                type="text"
                value={digest}
                onChange={(e) => setDigest(e.target.value)}
                placeholder="0x..."
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 pl-9 pr-10 py-2.5 text-xs text-white font-mono placeholder:text-neutral-600 focus:border-indigo-500 focus:outline-none transition"
              />
              {digest && (
                <button onClick={handleCopy} className="absolute right-3 top-2.5 p-1 text-neutral-400 hover:text-white">
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
            <button
              onClick={() => runVerification(digest)}
              disabled={loading || !digest.startsWith("0x") || digest.length < 10}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 transition shrink-0"
            >
              {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Verify Digest"}
            </button>
          </div>

          {/* Quick Fill Sample Digests */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-[11px] text-neutral-500 flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-indigo-400" /> Quick test sample:
            </span>
            {SAMPLE_DIGESTS.map((sample, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setDigest(sample.digest);
                  runVerification(sample.digest);
                }}
                className="rounded-lg border border-neutral-800 bg-neutral-950 px-2.5 py-1 text-[11px] font-mono text-neutral-300 hover:border-neutral-700 hover:text-white transition"
              >
                {sample.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-xs text-red-300 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">Verification Request Failed</div>
              <div>{error}</div>
            </div>
          </div>
        )}

        {/* Verification Result Outcome Panel */}
        {result && (
          <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-6 space-y-5 animate-in fade-in duration-200">
            {/* Status Header Badge */}
            <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
              <div className="flex items-center gap-3">
                {result.status === "verified" ? (
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                ) : result.status === "mismatch" ? (
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
                    <XCircle className="h-6 w-6" />
                  </div>
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                    <AlertCircle className="h-6 w-6" />
                  </div>
                )}
                <div>
                  <div className="text-sm font-bold text-white uppercase tracking-wider">
                    Verification Outcome: <span className="font-mono text-indigo-300">{result.status}</span>
                  </div>
                  <div className="text-xs text-neutral-400">
                    Checked at {new Date(result.checkedAt).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            {/* Check Breakdown List */}
            <div className="space-y-3">
              <div className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                Verification Audit Checks
              </div>
              <div className="space-y-2">
                {result.checks.map((c, i) => (
                  <div key={i} className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-white">{c.label}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                          c.status === "pass"
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : c.status === "fail"
                              ? "bg-red-500/10 text-red-400 border border-red-500/20"
                              : "bg-neutral-800 text-neutral-400 border border-neutral-700"
                        }`}
                      >
                        {c.status}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-400 font-mono leading-relaxed">{c.detail}</p>
                    {c.url && (
                      <div className="pt-1">
                        <a
                          href={c.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-indigo-300 hover:text-white transition"
                        >
                          View Evidence on HashScan
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
