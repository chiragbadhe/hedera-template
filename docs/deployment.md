# Deployment

## Contracts

| Script | Network | Notes |
| --- | --- | --- |
| `yarn hardhat:deploy:local` | Hardhat in-process | Deploys mock Pyth + registry; dry run |
| `yarn hardhat:deploy` | `hederaTestnet` | Default bounty / demo path |
| `yarn hardhat:deploy:mainnet` | `hederaMainnet` | Real value — explicit only |

Prerequisites: funded operator in env; see [getting-started.md](./getting-started.md).

Outputs:

- Console: address, contract id, HashScan URL
- File under `.deploy/` (gitignored patterns may vary — do not commit secrets)

Point the app at the deployment:

```bash
NEXT_PUBLIC_REGISTRY_ADDRESS=0x…
NEXT_PUBLIC_REGISTRY_CONTRACT_ID=0.0.x   # optional
```

Post-deploy checks:

```bash
yarn registry:read
yarn registry:verify
yarn hardhat:oracle:read
```

## Frontend

The Next.js app is a standard App Router deployment (Vercel, Node host, etc.).

1. Build: `yarn build` (or `yarn next:build`)
2. Start: `yarn next:serve` (`next start`) after build
3. Set the same public env vars in the host; keep operator keys **only** on the server runtime if you add operator-signed routes

`outputFileTracingRoot` in `next.config.ts` points at the monorepo root so `@sh/shared` traces correctly.

## Local development vs networks

| Mode | Contracts | Frontend |
| --- | --- | --- |
| UI only against public testnet Pyth | Optional registry | `yarn next:dev` + `HEDERA_NETWORK=testnet` |
| Full local contract dry-run | `deploy:local` | Point RPC at local if you run a node; mock oracle otherwise |
| Testnet integration | `hardhat:deploy` | Configure registry + topic + Reown id |

## Mainnet

Use `yarn hardhat:deploy:mainnet` only with intentional funding and review. Default env and UI remain testnet-oriented.
