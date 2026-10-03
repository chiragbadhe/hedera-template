# Troubleshooting

## Missing or invalid Reown project id

**Symptom:** Wallet modal fails or uses an unexpected cloud project.

**Fix:** Set `NEXT_PUBLIC_REOWN_PROJECT_ID` in `.env` or `packages/nextjs/.env.local` from [cloud.reown.com](https://cloud.reown.com). Restart `yarn next:dev`.

## Network mismatch banner

**Symptom:** `networkMismatch` true — wallet chain id ≠ app target.

**Fix:** Use the network selector’s switch-chain action (EVM) or reconnect native wallet on the matching ledger. Testnet chain id is **296**.

## Insufficient HBAR

**Symptom:** Deploy or contract tx reverts for fees.

**Fix:** Fund the operator / wallet via [https://portal.hedera.com/faucet](https://portal.hedera.com/faucet).

## `NEXT_PUBLIC_REGISTRY_ADDRESS` unset

**Symptom:** Registry reads fail; services return configuration errors.

**Fix:** Run `yarn hardhat:deploy` and copy the address into env. Confirm with `yarn registry:read`.

## DER private key rejected

**Symptom:** `EnvironmentError` mentioning DER-encoded transaction key.

**Fix:** Generate a raw secp256k1 key with `yarn hardhat:account:generate` and use that `0x`-prefixed value.

## Oracle / PriceStale

**Symptom:** Policy rejects attestation; UI shows stale price.

**Fix:** Understand Pyth is read-only on Hedera here. For demos the default max age is wide (`7776000` seconds). If you tightened `REGISTRY_MAX_PRICE_AGE_SECONDS`, restore a higher bound or wait for a fresher on-chain update.

## `viem/tempo` or optional `@x402/*` module errors

**Symptom:** Next.js fails compiling wagmi / Reown adapter.

**Fix:** Keep `viem` on a version that exports `viem/tempo` (this repo pins a compatible 2.x in `packages/nextjs/package.json`). `@x402/*` is ignored in `next.config.ts` as an optional CDP peer.

## Yarn install / engine issues

**Symptom:** Engine or package manager errors.

**Fix:** Node ≥ 20.18.3; enable Corepack Yarn 4.9.2. Do not switch the monorepo to npm.

## `/api/attest` “success” but nothing on HashScan

**Expected today:** the route returns a mock `transactionHash`. See [transaction-lifecycle.md](./transaction-lifecycle.md).
