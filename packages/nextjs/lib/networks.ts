import { NETWORK_ENDPOINTS, type HederaNetwork } from "@sh/shared";

export interface NetworkConfig {
  id: HederaNetwork;
  name: string;
  chainId: number;
  chainIdHex: string;
  rpcUrl: string;
  mirrorNodeUrl: string;
  explorerUrl: string;
  isTestnet: boolean;
  currency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

export const HEDERA_NETWORKS: Record<HederaNetwork, NetworkConfig> = {
  testnet: {
    id: "testnet",
    name: "Hedera Testnet",
    chainId: NETWORK_ENDPOINTS.testnet.chainId,
    chainIdHex: `0x${NETWORK_ENDPOINTS.testnet.chainId.toString(16)}`,
    rpcUrl: NETWORK_ENDPOINTS.testnet.jsonRpcUrl,
    mirrorNodeUrl: NETWORK_ENDPOINTS.testnet.mirrorNodeUrl,
    explorerUrl: NETWORK_ENDPOINTS.testnet.hashscanBaseUrl,
    isTestnet: true,
    currency: { name: "HBAR", symbol: "HBAR", decimals: 8 },
  },
  mainnet: {
    id: "mainnet",
    name: "Hedera Mainnet",
    chainId: NETWORK_ENDPOINTS.mainnet.chainId,
    chainIdHex: `0x${NETWORK_ENDPOINTS.mainnet.chainId.toString(16)}`,
    rpcUrl: NETWORK_ENDPOINTS.mainnet.jsonRpcUrl,
    mirrorNodeUrl: NETWORK_ENDPOINTS.mainnet.mirrorNodeUrl,
    explorerUrl: NETWORK_ENDPOINTS.mainnet.hashscanBaseUrl,
    isTestnet: false,
    currency: { name: "HBAR", symbol: "HBAR", decimals: 8 },
  },
  previewnet: {
    id: "previewnet",
    name: "Hedera Previewnet",
    chainId: NETWORK_ENDPOINTS.previewnet.chainId,
    chainIdHex: `0x${NETWORK_ENDPOINTS.previewnet.chainId.toString(16)}`,
    rpcUrl: NETWORK_ENDPOINTS.previewnet.jsonRpcUrl,
    mirrorNodeUrl: NETWORK_ENDPOINTS.previewnet.mirrorNodeUrl,
    explorerUrl: NETWORK_ENDPOINTS.previewnet.hashscanBaseUrl,
    isTestnet: true,
    currency: { name: "HBAR", symbol: "HBAR", decimals: 8 },
  },
  localnode: {
    id: "localnode",
    name: "Hedera Local Node",
    chainId: NETWORK_ENDPOINTS.localnode.chainId,
    chainIdHex: `0x${NETWORK_ENDPOINTS.localnode.chainId.toString(16)}`,
    rpcUrl: NETWORK_ENDPOINTS.localnode.jsonRpcUrl,
    mirrorNodeUrl: NETWORK_ENDPOINTS.localnode.mirrorNodeUrl,
    explorerUrl: NETWORK_ENDPOINTS.localnode.hashscanBaseUrl,
    isTestnet: true,
    currency: { name: "HBAR", symbol: "HBAR", decimals: 8 },
  },
};

export function getNetworkConfig(network: HederaNetwork): NetworkConfig {
  return HEDERA_NETWORKS[network] ?? HEDERA_NETWORKS.testnet;
}

export function isNetworkSupported(chainId: number): boolean {
  return Object.values(HEDERA_NETWORKS).some((n) => n.chainId === chainId);
}
