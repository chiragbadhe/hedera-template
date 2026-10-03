import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // The workspace root, so `next build` can follow `@sh/shared` into `packages/shared`.
  outputFileTracingRoot: path.join(__dirname, "../.."),
  reactStrictMode: true,
  devIndicators: false,
  webpack: (config, { dev, webpack }) => {
    // The Hedera SDK reaches for these Node builtins; none of them are used in the
    // browser path, and leaving them unstubbed makes the client bundle fail to build.
    config.resolve.fallback = { fs: false, net: false, tls: false };
    // `@coinbase/cdp-sdk` (via wagmi Base Account → Reown) loads optional `@x402/*`
    // peers with dynamic import(). Webpack still resolves those strings at build
    // time; ignore them so the wallet stack works without x402 payment deps.
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^@x402\//,
      }),
    );
    if (dev) {
      config.watchOptions = { followSymlinks: true };
      // Watch the workspace rather than the hoisted node_modules copy, so editing
      // `@sh/shared` reloads the app instead of serving a stale build.
      config.snapshot = { ...(config.snapshot as object), managedPaths: [] };
    }
    return config;
  },
};

export default nextConfig;
