# AGENTS.md

Briefing for coding agents working in this repository (Cursor, Claude Code, Codex, and similar).

## Project purpose

**Priced Asset Registry** is an external [Scaffold-HBAR](https://github.com/hedera-dev/scaffold-hbar) template: oracle-stamped HTS issuance attestations using **Pyth** (read-only on Hedera), **canonical keccak256 digests**, **PricedAssetRegistry** (Solidity), **HCS publishing**, **Mirror Node** verification, and server operator key transaction execution.

Do not invent features. Prefer reading code under `packages/` and docs under `docs/`.

## Repository structure

| Path | Package | Responsibility |
| --- | --- | --- |
| `packages/shared` | `@sh/shared` | Networks, env keys/resolution, digests, policy math, ABI |
| `packages/hardhat` | `@sh/hardhat` | Solidity, deploy/read scripts, contract tests |
| `packages/nextjs` | `@sh/nextjs` | Next.js 15 App Router UI, API routes, server services |
| `template.json` | — | `create-scaffold-hbar` manifest |
| `docs/` | — | Authoritative human documentation |
| `.env.example` | — | Env template (no secrets) |

Yarn **4.9.2** workspaces. Node **≥ 20.18.3** (CI: 22.15.0).

## Architecture decisions agents must respect

1. Cross-package logic belongs in `@sh/shared`, not copy-pasted into Next or Hardhat.
2. Operator secrets are server-only (`server-only` in `services/env.ts`; allowlist via `toBrowserEnvironment`).
3. Pyth on Hedera uses a **four-field** price tuple (`price`, `conf`, `expo`, `publishTime`).
4. Off-chain `evaluateAttestation` check order must stay aligned with `PricedAssetRegistry`.
5. Transactions and HCS topic messages use the configured **Server Operator Key** (`HEDERA_OPERATOR_ACCOUNT_ID` & `HEDERA_OPERATOR_PRIVATE_KEY`). Private keys are never exposed to client-side code.
6. `/api/attest` performs real HCS topic submission followed by smart contract registry recording via Hedera node and JSON-RPC relay.

## Development commands

```bash
yarn install
yarn shared:build
yarn next:dev
yarn hardhat:compile
yarn hardhat:deploy          # testnet
yarn hardhat:deploy:local
yarn hardhat:oracle:read
yarn registry:read
yarn registry:verify
```

## Testing and quality

```bash
yarn test
yarn check-types
yarn lint
yarn format:check
yarn build
yarn verify                  # full gate
```

Run relevant package tests after your change; do not claim CI green without running commands.

## Coding conventions

- TypeScript strict; prefer existing patterns in each package.
- Next imports: `~~/` alias for app code; `@sh/shared` for shared.
- Solidity **0.8.28**, optimizer 200 runs.
- After ABI changes: `yarn hardhat:generate:abis` and update shared consumers/tests.
- Identifiers: follow neighboring files (no drive-by renames).

## Hedera / network rules

- Default network is **testnet**. Never silently target mainnet.
- Env network parsing falls back to testnet on unknown values.
- Document EVM (JSON-RPC) vs native (Mirror / Hedera SDK) paths clearly.

## Transaction safety

- No private keys in client bundles or docs examples.
- Prefer raw `0x`+64 hex operator keys from `yarn hardhat:account:generate` (ECDSA).
- Real HashScan/Mirror links only after a real broadcast.

## Environment variable rules

- Canonical names: `ENV_KEYS` in `packages/shared/src/constants/registry.ts`.
- Topic id canonical name: `HEDERA_ATTESTATION_TOPIC_ID`.
- Update `.env.example`, `template.json`, and `docs/configuration.md` together when adding keys.

## Extending the template

Follow guides in `docs/guides/`:

- `add-a-hedera-service.md`
- `add-a-network.md`
- `implement-a-transaction.md`

## Common pitfalls

- Claiming HTS token creation exists (it references existing tokens).
- Using DER portal keys as `HEDERA_OPERATOR_PRIVATE_KEY` without ECDSA parsing.
- Duplicating network URLs outside `@sh/shared`.
