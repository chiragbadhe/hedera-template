"use client";

import { useWallet } from "~~/hooks/useWallet";
import { ExternalLink, ShieldCheck, Terminal, Cpu } from "lucide-react";

export function Footer() {
  const { targetNetworkConfig } = useWallet();

  return (
    <footer className="w-full border-t border-neutral-800 bg-neutral-950 py-8 text-xs text-neutral-400">
      <div className="container mx-auto px-4 grid gap-8 md:grid-cols-4">
        {/* Col 1: Project info */}
        <div className="space-y-2">
          <div className="font-semibold text-white flex items-center gap-2">
            <Cpu className="h-4 w-4 text-indigo-400" />
            Scaffold-HBAR Template
          </div>
          <p className="text-neutral-400 leading-relaxed text-[11px]">
            Production-grade starter template for Hedera: Pyth Oracle price feeds, HCS consensus attestations, and Mirror Node verification.
          </p>
        </div>

        {/* Col 2: Hedera Endpoints */}
        <div className="space-y-2">
          <div className="font-semibold text-white">Active Infrastructure</div>
          <ul className="space-y-1 text-[11px]">
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>Network: {targetNetworkConfig.name}</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
              <span>Chain ID: {targetNetworkConfig.chainId}</span>
            </li>
            <li className="truncate">
              RPC: <span className="font-mono text-neutral-300">{targetNetworkConfig.rpcUrl}</span>
            </li>
          </ul>
        </div>

        {/* Col 3: Useful Links */}
        <div className="space-y-2">
          <div className="font-semibold text-white">Developer Resources</div>
          <ul className="space-y-1 text-[11px]">
            <li>
              <a
                href={targetNetworkConfig.explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white flex items-center gap-1 transition"
              >
                <ExternalLink className="h-3 w-3 text-neutral-500" />
                HashScan Explorer
              </a>
            </li>
            <li>
              <a
                href="https://docs.hedera.com"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white flex items-center gap-1 transition"
              >
                <ExternalLink className="h-3 w-3 text-neutral-500" />
                Hedera Documentation
              </a>
            </li>
            <li>
              <a
                href="https://docs.pyth.network"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white flex items-center gap-1 transition"
              >
                <ExternalLink className="h-3 w-3 text-neutral-500" />
                Pyth Network Docs
              </a>
            </li>
          </ul>
        </div>

        {/* Col 4: Status */}
        <div className="space-y-2">
          <div className="font-semibold text-white">Verification Engine</div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 text-[11px]">
            <div className="flex items-center gap-2 text-emerald-400 font-medium mb-1">
              <ShieldCheck className="h-3.5 w-3.5" />
              Mirror Node Sync Active
            </div>
            <p className="text-neutral-400">
              Canonical attestation digests verified via keccak256 off-chain and EVM contract on-chain.
            </p>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 mt-8 pt-4 border-t border-neutral-900 text-center text-[11px] text-neutral-500 flex flex-col md:flex-row items-center justify-between gap-2">
        <div>MIT Licensed — Scaffold-HBAR Priced Asset Registry</div>
        <div className="flex items-center gap-1">
          <Terminal className="h-3 w-3" />
          <span>TypeScript strict &bull; Next.js 15 &bull; Hedera SDK 2.89</span>
        </div>
      </div>
    </footer>
  );
}
