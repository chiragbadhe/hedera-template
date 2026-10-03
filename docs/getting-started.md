# Getting started

Goal: from a clean checkout to a running app on Hedera **testnet**, with a deployed registry address configured.

## Prerequisites

- Node.js ≥ 20.18.3 (`node -v`)
- Corepack Yarn 4.9.2: `corepack enable && corepack prepare yarn@4.9.2 --activate`
- Git
- Testnet HBAR from [https://portal.hedera.com/faucet](https://portal.hedera.com/faucet)

## 1. Install

```bash
yarn install
```

`postinstall` builds `@sh/shared`. Confirm `packages/shared/dist` exists.

## 2. Configure environment

```bash
cp .env.example .env
```

Minimum for deploy:

```bash
HEDERA_NETWORK=testnet
HEDERA_OPERATOR_ACCOUNT_ID=0.0.x
HEDERA_OPERATOR_PRIVATE_KEY=0x…   # 64 hex bytes, 0x-prefixed
```

Generate keys if needed:

```bash
yarn hardhat:account:generate
```

Paste the printed account id and private key into `.env`, then fund the account.

Optional for wallets in the browser:

```bash
NEXT_PUBLIC_REOWN_PROJECT_ID=your_reown_cloud_id
```

Full variable reference: [configuration.md](./configuration.md).

## 3. Compile and unit-test contracts

```bash
yarn hardhat:compile
yarn hardhat:test
```

These tests use an in-process Hardhat network and `MockPythOracle` — no testnet required.

## 4. Deploy the registry to testnet

```bash
yarn hardhat:deploy
```

Copy `NEXT_PUBLIC_REGISTRY_ADDRESS` (and contract id if printed) into `.env` or `packages/nextjs/.env.local`. Deploy metadata is also written under `.deploy/`.

Verify the address on HashScan (link printed by the script).

## 5. Start the frontend

```bash
yarn next:dev
```

Open [http://localhost:3000](http://localhost:3000).

| Route | Purpose |
| --- | --- |
| `/` | Dashboard / oracle snapshot |
| `/issue` | Issue form (see limitations below) |
| `/verify` | Digest verification UI |
| `/docs` | In-app doc summaries |

## 6. Connect a wallet (optional for reads)

Use the header wallet control:

- **EVM / Reown** for JSON-RPC style sessions on chain id 296 (testnet)
- **Native Hedera** for HashPack / Blade / Kabila via WalletConnect

Select **testnet** in the network selector so the wallet chain matches the app.

## 7. Run the primary read workflow

1. Confirm the dashboard shows a Pyth observation (or call `GET /api/oracle`).
2. Optionally run `yarn hardhat:oracle:read` from the repo root.
3. If you already have an attestation digest and HCS topic, open `/verify` and submit them.

## 8. Verify results

| Check | How |
| --- | --- |
| Oracle readable | Dashboard or `yarn hardhat:oracle:read` |
| Registry deployed | HashScan address from deploy output |
| App boots | `/` returns 200 locally |
| Digest verify (when you have one) | `/verify` or `POST /api/verify` |

## Important: issue flow status

`POST /api/attest` currently:

1. Reads Pyth
2. Evaluates policy
3. Computes the attestation digest
4. Returns a **synthetic** `transactionHash`

It does **not** yet publish to HCS or call `recordIssuance`. Completing that path is covered in [guides/implement-a-transaction.md](./guides/implement-a-transaction.md) and [transaction-lifecycle.md](./transaction-lifecycle.md).

## Scaffold via CLI

When this repo is public:

```bash
npm create scaffold-hbar@latest -- --template owner/repo
```

Then run the same env + deploy + `yarn next:dev` steps. Manifest: [`template.json`](../template.json).

## Next reading

- [Architecture](./architecture.md)
- [Hedera integration](./hedera-integration.md)
- [Troubleshooting](./troubleshooting.md)
