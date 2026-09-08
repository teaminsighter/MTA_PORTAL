import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

const rootDir = import.meta.dirname;

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // "server-only" throws when imported outside an RSC boundary. Tests
    // exercise route handlers directly so we alias it to a no-op.
    alias: {
      "server-only": resolve(rootDir, "tests/helpers/server-only-shim.ts"),
      "@": resolve(rootDir, "src"),
    },
    // Route handlers use `next/cache` for revalidatePath; stub it so tests
    // don't need a full Next runtime.
    setupFiles: ["tests/helpers/setup.ts"],
  },
});
