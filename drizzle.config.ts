import type { Config } from "drizzle-kit";

/*
 * Drizzle kit config — used by `pnpm drizzle-kit generate` to emit SQL
 * migrations from src/db/schema.ts into drizzle/. Migrations are applied
 * to local D1 via `pnpm db:migrate:local` (wrangler d1 execute --local).
 */
export default {
  dialect: "sqlite",
  driver: "d1-http",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  strict: true,
  verbose: true,
} satisfies Config;
