# AGENTS.md

Briefing for coding agents working in this repository (Cursor, Claude Code, Codex, and similar).

## Project purpose

**Priced Asset Registry** is an external [Scaffold-HBAR](https://github.com/hedera-dev/scaffold-hbar) template: oracle-stamped HTS issuance attestations using **Pyth** (read-only on Hedera today), **canonical keccak256 digests**, **PricedAssetRegistry** (Solidity), **Mirror Node** verification, and dual wallets (Reown AppKit + native Hedera WalletConnect).

Do not invent features. Prefer reading code under `packages/` and docs under `docs/`.

## Repository structure

| Path | Package | Responsibility |
| --- | --- | --- |
| `packages/shared` | `@sh/shared` | Networks, env keys/resolution, digests, policy math, ABI |
| `packages/hardhat` | `@sh/hardhat` | Solidity, deploy/read scripts, contract tests |
| `packages/nextjs` | `@sh/nextjs` | Next.js 15 App Router UI, API routes, wallet, server services |
| `template.json` | — | `create-scaffold-hbar` manifest |
| `docs/` | — | Authoritative human documentation |
| `.env.example` | — | Env template (no secrets) |

Yarn **4.9.2** workspaces. Node **≥ 20.18.3** (CI: 22.15.0).

## Architecture decisions agents must respect

1. Cross-package logic belongs in `@sh/shared`, not copy-pasted into Next or Hardhat.
2. Operator secrets are server-only (`server-only` in `services/env.ts`; allowlist via `toBrowserEnvironment`).
3. Pyth on Hedera uses a **four-field** price tuple — do not switch to the five-field docs ABI without verifying the live contract.
4. Off-chain `evaluateAttestation` check order must stay aligned with `PricedAssetRegistry`.
5. `initReownAppKit()` must run at **module scope** of a client component before `useAppKit()`.
6. `/api/attest` currently returns a **mock** `transactionHash` after policy+digest — do not document or UI-copy it as on-chain finality without implementing HCS + `recordIssuance`.

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

## Hedera / wallet / network rules

- Default network is **testnet**. Never silently target mainnet.
- Env network parsing falls back to testnet on unknown values — keep it that way.
- Document EVM (JSON-RPC) vs native (Mirror / WalletConnect) paths separately.
- Native helper currently maps only testnet/mainnet ledgers.

## Transaction safety

- No private keys in client bundles or docs examples.
- Prefer raw `0x`+64 hex operator keys from `yarn hardhat:account:generate`.
- Reject introducing unauthenticated hot-wallet operator endpoints.
- Real HashScan/Mirror links only after a real broadcast.

## Environment variable rules

- Canonical names: `ENV_KEYS` in `packages/shared/src/constants/registry.ts`.
- Wallet init uses `NEXT_PUBLIC_REOWN_PROJECT_ID` (`lib/reown.ts`).
- Topic id canonical name: `HEDERA_ATTESTATION_TOPIC_ID`.
- Update `.env.example`, `template.json`, and `docs/configuration.md` together when adding keys.

## Extending the template

Follow guides in `docs/guides/`:

- `add-a-hedera-service.md`
- `add-a-wallet-provider.md`
- `add-a-network.md`
- `implement-a-transaction.md`

## Common pitfalls

- Treating `/api/attest` success as HCS/registry inclusion.
- Claiming HTS token creation exists (it does not).
- Using DER portal keys as `HEDERA_OPERATOR_PRIVATE_KEY`.
- Pinning an old `viem` without `viem/tempo` while on wagmi 3 / Reown AppKit.
- Duplicating network URLs outside `@sh/shared`.
- Writing UI/design essays into `docs/` instead of technical behavior.

## Documentation

Human docs: `docs/index.md`. Keep `packages/nextjs/components/docs/DocsContent.ts` short and consistent with `/docs`. Prefer editing markdown over expanding marketing copy in the in-app viewer.
