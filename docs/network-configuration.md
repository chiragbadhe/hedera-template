# Network configuration

## Source of truth

`packages/shared/src/constants/networks.ts` defines:

- `HEDERA_NETWORKS` — `testnet` | `mainnet` | `previewnet` | `localnode`
- `USER_SELECTABLE_NETWORKS` — `testnet` | `mainnet` (UI)
- `NETWORK_ENDPOINTS` — JSON-RPC, Mirror, HashScan, chain id
- `LIVE_VALUE_NETWORKS` — `mainnet` (real value)

Frontend display helpers: `packages/nextjs/lib/networks.ts`.

Hardhat network names: `hederaTestnet` (296), `hederaPreviewnet` (297), `hederaMainnet` (295), `hardhat` (31337) in `packages/hardhat/hardhat.config.ts`.

## Endpoint matrix

| Network | Chain ID | JSON-RPC default | Mirror default | HashScan |
| --- | --- | --- | --- | --- |
| testnet | 296 | https://testnet.hashio.io/api | https://testnet.mirrornode.hedera.com | https://hashscan.io/testnet |
| mainnet | 295 | https://mainnet.hashio.io/api | https://mainnet.mirrornode.hedera.com | https://hashscan.io/mainnet |
| previewnet | 297 | https://previewnet.hashio.io/api | https://previewnet.mirrornode.hedera.com | https://hashscan.io/previewnet |
| localnode | 31337 | http://127.0.0.1:8545 | http://127.0.0.1:5600 | http://127.0.0.1:8080 |

Overrides: `HEDERA_JSON_RPC_URL`, `HEDERA_MIRROR_NODE_URL` (and RPC aliases documented in [configuration.md](./configuration.md)).

## EVM vs native paths

| Concern | EVM / JSON-RPC | Native / Mirror |
| --- | --- | --- |
| Pyth read | `eth_call` to Pyth core | — |
| Registry | Solidity via relay | Entity id `0.0.x` optional in env |
| HCS payloads | — | Mirror REST topic messages |
| Wallet session | Reown AppKit / wagmi | Hedera WalletConnect `DAppConnector` |

## Safety

- Unrecognised `HEDERA_NETWORK` values fall back to **testnet** with a warning (see `resolveEnvironment`).
- Mainnet is never selected implicitly.
- UI should treat mainnet as live value (`isLiveValueNetwork`).

## Pyth availability

`PYTH_DEPLOYMENTS` currently lists **testnet** and **mainnet** only. Previewnet / localnode need `PYTH_ORACLE_ADDRESS` (local deploy uses `MockPythOracle`).
