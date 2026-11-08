import { execFileSync } from "node:child_process";
import { build } from "esbuild";
import { findLicenseProblems, listBundledPackages } from "./license-rules.mjs";

const KILOBYTE = 1024;
const MAX_OUTPUT_KILOBYTES = 65_536;
// Why: the same packages tsup.config.ts keeps external; they are installed with the package, so their licenses count too.
const EXTERNAL_PACKAGES = ["@duckdb/node-api"];

const result = await build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  write: false,
  metafile: true,
  platform: "node",
  format: "esm",
  logLevel: "silent",
  alias: { "@": "./src" },
  define: { __PACKAGE_VERSION__: "\"0.0.0\"" },
  external: EXTERNAL_PACKAGES,
});
const bundled = listBundledPackages(Object.keys(result.metafile.inputs));
const runtimeOutput = execFileSync("pnpm", ["licenses", "list", "--prod", "--json"], { encoding: "utf8", maxBuffer: MAX_OUTPUT_KILOBYTES * KILOBYTE });
const runtimeNames = Object.values(JSON.parse(runtimeOutput)).flat().map((entry) => entry.name);
const checked = [...new Set([...bundled, ...runtimeNames])];
const output = execFileSync("pnpm", ["licenses", "list", "--json"], { encoding: "utf8", maxBuffer: MAX_OUTPUT_KILOBYTES * KILOBYTE });
const licenseToPackages = JSON.parse(output);
const packageToLicense = {};
for (const [license, packages] of Object.entries(licenseToPackages)) {
  for (const entry of packages.filter((candidate) => checked.includes(candidate.name))) {
    packageToLicense[entry.name] = license;
  }
}
const unknown = checked.filter((name) => packageToLicense[name] === undefined);
const problems = [...findLicenseProblems(packageToLicense), ...unknown.map((name) => `${name} is bundled and has no license entry.`)];
if (problems.length > 0) {
  process.stderr.write(`${problems.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`licenses ok: ${checked.length} packages, ${[...new Set(Object.values(packageToLicense))].join(", ")}\n`);
}
