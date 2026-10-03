# Security

## Private keys and env

- Store operator credentials only in `.env` / host secrets — never in git, never in `NEXT_PUBLIC_*`.
- `SERVER_ONLY_ENV_KEYS` in `@sh/shared` lists credentials that must not enter the browser bundle.
- `toBrowserEnvironment` is an **allowlist**; `/api/config` is the single audited crossing into the client.
- `packages/nextjs/services/env.ts` imports `server-only` so accidental client imports fail the build.

## Wallet authorization

- Users authorize sessions through Reown AppKit or native WalletConnect modals.
- Do not ask users to paste private keys into the UI.
- Disconnect clears the active session mode in `WalletContext`.

## Transaction confirmation

- Prefer wallet-signed flows for user actions once the write path is complete.
- Operator-signed server transactions (if added) must require explicit server env and should be rate-limited / gated — not exposed as open public endpoints without auth.

## Network safety

- Default network is testnet.
- Mainnet is a live-value network; require explicit configuration and UI acknowledgement patterns already sketched via `LIVE_VALUE_NETWORKS`.

## Contract risks

- `PricedAssetRegistry` is **not audited**.
- Authorised registrant model means a compromised registrant key can record bad (but oracle-consistent) issuances.
- Wide `maxPriceAgeSeconds` defaults weaken freshness guarantees — tighten for production.
- Pyth read-only mode means prices may be stale relative to spot markets.

## Known template limitations (security-relevant)

- `/api/attest` returns a mock transaction hash — do not treat its response as chain finality.
- Optional wallet connector peers may be missing; fail closed for that connector rather than bypassing checks.

## Reporting

If you discover a vulnerability in a deployment of this template, rotate operator keys immediately and open a private channel with the repository maintainers.
