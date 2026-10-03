"use client";

import { useState, useRef, useEffect } from "react";
import { useWallet } from "~~/hooks/useWallet";
import { HEDERA_NETWORKS, type NetworkConfig } from "~~/lib/networks";
import type { HederaNetwork } from "@sh/shared";
import { Globe, AlertTriangle, ChevronDown, Check } from "lucide-react";

export function NetworkSelector() {
  const { activeNetwork, switchWalletNetwork, networkMismatch, targetNetworkConfig, walletType } = useWallet();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = async (netKey: HederaNetwork) => {
    setIsOpen(false);
    await switchWalletNetwork(netKey);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
          networkMismatch
            ? "border-amber-500/50 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
            : targetNetworkConfig.isTestnet
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
              : "border-indigo-500/30 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20"
        }`}
      >
        {networkMismatch ? (
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400 animate-pulse" />
        ) : (
          <Globe className="h-3.5 w-3.5 opacity-80" />
        )}
        <span>{targetNetworkConfig.name}</span>
        {networkMismatch && (
          <span className="rounded bg-amber-500/20 px-1 py-0.5 text-[10px] uppercase tracking-wider text-amber-300">
            Wrong Net
          </span>
        )}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 rounded-xl border border-neutral-800 bg-neutral-900/95 p-2 shadow-2xl backdrop-blur-xl z-50 animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="px-2 py-1.5 text-[11px] font-semibold tracking-wider text-neutral-400 uppercase">
            Select Hedera Network
          </div>
          <div className="space-y-1 mt-1">
            {(Object.keys(HEDERA_NETWORKS) as HederaNetwork[]).map((netKey) => {
              const config: NetworkConfig = HEDERA_NETWORKS[netKey];
              const isSelected = activeNetwork === netKey;

              return (
                <button
                  key={netKey}
                  onClick={() => handleSelect(netKey)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                    isSelected
                      ? "bg-neutral-800 text-white font-medium"
                      : "text-neutral-300 hover:bg-neutral-800/60 hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        config.isTestnet ? "bg-emerald-400" : "bg-indigo-400"
                      }`}
                    />
                    <div>
                      <div className="font-medium">{config.name}</div>
                      <div className="text-[10px] text-neutral-400">Chain ID: {config.chainId}</div>
                    </div>
                  </div>
                  {isSelected && <Check className="h-3.5 w-3.5 text-emerald-400" />}
                </button>
              );
            })}
          </div>

          {networkMismatch && walletType === "reown-evm" && (
            <div className="mt-2 border-t border-neutral-800 pt-2 px-1">
              <button
                onClick={() => handleSelect(activeNetwork)}
                className="w-full rounded-lg bg-amber-500/20 px-2 py-1.5 text-center text-xs font-semibold text-amber-300 hover:bg-amber-500/30 transition"
              >
                Switch Wallet to {targetNetworkConfig.name}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
