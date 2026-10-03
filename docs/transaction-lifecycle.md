# Transaction lifecycle

## Intended end-to-end flow

```text
Oracle read → policy check → build attestation envelope → digest
    → publish envelope on HCS → recordIssuance on PricedAssetRegistry
    → verify via Mirror + contract view
```

## What exists today

### A. Oracle read (implemented)

1. Client polls `GET /api/oracle` or server calls `readOracleSnapshot`.
2. JSON-RPC `eth_call` to Pyth core for the configured feed.
3. UI shows price, confidence, age, and read-only flag.

**Files:** `services/oracle.ts`, `app/api/oracle/route.ts`, `Dashboard.tsx`

**Verify:** price renders; HashScan link to Pyth address matches network.

### B. Policy + digest (implemented on `/api/attest`)

1. `POST /api/attest` with `{ assetToken, units, … }`.
2. Reads oracle; runs `checkAttestationPolicy`.
3. Computes `digestOf({ feedId, assetToken, units, observedPrice })`.
4. Returns JSON including `digest` and a **random mock** `transactionHash`.

**Files:** `app/api/attest/route.ts`, shared attestation / policy utils

**Common failures:** missing `assetToken`/`units`; oracle unavailable; policy rejection (`PriceStale`, deviation, etc.).

### C. On-chain `recordIssuance` (contract + tests; not wired from API)

Solidity path is complete and covered by Hardhat tests. Deployed registries can be read with:

```bash
yarn registry:read
yarn registry:verify
```

### D. HCS publish (not wired from API)

No `ConsensusMessageSubmitTransaction` (or operator HCS submit helper) is invoked from `/api/attest`.

### E. Independent verify (implemented)

1. User submits digest (+ optional `topicId`) on `/verify` or `POST /api/verify`.
2. Service loads HCS messages (if topic known), recomputes digest, compares to on-chain record when registry is configured.

**Files:** `services/attestation.ts`, `services/mirror.ts`, `app/api/verify/route.ts`, `VerifyForm.tsx`

**Verify:** each check in the report shows pass/fail with detail; HashScan links when available.

**Common failures:** bad digest format; topic unset; message not yet mirrored; registry address unset (on-chain checks skipped/fail accordingly).

## Issue form UI

`IssueForm.tsx` presents preparing → awaiting → submitting → confirmed steps and calls `/api/attest`. Treat “confirmed” as **API success for policy+digest**, not as proof of HCS or registry inclusion, until the write path is completed.

## Completing the write path

See [guides/implement-a-transaction.md](./guides/implement-a-transaction.md).
