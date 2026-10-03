# Testing

Scripts are defined on the root `package.json` and workspace packages. Run from the repository root.

## Automated suites

| Command | What runs |
| --- | --- |
| `yarn shared:test` | Vitest — env, attestation, policy, decimal, explorer, schemas |
| `yarn workspace @sh/nextjs test` | Vitest — `lib/networks.test.ts`, `lib/reown.test.ts` |
| `yarn hardhat:test` | Mocha/Chai — `PricedAssetRegistry`, ABI, rejection mapping |
| `yarn test` | All of the above in sequence |

Watch (shared only): `yarn test:watch`.

## Quality gates

| Command | Purpose |
| --- | --- |
| `yarn check-types` | `tsc --noEmit` in shared, hardhat, nextjs |
| `yarn lint` | ESLint per package |
| `yarn format` / `yarn format:check` | Prettier |
| `yarn build` | `yarn next:build` (shared builds on install / `yarn shared:build`) |
| `yarn verify` | format:check + lint + check-types + test + build |

CI (`.github/workflows/ci.yml`): install → shared build → check-types → lint → test → build on Node 22.15.0.

## Manual testnet verification

Not automated. For bounty eligibility you must broadcast at least one real testnet transaction and keep a HashScan or Mirror link.

Suggested proofs (any one real tx counts):

1. `yarn hardhat:deploy` — registry creation receipt on HashScan
2. A successful `recordIssuance` once the app/operator write path is finished
3. An HCS submit once publish is implemented

Document the link in your submission materials; do not invent transaction ids in docs.

## Contract-focused tips

- Local tests never need operator keys or network access.
- After changing Solidity, run `yarn hardhat:compile` and `yarn hardhat:generate:abis` so `@sh/shared` ABI stays aligned (`generateTsAbis.ts`).
- Policy/error tables are asserted between TypeScript and ABI — update both sides together.
