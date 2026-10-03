"use client";

import { useState, useRef, useEffect } from "react";
import { useWallet } from "~~/hooks/useWallet";
import { Wallet, LogOut, Copy, ExternalLink, ShieldCheck, ChevronDown, Check, Sparkles } from "lucide-react";

export function WalletButton() {
  const {
    address,
    displayAddress,
    walletType,
    isConnected,
    isConnecting,
    openReownModal,
    connectNativeWallet,
    disconnect,
    targetNetworkConfig,
  } = useWallet();

  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showConnectOptions, setShowConnectOptions] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        setShowConnectOptions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleCopy = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!isConnected) {
    return (
      <div className="relative">
        <button
          onClick={() => setShowConnectOptions(true)}
          disabled={isConnecting}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 active:scale-95 transition-all disabled:opacity-50"
        >
          <Wallet className="h-4 w-4" />
          <span>{isConnecting ? "Connecting..." : "Connect Wallet"}</span>
        </button>

        {showConnectOptions && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
            <div
              ref={modalRef}
              className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl animate-in zoom-in-95 duration-200"
            >
              <div className="flex items-center justify-between border-b border-neutral-800 pb-4 mb-4">
                <div>
                  <h3 className="text-base font-semibold text-white flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-indigo-400" />
                    Connect a Wallet
                  </h3>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Select your preferred wallet connection architecture
                  </p>
                </div>
                <button
                  onClick={() => setShowConnectOptions(false)}
                  className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3">
                {/* Reown EVM Option */}
                <button
                  onClick={() => {
                    setShowConnectOptions(false);
                    openReownModal();
                  }}
                  className="group flex w-full items-center justify-between rounded-xl border border-neutral-800 bg-neutral-950/60 p-4 text-left hover:border-indigo-500/50 hover:bg-neutral-800/80 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 group-hover:scale-105 transition-transform">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-white flex items-center gap-2">
                        Reown AppKit (EVM)
                        <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] text-indigo-300 font-normal">
                          Recommended
                        </span>
                      </div>
                      <div className="text-xs text-neutral-400">
                        MetaMask, WalletConnect, Coinbase & EVM Wallets
                      </div>
                    </div>
                  </div>
                </button>

                {/* Native Hedera Option */}
                <button
                  onClick={() => {
                    setShowConnectOptions(false);
                    connectNativeWallet();
                  }}
                  className="group flex w-full items-center justify-between rounded-xl border border-neutral-800 bg-neutral-950/60 p-4 text-left hover:border-emerald-500/50 hover:bg-neutral-800/80 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 group-hover:scale-105 transition-transform">
                      <Wallet className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-white flex items-center gap-2">
                        Native Hedera Wallet
                      </div>
                      <div className="text-xs text-neutral-400">
                        HashPack, Blade, Kabila Wallet (WalletConnect v2)
                      </div>
                    </div>
                  </div>
                </button>
              </div>

              <div className="mt-5 rounded-lg bg-neutral-950 p-3 text-[11px] text-neutral-400 border border-neutral-800/60">
                <span className="font-semibold text-neutral-300">Note:</span> EVM wallets sign EVM smart contract transactions; Native Hedera wallets sign native HCS & HTS SDK transactions.
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const explorerUrl = `${targetNetworkConfig.explorerUrl}/account/${address}`;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:border-neutral-700 hover:bg-neutral-800 transition-all"
      >
        <span className="flex h-2 w-2 rounded-full bg-emerald-400" />
        <span className="font-mono">{displayAddress}</span>
        <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400 font-sans uppercase">
          {walletType === "reown-evm" ? "Reown" : "Native"}
        </span>
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 rounded-xl border border-neutral-800 bg-neutral-900 p-4 shadow-2xl backdrop-blur-xl z-50 animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-3 mb-3">
            <div>
              <div className="text-xs text-neutral-400 uppercase tracking-wider font-medium">Connected Account</div>
              <div className="text-sm font-mono text-white font-semibold mt-0.5 break-all">{address}</div>
            </div>
          </div>

          <div className="space-y-2">
            <button
              onClick={handleCopy}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs text-neutral-300 hover:bg-neutral-800 hover:text-white transition"
            >
              <span className="flex items-center gap-2">
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied!" : "Copy Address"}
              </span>
            </button>

            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs text-neutral-300 hover:bg-neutral-800 hover:text-white transition"
            >
              <span className="flex items-center gap-2">
                <ExternalLink className="h-3.5 w-3.5" />
                View in HashScan
              </span>
            </a>

            <div className="border-t border-neutral-800 pt-2 mt-2">
              <button
                onClick={() => {
                  setIsOpen(false);
                  disconnect();
                }}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 transition"
              >
                <span className="flex items-center gap-2 font-medium">
                  <LogOut className="h-3.5 w-3.5" />
                  Disconnect Wallet
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
