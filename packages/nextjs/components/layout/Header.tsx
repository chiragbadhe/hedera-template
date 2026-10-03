"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NetworkSelector } from "~~/components/wallet/NetworkSelector";
import { WalletButton } from "~~/components/wallet/WalletButton";
import { useWallet } from "~~/hooks/useWallet";
import {
  Layers,
  LayoutDashboard,
  ShieldCheck,
  FileCheck2,
  Menu,
  X,
  AlertTriangle,
} from "lucide-react";

export function Header() {
  const pathname = usePathname();
  const { activeNetwork, networkMismatch } = useWallet();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/issue", label: "Issue Asset", icon: ShieldCheck },
    { href: "/verify", label: "Verify Digest", icon: FileCheck2 },
  ];

  const isMainnet = activeNetwork === "mainnet";

  return (
    <header className="sticky top-0 z-40 w-full border-b border-neutral-800 bg-neutral-950/80 backdrop-blur-xl">
      {/* Mainnet Warning Banner if active network is mainnet */}
      {isMainnet && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-1.5 text-center text-xs text-amber-300 flex items-center justify-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>
            <strong>Hedera Mainnet Active:</strong> Actions will expend real HBAR. Verify transaction parameters before signing.
          </span>
        </div>
      )}

      {/* Network Mismatch Banner */}
      {networkMismatch && (
        <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-1.5 text-center text-xs text-red-300 flex items-center justify-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
          <span>
            <strong>Network Mismatch:</strong> Your wallet chain does not match the active application network ({activeNetwork}). Switch network in wallet control.
          </span>
        </div>
      )}

      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        {/* Brand Logo & Name */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md shadow-indigo-500/20 group-hover:scale-105 transition-transform">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <span className="text-base font-bold tracking-tight text-white flex items-center gap-2">
                Scaffold-HBAR
                <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] font-mono text-neutral-300 border border-neutral-700">
                  v2.0
                </span>
              </span>
              <span className="text-[11px] text-neutral-400 block -mt-0.5">
                Priced Asset Registry
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 ml-4">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-all ${isActive
                      ? "bg-neutral-800 text-white font-semibold shadow-inner"
                      : "text-neutral-400 hover:bg-neutral-900 hover:text-white"
                    }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? "text-indigo-400" : "text-neutral-400"}`} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right Controls: Network Selector & Wallet Button */}
        <div className="hidden md:flex items-center gap-3">
          <NetworkSelector />
          <WalletButton />
        </div>

        {/* Mobile Menu Toggle */}
        <div className="flex md:hidden items-center gap-2">
          <NetworkSelector />
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="rounded-lg border border-neutral-800 p-2 text-neutral-400 hover:bg-neutral-900 hover:text-white"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-neutral-800 bg-neutral-950 px-4 py-4 space-y-3 animate-in slide-in-from-top duration-200">
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${isActive ? "bg-neutral-800 text-white" : "text-neutral-400 hover:bg-neutral-900 hover:text-white"
                    }`}
                >
                  <Icon className="h-4 w-4 text-indigo-400" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="pt-2 border-t border-neutral-800 flex justify-center">
            <WalletButton />
          </div>
        </div>
      )}
    </header>
  );
}
