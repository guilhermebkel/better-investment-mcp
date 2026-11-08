import { defineConfig } from "tsup";
import packageJson from "./package.json" with { type: "json" };

// Why: one bundled file keeps `npx` fast and lets the Docker image copy a single file. Native packages (DuckDB) will be added to `external` by the issue that brings them.
export default defineConfig({
  entry: { main: "src/main.ts" },
  format: ["esm"],
  platform: "node",
  target: "node22",
  clean: true,
  splitting: false,
  sourcemap: false,
  noExternal: [/.*/],
  banner: { js: "#!/usr/bin/env node" },
  define: { __PACKAGE_VERSION__: JSON.stringify(packageJson.version) },
});
