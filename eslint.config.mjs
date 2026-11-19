import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", ".next-e2e/**", "out/**", "build/**", "next-env.d.ts", ".data/**", "uploads/**", "test-results/**", "playwright-report/**"]),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // Product photos are served by our own /media route in several sizes (srcset); next/image would add nothing.
      "@next/next/no-img-element": "off",
    },
  },
]);
