# Configuration

Environment variables are resolved by `resolveEnvironment` in `packages/shared/src/env.ts`. Canonical names are `ENV_KEYS` in `packages/shared/src/constants/registry.ts`.

Copy [`.env.example`](../.env.example) to `.env` at the repo root. Next.js also reads `packages/nextjs/.env.local` for frontend-visible overrides.

Never commit real private keys. `.gitignore` excludes `.env` and `.env.local`.

## Variable reference

| Name | Required | Public / server | Purpose | Example placeholder |
| --- | --- | --- | --- | --- |
| `HEDERA_OPERATOR_ACCOUNT_ID` | Deploy / operator writes | Server | Operator `0.0.x` | `0.0.123456` |
| `HEDERA_OPERATOR_PRIVATE_KEY` | Deploy / operator writes | Server | Raw secp256k1 signing key | `0x` + 64 hex |
| `ACCOUNT_ID` | Alias | Server | Alias for operator account | |
| `PRIVATE_KEY` / `__RUNTIME_DEPLOYER_PRIVATE_KEY` | Alias | Server | Alias for operator key | |
| `HEDERA_NETWORK` | No (default `testnet`) | Both* | Network selector | `testnet` |
| `HEDERA_JSON_RPC_URL` | No | Server | Override Hashio | `https://testnet.hashio.io/api` |
| `HEDERA_RPC_URL` / `NEXT_PUBLIC_HEDERA_RPC_URL` | Alias | — | Aliases for JSON-RPC | |
| `HEDERA_MIRROR_NODE_URL` | No | Server | Override Mirror base | `https://testnet.mirrornode.hedera.com` |
| `PYTH_ORACLE_ADDRESS` | No | Server | Override Pyth core | `0xA2aa…5729` |
| `NEXT_PUBLIC_ORACLE_FEED_ID` | No | Public | Feed id | HBAR/USD default in `.env.example` |
| `NEXT_PUBLIC_REGISTRY_ADDRESS` | For registry reads | Public | Registry EVM address | `0x…` |
| `NEXT_PUBLIC_REGISTRY_CONTRACT_ID` | No | Public | Registry entity id | `0.0.x` |
| `HEDERA_ATTESTATION_TOPIC_ID` | For HCS verify path | Allowlisted | HCS topic id | `0.0.x` |
| `REGISTRY_MAX_PRICE_AGE_SECONDS` | No | Server | Freshness bound | `7776000` |
| `REGISTRY_MAX_DEVIATION_BPS` | No | Server | Max deviation | `50` |
| `NEXT_PUBLIC_REOWN_PROJECT_ID` | Recommended | Public | Reown AppKit / native WC | from cloud.reown.com |
| `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` | Optional | Public | Exposed via `/api/config`; wallet init prefers Reown var | |
| `NEXT_PUBLIC_APP_NAME` / `_DESCRIPTION` / `_URL` | No | Public | AppKit metadata | |

\*Network is not a secret; operator credentials must never use `NEXT_PUBLIC_*`.

## Where values are consumed

| Consumer | Module |
| --- | --- |
| Hardhat networks / deployer | `packages/hardhat/hardhat.config.ts`, deploy scripts |
| Next server services | `packages/nextjs/services/env.ts` → `resolveEnvironment` |
| Browser-safe subset | `GET /api/config` → `toBrowserEnvironment` |
| Reown project id | `packages/nextjs/lib/reown.ts` (`NEXT_PUBLIC_REOWN_PROJECT_ID`, with hardcoded fallback for local smoke) |

## Private key format

`assertUsablePrivateKey` accepts:

- `0x` + 64 hex characters

It **rejects** DER-encoded transaction keys commonly written by portal export / some `account:import` flows. Prefer `yarn hardhat:account:generate`.

## Policy defaults

Defined in `packages/shared/src/constants/oracle.ts`:

- `DEFAULT_MAX_PRICE_AGE_SECONDS` = 90 days — wide because Hedera Pyth feeds may be older than Pyth’s 60s validity window; tighten for production.
- `DEFAULT_MAX_DEVIATION_BPS` = 50

## `template.json` env section

[`template.json`](../template.json) lists defaults and public/server splits for `create-scaffold-hbar`. Keep it aligned with `.env.example` when adding variables.
