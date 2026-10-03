"use client";

import { useState } from "react";
import Link from "next/link";
import { usePolling } from "~~/hooks/usePolling";
import { apiFetch } from "~~/utils/api";
import {
  Activity,
  ShieldCheck,
  Search,
  Clock,
  TrendingUp,
  Database,
  ArrowUpRight,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
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
    freshness: { ageSeconds: number; maxAgeSeconds: number; stale: boolean; agePercentOfBound: number };
    readOnly: boolean;
  };
  error?: string;
};

type RegistryRes = {
  policy: {
    address: string;
    maxDeviationBps: number;
    maxPriceAgeSeconds: number;
    owner: string;
    oracle: string;
    oracleValidTimePeriodSeconds: number;
    recordCount: number;
  } | null;
  policyError: string | null;
  records: Array<{
    recordId: string;
    assetToken: string;
    units: string;
    priceUsd: string;
    deviationBps: number;
    recordedAt: number;
  }>;
  recordsError: string | null;
};

export function Dashboard() {
  const oracle = usePolling(() => apiFetch<OracleRes>("/api/oracle"), 10_000);
  const registry = usePolling(() => apiFetch<RegistryRes>("/api/registry"), 5_000);

  const [searchTerm, setSearchTerm] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const records = registry.data?.records || [];
  const filteredRecords = records.filter(
    (r) =>
      r.assetToken.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.recordId.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="space-y-8">
      {/* Top Banner / Hero Summary */}
      <div className="relative overflow-hidden rounded-2xl border border-neutral-800 bg-gradient-to-r from-neutral-900 via-neutral-900/90 to-indigo-950/40 p-6 md:p-8 shadow-2xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300">
              <Activity className="h-3.5 w-3.5" />
              <span>Real-Time Pyth Oracle Price Verification</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
              Priced Asset Registry on Hedera
            </h1>
            <p className="text-sm text-neutral-300 leading-relaxed">
              Read Pyth observations, compute attestation digests under shared policy rules, and verify envelopes against Mirror Node and the on-chain registry. See docs for the current status of HCS publish and recordIssuance.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/issue"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 transition-all"
            >
              <ShieldCheck className="h-4 w-4" />
              <span>Issue &amp; Stamp Asset</span>
            </Link>
            <Link
              href="/verify"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-700 bg-neutral-800/80 px-4 py-2.5 text-xs font-semibold text-neutral-200 hover:bg-neutral-800 hover:text-white transition-all"
            >
              <span>Verify Attestation</span>
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* Grid Section: Live Oracle & Contract Policy */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Live Pyth Oracle Feed Card */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6 backdrop-blur-sm shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-800/80 pb-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <TrendingUp className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">Live Pyth Oracle</h2>
                <p className="text-xs text-neutral-400">Pyth Network Price Feed Observation</p>
              </div>
            </div>
            {oracle.loading ? (
              <RefreshCw className="h-4 w-4 text-neutral-500 animate-spin" />
            ) : (
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </span>
            )}
          </div>

          {oracle.error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-xs text-red-300 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold">Oracle Read Failure</div>
                <div>{oracle.error}</div>
              </div>
            </div>
          )}

          {oracle.data?.ok && oracle.data.value && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
                  <div className="text-xs text-neutral-400 mb-1">Asset Feed</div>
                  <div className="text-lg font-bold text-white flex items-center gap-1.5">
                    {oracle.data.value.feedSymbol}
                  </div>
                </div>

                <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
                  <div className="text-xs text-neutral-400 mb-1">Price (USD)</div>
                  <div className="text-lg font-bold text-emerald-400 font-mono">
                    ${oracle.data.value.priceUsd}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="space-y-1">
                  <span className="text-neutral-400">Confidence Band:</span>
                  <div className="font-mono text-neutral-200">±${oracle.data.value.confidenceUsd}</div>
                </div>
                <div className="space-y-1">
                  <span className="text-neutral-400">Freshness Status:</span>
                  <div className="flex items-center gap-1 font-medium">
                    {oracle.data.value.freshness.stale ? (
                      <span className="text-amber-400 flex items-center gap-1">
                        <AlertCircle className="h-3.5 w-3.5" /> Stale ({oracle.data.value.freshness.ageSeconds}s)
                      </span>
                    ) : (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Fresh ({oracle.data.value.freshness.ageSeconds}s old)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Progress bar of max age */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px] text-neutral-400">
                  <span>Price Age Bound Utilization</span>
                  <span>{oracle.data.value.freshness.ageSeconds}s / {oracle.data.value.freshness.maxAgeSeconds}s</span>
                </div>
                <div className="h-2 w-full rounded-full bg-neutral-800 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      oracle.data.value.freshness.stale ? "bg-amber-500" : "bg-emerald-500"
                    }`}
                    style={{ width: `${Math.min(100, oracle.data.value.freshness.agePercentOfBound)}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Registry Smart Contract Policy Card */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6 backdrop-blur-sm shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-800/80 pb-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                <Database className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">Registry Smart Contract</h2>
                <p className="text-xs text-neutral-400">Solidity Policy &amp; On-Chain State</p>
              </div>
            </div>
            <span className="rounded-full bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-0.5 text-[11px] font-mono text-indigo-300">
              EVM Contract
            </span>
          </div>

          {registry.data?.policyError && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-xs text-red-300 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold">Policy Read Failure</div>
                <div>{registry.data.policyError}</div>
              </div>
            </div>
          )}

          {registry.data?.policy ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
                  <div className="text-xs text-neutral-400 mb-1">Contract Address</div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-white">
                      {registry.data.policy.address.slice(0, 10)}...{registry.data.policy.address.slice(-6)}
                    </span>
                    <button
                      onClick={() => handleCopy(registry.data?.policy?.address || "")}
                      className="text-neutral-400 hover:text-white"
                    >
                      {copiedId && registry.data?.policy?.address && copiedId === registry.data.policy.address ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
                  <div className="text-xs text-neutral-400 mb-1">Total Recorded Assets</div>
                  <div className="text-lg font-bold text-white font-mono">
                    {registry.data.policy.recordCount}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="rounded-xl border border-neutral-800/80 bg-neutral-950/40 p-3 space-y-1">
                  <div className="text-neutral-400">Max Deviation Bound</div>
                  <div className="font-semibold text-white font-mono">
                    {registry.data.policy.maxDeviationBps} BPS ({(registry.data.policy.maxDeviationBps / 100).toFixed(2)}%)
                  </div>
                </div>

                <div className="rounded-xl border border-neutral-800/80 bg-neutral-950/40 p-3 space-y-1">
                  <div className="text-neutral-400">Max Price Age Bound</div>
                  <div className="font-semibold text-white font-mono">
                    {registry.data.policy.maxPriceAgeSeconds} seconds
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-6 text-xs text-neutral-400">Loading policy data...</div>
          )}
        </div>
      </div>

      {/* Section: Asset Records Data Table */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6 backdrop-blur-sm shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Clock className="h-4 w-4 text-indigo-400" />
              Recorded Asset Issuances
            </h2>
            <p className="text-xs text-neutral-400">
              Verified oracle-stamped token records on the Hedera Priced Asset Registry
            </p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-500" />
            <input
              type="text"
              placeholder="Search token or digest..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 pl-9 pr-4 py-2 text-xs text-white placeholder:text-neutral-500 focus:border-indigo-500 focus:outline-none transition"
            />
          </div>
        </div>

        {filteredRecords.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-800 p-8 text-center space-y-3">
            <Database className="mx-auto h-8 w-8 text-neutral-600" />
            <div className="text-sm font-medium text-neutral-300">No Asset Records Found</div>
            <p className="text-xs text-neutral-500 max-w-sm mx-auto">
              {searchTerm ? "No records match your search criteria." : "No assets have been recorded in the registry contract yet."}
            </p>
            <Link
              href="/issue"
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 transition"
            >
              Issue First Asset
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-neutral-800 bg-neutral-950/60 text-[11px] uppercase tracking-wider text-neutral-400">
                <tr>
                  <th className="py-3 px-4">Record ID / Digest</th>
                  <th className="py-3 px-4">Asset Token</th>
                  <th className="py-3 px-4">Units</th>
                  <th className="py-3 px-4">Price (USD)</th>
                  <th className="py-3 px-4">Deviation</th>
                  <th className="py-3 px-4">Recorded At</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60 text-neutral-200">
                {filteredRecords.map((r) => (
                  <tr key={r.recordId} className="hover:bg-neutral-800/40 transition-colors">
                    <td className="py-3 px-4 font-mono font-medium text-indigo-300">
                      {r.recordId.slice(0, 10)}...{r.recordId.slice(-6)}
                    </td>
                    <td className="py-3 px-4 font-mono text-neutral-300">{r.assetToken}</td>
                    <td className="py-3 px-4 font-mono text-neutral-300">{r.units}</td>
                    <td className="py-3 px-4 font-mono text-emerald-400 font-semibold">${r.priceUsd}</td>
                    <td className="py-3 px-4">
                      <span className="rounded bg-neutral-800 px-2 py-0.5 font-mono text-[11px] text-neutral-300">
                        {r.deviationBps} BPS
                      </span>
                    </td>
                    <td className="py-3 px-4 text-neutral-400 text-[11px]">
                      {new Date(r.recordedAt * 1000).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Link
                        href={`/verify?digest=${r.recordId}`}
                        className="inline-flex items-center gap-1 rounded bg-neutral-800 px-2.5 py-1 text-[11px] text-indigo-300 hover:bg-neutral-700 hover:text-white transition"
                      >
                        Verify
                        <ArrowUpRight className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
