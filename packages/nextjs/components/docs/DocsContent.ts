export interface DocArticle {
  id: string;
  slug: string;
  title: string;
  category: string;
  summary: string;
  content: string;
}

/**
 * Short in-app summaries. Authoritative docs live in the repo `/docs` tree.
 * Keep this file aligned with implementation — no design-system essays.
 */
export const DOCS_ARTICLES: DocArticle[] = [
  {
    id: "getting-started",
    slug: "getting-started",
    category: "Getting Started",
    title: "First run",
    summary: "Install, configure, deploy the registry, and start Next.js",
    content: `
# First run

1. \`yarn install\`
2. \`cp .env.example .env\` and set \`HEDERA_OPERATOR_*\` (see \`yarn hardhat:account:generate\`)
3. \`yarn hardhat:compile && yarn hardhat:test\`
4. \`yarn hardhat:deploy\` then set \`NEXT_PUBLIC_REGISTRY_ADDRESS\`
5. \`yarn next:dev\` → http://localhost:3000

Full guide: repository \`docs/getting-started.md\`.

**Note:** \`POST /api/attest\` currently returns a mock transaction hash after oracle + policy + digest. It does not yet publish HCS or call \`recordIssuance\`.
`,
  },
  {
    id: "reown-integration",
    slug: "reown-integration",
    category: "Wallet & Connectivity",
    title: "Wallets",
    summary: "Reown AppKit (EVM) and native Hedera WalletConnect",
    content: `
# Wallets

- **EVM:** Reown AppKit + wagmi (\`lib/reown.ts\`). Hedera chain ids 296 (testnet) and 295 (mainnet).
- **Native:** \`@hashgraph/hedera-wallet-connect\` (\`lib/nativeHedera.ts\`) for HashPack / Blade / Kabila-style sessions.
- **Hook:** \`useWallet()\` from \`~~/hooks/useWallet\`.

Set \`NEXT_PUBLIC_REOWN_PROJECT_ID\` from cloud.reown.com (a local fallback exists for smoke tests).

Connecting a wallet is not the same as completing an on-chain issuance. See \`docs/wallet-connectivity.md\`.
`,
  },
  {
    id: "hedera-networks",
    slug: "hedera-networks",
    category: "Network & Infrastructure",
    title: "Networks",
    summary: "Chain ids, Hashio relays, and Mirror Node bases",
    content: `
# Networks

| Network | Chain ID | JSON-RPC | Mirror |
| --- | --- | --- | --- |
| testnet | 296 | testnet.hashio.io | testnet.mirrornode.hedera.com |
| mainnet | 295 | mainnet.hashio.io | mainnet.mirrornode.hedera.com |
| previewnet | 297 | previewnet.hashio.io | previewnet.mirrornode.hedera.com |
| localnode | 31337 | 127.0.0.1:8545 | 127.0.0.1:5600 |

Source: \`@sh/shared\` \`NETWORK_ENDPOINTS\`. UI selectable: testnet and mainnet. Default env network: **testnet**.

Details: \`docs/network-configuration.md\`.
`,
  },
  {
    id: "architecture",
    slug: "architecture",
    category: "Architecture",
    title: "Architecture",
    summary: "Monorepo packages and verification flow",
    content: `
# Architecture

- \`packages/shared\` — digests, policy, env, networks, ABI
- \`packages/hardhat\` — \`PricedAssetRegistry\`, deploy scripts, tests
- \`packages/nextjs\` — UI, \`/api/*\`, wallets, Mirror/oracle services

Verification: digest → Mirror HCS payload → optional on-chain record (\`docs/architecture.md\`, \`docs/hedera-integration.md\`).

Pyth on Hedera is **read-only** in this template (see shared oracle constants).
`,
  },
  {
    id: "troubleshooting",
    slug: "troubleshooting",
    category: "Maintenance",
    title: "Troubleshooting",
    summary: "Common setup failures",
    content: `
# Troubleshooting

- **Reown:** set \`NEXT_PUBLIC_REOWN_PROJECT_ID\`
- **Chain mismatch:** switch wallet to chain id 296 on testnet
- **No registry:** run \`yarn hardhat:deploy\` and set \`NEXT_PUBLIC_REGISTRY_ADDRESS\`
- **DER key error:** use \`yarn hardhat:account:generate\` (\`0x\` + 64 hex)
- **Attest “success” not on HashScan:** expected until the write path is implemented (\`docs/transaction-lifecycle.md\`)

More: \`docs/troubleshooting.md\`.
`,
  },
];
