# Guide: Implement a transaction (finish the write path)

`/api/attest` today stops after oracle read, policy check, and digest. Use this guide to complete HCS publish and/or registry `recordIssuance`.

## Target sequence

1. Build `AssetAttestation` via `buildAttestation` / shared schemas.
2. Compute `attestationDigest`.
3. Publish canonical JSON to HCS (`HEDERA_ATTESTATION_TOPIC_ID`).
4. Call `recordIssuance` on `NEXT_PUBLIC_REGISTRY_ADDRESS` with the digest and observation fields the contract expects.
5. Return **real** transaction ids / HashScan links (no random mocks).
6. Confirm with `POST /api/verify` and Mirror Node.

## Implementation options

### Operator-signed (server)

- Use `operatorEnvironment()` from `services/env.ts`.
- Prefer `@hiero-ledger/sdk` for HCS submit; use viem/ethers + operator key for EVM `recordIssuance`.
- Gate the route (auth, allowlist, or local-only) — an open endpoint with a hot operator key is unsafe.

### User wallet-signed

- EVM: wagmi/`writeContract` against the registry ABI from `@sh/shared`.
- Native: Hedera WalletConnect signer for HCS submit.
- Keep server routes for simulation / policy preview only.

## Contract alignment

Read `PricedAssetRegistry.recordIssuance` parameter order and types carefully. Reuse shared observation types so off-chain policy and on-chain checks stay identical. Run `yarn hardhat:test` after any ABI change.

## Remove the mock

Delete the synthetic `transactionHash` in `app/api/attest/route.ts` once real submission exists. Update [transaction-lifecycle.md](../transaction-lifecycle.md), the README limitations section, and in-app docs in the same PR.

## Verification checklist

- [ ] HashScan shows HCS message and/or contract tx
- [ ] `/api/verify` passes digest equality
- [ ] On-chain record fields match envelope
- [ ] No secrets logged
- [ ] Docs no longer claim mock success as finality
