import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const __dirname = dirname(fileURLToPath(import.meta.url));

// eslint-config-next still ships as a legacy config so we bridge it
// via FlatCompat. Once eslint-config-next has native flat-config
// support (16.x) we can drop @eslint/eslintrc.
const compat = new FlatCompat({ baseDirectory: __dirname });

export default [
  {
    ignores: [
      ".next/",
      ".open-next/",
      ".wrangler/",
      "drizzle/",
      "node_modules/",
      "scripts/",
      "screenshots/",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Repos and route handlers frequently accept `unknown` payloads
      // that we narrow with zod. Off here, on again if we get sloppy.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
];
