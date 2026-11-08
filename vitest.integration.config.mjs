import { defineConfig } from "vitest/config";
import baseConfig from "./vitest.config.mjs";

const SETUP_TIMEOUT_MS = 120_000;

// Why: integration tests (the ones that reach a real service or a real process) stay out of `pnpm test`; `pnpm test:integration` runs only them and passes while there are none.
export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: ["scripts/**/*.integration.test.{mjs,ts}"],
    exclude: ["**/node_modules/**", "dist/**"],
    testTimeout: SETUP_TIMEOUT_MS,
    hookTimeout: SETUP_TIMEOUT_MS,
    fileParallelism: false,
    passWithNoTests: true,
  },
});
