import { DAppConnector, HederaJsonRpcMethod, HederaSessionEvent, HederaChainId } from "@hashgraph/hedera-wallet-connect";
import { LedgerId } from "@hiero-ledger/sdk";
import { getReownProjectId } from "./reown";
import type { HederaNetwork } from "@sh/shared";

export interface NativeWalletState {
  isConnected: boolean;
  accountId: string | null;
  network: HederaNetwork;
  topic: string | null;
}

let dAppConnectorInstance: DAppConnector | null = null;

export async function getNativeHederaConnector(network: HederaNetwork = "testnet"): Promise<DAppConnector> {
  if (dAppConnectorInstance) return dAppConnectorInstance;

  const projectId = getReownProjectId();
  const ledgerId = network === "mainnet" ? LedgerId.MAINNET : LedgerId.TESTNET;
  const chainId = network === "mainnet" ? HederaChainId.Mainnet : HederaChainId.Testnet;

  dAppConnectorInstance = new DAppConnector(
    {
      name: "Priced Asset Registry",
      description: "Oracle-stamped HTS asset registry on Hedera",
      url: typeof window !== "undefined" ? window.location.origin : "http://localhost:3000",
      icons: ["https://hashscan.io/favicon.ico"],
    },
    ledgerId,
    projectId,
    Object.values(HederaJsonRpcMethod),
    [HederaSessionEvent.ChainChanged, HederaSessionEvent.AccountsChanged],
    [chainId],
  );

  await dAppConnectorInstance.init();
  return dAppConnectorInstance;
}

export async function connectNativeHedera(network: HederaNetwork = "testnet"): Promise<{ accountId: string; topic: string }> {
  const connector = await getNativeHederaConnector(network);
  const session = await connector.openModal();
  
  const accountId = connector.signers[0]?.getAccountId().toString() || "";
  return {
    accountId,
    topic: session.topic,
  };
}

export async function disconnectNativeHedera(): Promise<void> {
  if (dAppConnectorInstance) {
    await dAppConnectorInstance.disconnectAll();
  }
}
