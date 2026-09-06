import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Makes Cloudflare bindings (D1, KV, R2, env vars) available during
// `next dev` via getCloudflareContext(). Loads wrangler.toml + .dev.vars.
// Uses the `local` env for pnpm dev.
initOpenNextCloudflareForDev({ environment: "local" });

const nextConfig: NextConfig = {
  devIndicators: false,
};

export default nextConfig;
