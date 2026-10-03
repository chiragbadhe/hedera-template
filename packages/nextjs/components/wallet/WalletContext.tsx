"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useAccount, useChainId, useDisconnect, useSwitchChain } from "wagmi";
import { useAppKit } from "@reown/appkit/react";
import type { HederaNetwork } from "@sh/shared";
import { getNetworkConfig } from "~~/lib/networks";
import { connectNativeHedera, disconnectNativeHedera } from "~~/lib/nativeHedera";

export type WalletType = "reown-evm" | "hedera-native" | null;

export interface WalletContextValue {
  // Connected account state
  address: string | null;
  displayAddress: string | null;
  walletType: WalletType;
  isConnected: boolean;
  isConnecting: boolean;

  // Network state
  activeNetwork: HederaNetwork;
  setActiveNetwork: (network: HederaNetwork) => void;
  walletChainId: number | null;
  networkMismatch: boolean;
  targetNetworkConfig: ReturnType<typeof getNetworkConfig>;

  // Actions
  openReownModal: () => void;
  connectNativeWallet: () => Promise<void>;
  disconnect: () => Promise<void>;
  switchWalletNetwork: (network: HederaNetwork) => Promise<void>;

  // Native Hedera session metadata (if native wallet connected)
  nativeTopic: string | null;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  // Active Hedera network configured in app
  const [activeNetwork, setActiveNetworkState] = useState<HederaNetwork>("testnet");

  // Reown AppKit / Wagmi state
  const { address: evmAddress, isConnected: isEvmConnected, isConnecting: isEvmConnecting } = useAccount();
  const walletChainId = useChainId();
  const { disconnect: disconnectWagmi } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { open } = useAppKit();

  // Native Hedera wallet state
  const [nativeAccountId, setNativeAccountId] = useState<string | null>(null);
  const [nativeTopic, setNativeTopic] = useState<string | null>(null);
  const [isNativeConnecting, setIsNativeConnecting] = useState(false);

  // Determine current wallet type & address
  let walletType: WalletType = null;
  let address: string | null = null;
  let displayAddress: string | null = null;
  let isConnected = false;

  if (nativeAccountId) {
    walletType = "hedera-native";
    address = nativeAccountId;
    displayAddress = nativeAccountId;
    isConnected = true;
  } else if (isEvmConnected && evmAddress) {
    walletType = "reown-evm";
    address = evmAddress;
    displayAddress = `${evmAddress.slice(0, 6)}...${evmAddress.slice(-4)}`;
    isConnected = true;
  }

  const isConnecting = isEvmConnecting || isNativeConnecting;
  const targetConfig = getNetworkConfig(activeNetwork);

  // Network mismatch check
  const networkMismatch =
    walletType === "reown-evm" && walletChainId !== null
      ? walletChainId !== targetConfig.chainId
      : false;

  const setActiveNetwork = (network: HederaNetwork) => {
    setActiveNetworkState(network);
  };

  const openReownModal = () => {
    open();
  };

  const connectNativeWallet = async () => {
    try {
      setIsNativeConnecting(true);
      const res = await connectNativeHedera(activeNetwork);
      setNativeAccountId(res.accountId);
      setNativeTopic(res.topic);
    } catch (e) {
      console.error("Native wallet connect failed", e);
    } finally {
      setIsNativeConnecting(false);
    }
  };

  const disconnect = async () => {
    if (walletType === "hedera-native") {
      await disconnectNativeHedera();
      setNativeAccountId(null);
      setNativeTopic(null);
    } else if (walletType === "reown-evm") {
      disconnectWagmi();
    }
  };

  const switchWalletNetwork = async (targetNetwork: HederaNetwork) => {
    setActiveNetworkState(targetNetwork);
    const config = getNetworkConfig(targetNetwork);
    if (walletType === "reown-evm" && switchChain) {
      try {
        switchChain({ chainId: config.chainId });
      } catch (err) {
        console.error("Failed to switch chain in wallet:", err);
      }
    }
  };

  return (
    <WalletContext.Provider
      value={{
        address,
        displayAddress,
        walletType,
        isConnected,
        isConnecting,
        activeNetwork,
        setActiveNetwork,
        walletChainId: walletChainId || null,
        networkMismatch,
        targetNetworkConfig: targetConfig,
        openReownModal,
        connectNativeWallet,
        disconnect,
        switchWalletNetwork,
        nativeTopic,
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
