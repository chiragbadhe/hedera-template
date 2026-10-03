# Contributing

## Ground rules

- Keep changes honest: do not document unfinished write paths as complete.
- Prefer extending `@sh/shared` for cross-package logic (networks, digests, policy, env keys).
- Match existing TypeScript strictness, Prettier, and ESLint configs.
- MIT license — by contributing you agree your work is MIT-licensed.

## Workflow

1. Branch from `main`.
2. Install with `yarn install`.
3. Make focused changes; update docs when behavior or env vars change.
4. Run `yarn verify` (or at least `yarn test && yarn check-types && yarn lint`) before opening a PR.
5. Do not commit `.env`, keys, or `.deploy` secrets.

## Package boundaries

| Change type | Primary package |
| --- | --- |
| Env keys, digests, policy, networks | `packages/shared` |
| Solidity / deploy / contract tests | `packages/hardhat` |
| UI, API routes, wallets | `packages/nextjs` |
| Scaffold metadata / CLI outro | `template.json`, root README |

After Solidity ABI changes, regenerate shared ABI (`yarn hardhat:generate:abis`) and keep tests green.

## Docs

- Authoritative technical docs live in `/docs`.
- Keep in-app `/docs` summaries (`DocsContent.ts`) short and consistent with `/docs`.
- Avoid UI-only design essays in documentation.

## AI-assisted contributions

Follow [AGENTS.md](../AGENTS.md). Agents must not invent HashScan links, pass claims, or secret values.
