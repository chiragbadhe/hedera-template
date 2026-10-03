/**
 * Hedera network identifiers used across the template.
 *
 * `testnet` is the default everywhere. `mainnet` is supported by every adapter
 * but is never selected implicitly: it requires an explicit environment
 * override, so a mis-set variable can never silently broadcast to mainnet.
 */

export const HEDERA_NETWORKS = ["testnet", "mainnet", "previewnet", "localnode"] as const;

export type HederaNetwork = (typeof HEDERA_NETWORKS)[number];

/** Networks a user may target from the UI. `localnode` and `previewnet` are infrastructure-only. */
export const USER_SELECTABLE_NETWORKS = ["testnet", "mainnet"] as const;

export type UserSelectableNetwork = (typeof USER_SELECTABLE_NETWORKS)[number];

export function isHederaNetwork(value: unknown): value is HederaNetwork {
  return typeof value === "string" && (HEDERA_NETWORKS as readonly string[]).includes(value);
}

/** Narrow an arbitrary env string to a network, falling back to `fallback`. */
export function parseHederaNetwork(
  value: string | undefined | null,
  fallback: HederaNetwork = "testnet",
): HederaNetwork {
  const normalised = value?.trim().toLowerCase();
  return isHederaNetwork(normalised) ? normalised : fallback;
}

export type NetworkEndpoints = {
  /** Hedera JSON-RPC relay. Free reads, required for EVM calls (Pyth). */
  readonly jsonRpcUrl: string;
  /** Mirror Node REST base. Free reads, authoritative verification source. */
  readonly mirrorNodeUrl: string;
  /** HashScan explorer base for this network. */
  readonly hashscanBaseUrl: string;
  /** EVM chain id reported by the JSON-RPC relay. */
  readonly chainId: number;
};

/**
 * Public, credential-free endpoints per network.
 *
 * All of these are free public services. Override them with
 * `NEXT_PUBLIC_HEDERA_RPC_URL` / `HEDERA_MIRROR_NODE_URL` when self-hosting a
 * node, or when you need a region-local relay.
 */
export const NETWORK_ENDPOINTS: Readonly<Record<HederaNetwork, NetworkEndpoints>> = {
  testnet: {
    jsonRpcUrl: "https://testnet.hashio.io/api",
    mirrorNodeUrl: "https://testnet.mirrornode.hedera.com",
    hashscanBaseUrl: "https://hashscan.io/testnet",
    chainId: 296,
  },
  previewnet: {
    jsonRpcUrl: "https://previewnet.hashio.io/api",
    mirrorNodeUrl: "https://previewnet.mirrornode.hedera.com",
    hashscanBaseUrl: "https://hashscan.io/previewnet",
    chainId: 297,
  },
  mainnet: {
    jsonRpcUrl: "https://mainnet.hashio.io/api",
    mirrorNodeUrl: "https://mainnet.mirrornode.hedera.com",
    hashscanBaseUrl: "https://hashscan.io/mainnet",
    chainId: 295,
  },
  localnode: {
    jsonRpcUrl: "http://127.0.0.1:8545",
    mirrorNodeUrl: "http://127.0.0.1:5600",
    hashscanBaseUrl: "http://127.0.0.1:8080",
    chainId: 31337,
  },
};

/**
 * Networks where spending real value is possible. The UI attaches a persistent
 * warning banner and requires an explicit acknowledgement on these networks.
 */
export const LIVE_VALUE_NETWORKS: readonly HederaNetwork[] = ["mainnet"];

export function isLiveValueNetwork(network: HederaNetwork): boolean {
  return LIVE_VALUE_NETWORKS.includes(network);
}
