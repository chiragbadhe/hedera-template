# Guide: Add a network

## Checklist

1. **Shared endpoints** — Add an entry to `NETWORK_ENDPOINTS` and `HEDERA_NETWORKS` in `packages/shared/src/constants/networks.ts`.
2. **UI selectable?** — Only add to `USER_SELECTABLE_NETWORKS` if users should pick it in the header.
3. **Frontend mirror** — Update `packages/nextjs/lib/networks.ts` display config (or derive solely from shared if you refactor).
4. **Hardhat** — Add a network block in `hardhat.config.ts` with correct `chainId` and relay URL.
5. **Pyth** — Add `PYTH_DEPLOYMENTS[network]` or document that `PYTH_ORACLE_ADDRESS` is mandatory.
6. **Reown** — Ensure AppKit `networks` in `lib/reown.ts` includes the chain if EVM wallets should use it.
7. **Native WC** — Extend `nativeHedera.ts` ledger mapping beyond testnet/mainnet if needed.
8. **Tests** — Extend `networks.test.ts` / shared env tests.
9. **Docs** — Update [network-configuration.md](../network-configuration.md) and `.env.example` comments.

## Safety

Never make mainnet (or any live-value network) the fallback for invalid `HEDERA_NETWORK` values. Keep the testnet fallback in `parseHederaNetwork` / `resolveEnvironment`.
