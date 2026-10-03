# Wallet connectivity

## Two connection modes

| Mode | Library | Typical wallets | Use case |
| --- | --- | --- | --- |
| Reown AppKit (EVM) | `@reown/appkit`, `@reown/appkit-adapter-wagmi`, `wagmi`, `viem` | MetaMask, WalletConnect mobiles, Coinbase, etc. | EVM / JSON-RPC sessions on Hedera chain ids |
| Native Hedera WC | `@hashgraph/hedera-wallet-connect` + Hiero SDK | HashPack, Blade, Kabila | Native Hedera account sessions |

Unified UI state: `WalletProvider` + `useWallet()` (`packages/nextjs/components/wallet/WalletContext.tsx`, `hooks/useWallet.ts`).

## Initialization

1. `packages/nextjs/components/wallet/WalletProviders.tsx` (client component) calls `initReownAppKit()` at **module scope** before any `useAppKit()` hook.
2. `getWagmiAdapter()` constructs a `WagmiAdapter` with Hedera testnet + mainnet networks from `@reown/appkit/networks`, `ssr: true`.
3. Native connector is lazy-created in `getNativeHederaConnector()` when the user chooses native connect.

Project id resolution (`packages/nextjs/lib/reown.ts`):

1. `NEXT_PUBLIC_REOWN_PROJECT_ID` if set
2. else built-in `DEFAULT_REOWN_PROJECT_ID` for local template smoke tests

Register your own id at [https://cloud.reown.com](https://cloud.reown.com) for shared or production use.

## Account access

| Field from `useWallet()` | Meaning |
| --- | --- |
| `address` / `displayAddress` | EVM address or Hedera account id |
| `walletType` | `"reown-evm"` \| `"hedera-native"` \| `null` |
| `isConnected` / `isConnecting` | Connection flags |
| `activeNetwork` | App-selected Hedera network |
| `walletChainId` | Wagmi chain id when EVM connected |
| `networkMismatch` | EVM chain ≠ target network chain id |
| `openReownModal` | Opens AppKit modal |
| `connectNativeWallet` | Opens native WC modal |
| `disconnect` | Disconnects active mode |

## Disconnection

- EVM: `disconnectWagmi()` from wagmi
- Native: `disconnectNativeHedera()` → `DAppConnector.disconnectAll()`

## Unsupported / optional peers

`@wagmi/connectors` lists optional peers (`@walletconnect/ethereum-provider`, `@metamask/connect-evm`, `@x402/*`, etc.). Next.js may warn if they are unresolved. `packages/nextjs/next.config.ts` ignores `@x402/*` optional CDP payment imports so the wallet stack can compile without installing x402.

Missing optional connectors typically mean that specific connector cannot initialize — other AppKit paths may still work.

## Network state

- App network: React state in `WalletContext` (`testnet` default), UI in `NetworkSelector.tsx`
- EVM wallet network: wagmi `useChainId` / `useSwitchChain`
- Native ledger: `LedgerId.TESTNET` or `MAINNET` when creating `DAppConnector`

## Boundary: connect ≠ sign issuance

Wallet connection proves an account session. Publishing HCS or calling `recordIssuance` requires a completed transaction path (see [transaction-lifecycle.md](./transaction-lifecycle.md)). Do not document wallet connect as proof that issuance landed on-chain.
