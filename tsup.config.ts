import { defineConfig } from "tsup";
import packageJson from "./package.json" with { type: "json" };

// Why: one bundled file keeps `npx` fast and lets the Docker image copy a single file.
export default defineConfig({
  entry: { main: "src/main.ts" },
  format: ["esm"],
  platform: "node",
  target: "node22",
  clean: true,
  splitting: false,
  sourcemap: false,
  // Why: DuckDB is native, so its package and bindings stay external and are installed with the package.
  noExternal: [/^(?!@duckdb\/)/],
  external: ["@duckdb/node-api"],
  banner: { js: "#!/usr/bin/env node" },
  define: { __PACKAGE_VERSION__: JSON.stringify(packageJson.version) },
});
