# Guide: Add a Hedera service

Use this when extending the template with another Hedera capability (extra HCS topics, HTS operations, Schedules, etc.) without breaking package boundaries.

## 1. Decide where logic lives

| Concern | Put it in |
| --- | --- |
| Pure types, ids, hashing, validation | `packages/shared` |
| On-chain Solidity | `packages/hardhat/contracts` |
| Server I/O (Mirror, SDK client, RPC) | `packages/nextjs/services` |
| HTTP surface | `packages/nextjs/app/api/.../route.ts` |
| UI | `packages/nextjs/components` / `app` |

## 2. Configuration

1. Add env key names to `ENV_KEYS` / aliases / allowlists in `packages/shared/src/constants/registry.ts`.
2. Teach `resolveEnvironment` to read them if typed access is needed.
3. Update `.env.example`, `template.json` `env` section, and [configuration.md](../configuration.md).

## 3. Network endpoints

If the service needs a new URL per network, extend `NETWORK_ENDPOINTS` or add a parallel map in shared constants — do not hardcode URLs in React components.

## 4. Implement and test

1. Unit-test pure logic in `packages/shared`.
2. If Solidity is involved, add Hardhat tests and keep rejection/policy tables in sync.
3. Prefer Mirror Node for post-consensus verification rather than trusting the submitting client alone.

## 5. Document honestly

Update [hedera-integration.md](../hedera-integration.md) with what is implemented vs planned. Link a real HashScan/Mirror example only after you have executed the transaction.
