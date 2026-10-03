import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { hedera, hederaTestnet } from "@reown/appkit/networks";

// Fallback project ID for initial template testing without environment variable
export const DEFAULT_REOWN_PROJECT_ID = "c47f72844b96258d4a198fd30d7b27a8";

export function getReownProjectId(): string {
  const envId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID;
  if (envId && envId.trim() !== "") {
    return envId.trim();
  }
  return DEFAULT_REOWN_PROJECT_ID;
}

export const networks = [hederaTestnet, hedera] as const;

export const appMetadata = {
  name: process.env.NEXT_PUBLIC_APP_NAME || "Scaffold-HBAR Priced Asset Registry",
  description: process.env.NEXT_PUBLIC_APP_DESCRIPTION || "Oracle-stamped HTS asset registry on Hedera",
  url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  icons: ["https://hashscan.io/favicon.ico"],
};

let wagmiAdapterInstance: WagmiAdapter | null = null;

export function getWagmiAdapter(): WagmiAdapter {
  if (!wagmiAdapterInstance) {
    const projectId = getReownProjectId();
    wagmiAdapterInstance = new WagmiAdapter({
      networks: [...networks],
      projectId,
      ssr: true,
    });
  }
  return wagmiAdapterInstance;
}

let appKitInitialized = false;

/**
 * Must run at module scope of a Client Component (before any useAppKit() call).
 * Safe to call more than once; subsequent calls are no-ops.
 */
export function initReownAppKit() {
  if (appKitInitialized) return;

  const projectId = getReownProjectId();
  const wagmiAdapter = getWagmiAdapter();

  createAppKit({
    adapters: [wagmiAdapter],
    networks: [...networks],
    projectId,
    metadata: appMetadata,
    features: {
      analytics: false,
      email: false,
      socials: [],
    },
    themeMode: "dark",
    themeVariables: {
      "--w3m-accent": "#6366f1",
      "--w3m-border-radius-master": "1px",
    },
  });

  appKitInitialized = true;
}
