# Guide: Add a wallet provider

## Current entry points

- EVM / AppKit: `packages/nextjs/lib/reown.ts`, `WalletProviders.tsx`
- Native Hedera: `packages/nextjs/lib/nativeHedera.ts`
- Unified state: `WalletContext.tsx` / `useWallet()`

## Adding another EVM connector path

1. Prefer configuring AppKit / wagmi connectors rather than a parallel modal stack.
2. Keep `initReownAppKit()` at module scope of a client component (before `useAppKit`).
3. Install any **required** peer dependencies the connector needs; optional peers may need Next webpack handling (see `next.config.ts` IgnorePlugin for `@x402/*`).
4. Extend `WalletContext` only if the new mode needs distinct `walletType` semantics.
5. Add a focused vitest where pure helpers change (`lib/reown.test.ts` pattern).
6. Update [wallet-connectivity.md](../wallet-connectivity.md).

## Adding another native Hedera wallet path

1. Stay on `@hashgraph/hedera-wallet-connect` / WalletConnect where possible so HashPack-class wallets keep working.
2. Map `HederaNetwork` → `LedgerId` / `HederaChainId` carefully (testnet vs mainnet only in current helper).
3. Ensure disconnect clears connector singleton state.

## Do not

- Mix operator private keys into client wallet code.
- Claim a wallet is “supported” without a successful connect smoke test on the target network.
