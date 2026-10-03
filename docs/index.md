# Documentation

Technical documentation for the **Priced Asset Registry** Scaffold-HBAR template.

This index is the map. The [root README](../README.md) is the short entry point; these pages go deeper without duplicating every section.

## Reading order

### First-time users

1. [Getting started](./getting-started.md) — install, env, deploy, run
2. [Configuration](./configuration.md) — environment variables
3. [Wallet connectivity](./wallet-connectivity.md) — connect an account
4. [Transaction lifecycle](./transaction-lifecycle.md) — what the app actually does today

### Developers integrating the template

1. [Architecture](./architecture.md)
2. [Hedera integration](./hedera-integration.md)
3. [Network configuration](./network-configuration.md)
4. [Testing](./testing.md) and [Deployment](./deployment.md)

### Contributors

1. [Contributing](./contributing.md)
2. [Security](./security.md)
3. [Troubleshooting](./troubleshooting.md)
4. Root [AGENTS.md](../AGENTS.md) for AI-assisted work

### Extending Hedera functionality

1. [Add a Hedera service](./guides/add-a-hedera-service.md)
2. [Implement a transaction](./guides/implement-a-transaction.md)
3. [Add a wallet provider](./guides/add-a-wallet-provider.md)
4. [Add a network](./guides/add-a-network.md)

## In-app docs

The Next.js route `/docs` renders short summaries from `packages/nextjs/components/docs/DocsContent.ts`. Prefer this `docs/` tree for authoritative setup and architecture detail.
