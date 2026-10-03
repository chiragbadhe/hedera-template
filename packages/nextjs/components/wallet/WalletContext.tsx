"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { HederaNetwork } from "@sh/shared";
import { getNetworkConfig } from "~~/lib/networks";

export type WalletType = null;

export interface WalletContextValue {
  // Connected account state (Always null since wallet connections are removed)
  address: string | null;
  displayAddress: string | null;
  walletType: null;
  isConnected: boolean;
  isConnecting: boolean;

  // Network state
  activeNetwork: HederaNetwork;
  setActiveNetwork: (network: HederaNetwork) => void;
  walletChainId: number | null;
  networkMismatch: boolean;
  targetNetworkConfig: ReturnType<typeof getNetworkConfig>;

  // Actions
  switchWalletNetwork: (network: HederaNetwork) => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  // Active Hedera network configured in app
  const [activeNetwork, setActiveNetworkState] = useState<HederaNetwork>("testnet");

  const targetConfig = getNetworkConfig(activeNetwork);

  const setActiveNetwork = (network: HederaNetwork) => {
    setActiveNetworkState(network);
  };

  const switchWalletNetwork = async (targetNetwork: HederaNetwork) => {
    setActiveNetworkState(targetNetwork);
  };

  return (
    <WalletContext.Provider
      value={{
        address: null,
        displayAddress: null,
        walletType: null,
        isConnected: false,
        isConnecting: false,
        activeNetwork,
        setActiveNetwork,
        walletChainId: targetConfig.chainId,
        networkMismatch: false,
        targetNetworkConfig: targetConfig,
        switchWalletNetwork,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}
