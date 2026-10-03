# Hedera integration

This template composes several Hedera and ecosystem surfaces. Only integrations that exist in the repo are described here.

## Summary

| Integration | Role | Write path today |
| --- | --- | --- |
| **Pyth** (ecosystem oracle) | Price observation for issuance policy | **Read-only** on Hedera (documented in shared oracle constants) |
| **HSCS / EVM** | `PricedAssetRegistry` stores digests + observation metadata | Deploy + Hardhat tests; app write via `/api/attest` **not finished** |
| **HCS** | Intended transport for canonical attestation envelopes | Mirror **read** implemented; app **publish** not finished |
| **HTS** | Asset identity (`0.0.x` / long-zero EVM address) | Mirror token **lookup**; no `TokenCreate` |
| **Mirror Node** | Independent verification source | Read implemented |

## Pyth Network

**Why:** Load-bearing ecosystem oracle — issuance records are refused unless the live Pyth observation matches the attested observation within policy.

**SDK / API:** `viem` / ethers `eth_call` against Pyth core via Hashio JSON-RPC. ABI tuned to Hedera’s **four** return words (`price`, `conf`, `expo`, `publishTime`).

**Implementation:**

- Deployments: `packages/shared/src/constants/oracle.ts` → `PYTH_DEPLOYMENTS`
- Server read: `packages/nextjs/services/oracle.ts`
- CLI: `yarn hardhat:oracle:read`
- UI: dashboard polling `/api/oracle`

**Configuration:** `PYTH_ORACLE_ADDRESS` (optional), `NEXT_PUBLIC_ORACLE_FEED_ID`, network via `HEDERA_NETWORK`.

**Limitations:** Hermes signed update data for Hedera was not usable at last verification; template sets `readOnly: true`. Freshness bound defaults are intentionally wide so demos work against stale publishes — tighten with `REGISTRY_MAX_PRICE_AGE_SECONDS` for production.

## PricedAssetRegistry (HSCS)

**Why:** On-chain commitment that an issuance digest matches a Pyth observation the contract itself re-reads.

**Implementation:** `packages/hardhat/contracts/PricedAssetRegistry.sol`

Key behaviors:

- Authorised registrants call `recordIssuance`
- Re-reads Pyth; enforces expo / publishTime / positivity / deviation / freshness
- Emits `IssuanceRecorded` with full observation for third-party audit

**Deploy:** `yarn hardhat:deploy` (testnet), `:local`, `:mainnet`

**Verify script:** `yarn registry:verify`

**Tests:** `packages/hardhat/test/PricedAssetRegistry.test.ts` (includes shared-policy agreement checks)

## Hedera Consensus Service (HCS)

**Why:** Publish the canonical attestation envelope so Mirror Node can serve the exact bytes that hash to the on-chain digest.

**Implementation today:**

- Envelope schema / digest: `packages/shared` (`ATTESTATION_SCHEMA = par.attestation.v1`)
- Mirror fetch / decode: `packages/nextjs/services/mirror.ts`
- Verify orchestration: `packages/nextjs/services/attestation.ts`, `POST /api/verify`

**Not implemented in the app write path:** `ConsensusMessageSubmitTransaction` (or equivalent) from `/api/attest`.

Configure topic with `HEDERA_ATTESTATION_TOPIC_ID`.

## Hedera Token Service (HTS)

**Why:** Registry records refer to real HTS assets; verification can check Mirror Node token metadata.

**Implementation:** Mirror token lookup in `mirror.ts` / attestation verification checks. Issuance schemas include HTS name/symbol limits in `packages/shared/src/schemas/issuance.ts`.

**Not implemented:** creating tokens via HTS in this template. Pass an existing token id / address into the issue form.

## Mirror Node

**Why:** Authoritative public record of consensus messages and token entities.

**Implementation:** REST client in `packages/nextjs/services/mirror.ts` using `NETWORK_ENDPOINTS.*.mirrorNodeUrl`.

Verification proves digest equality with HCS payload bytes; it does **not** recompute HCS `running_hash` (see comments in `mirror.ts`).

## JSON-RPC relay

Used for all EVM reads/writes (Pyth, registry). Defaults are Hashio public relays per network in `NETWORK_ENDPOINTS`. Override with `HEDERA_JSON_RPC_URL`.

## Error handling patterns

- Shared `Result` / `attempt` helpers in `services/chains.ts`
- Contract custom errors mapped in `packages/shared/src/utils/rejection.ts` (`REJECTION_SOLIDITY_ERRORS`)
- Env failures throw `EnvironmentError` with actionable messages
