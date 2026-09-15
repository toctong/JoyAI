/**
 * Copy catalog JSON into dist so CommonJS `require('./*.json')` works at runtime.
 */
const { mkdirSync, copyFileSync, readdirSync } = require("node:fs");
const { join } = require("node:path");

const srcDir = join(__dirname, "..", "src", "catalog");
const distDir = join(__dirname, "..", "dist", "catalog");

mkdirSync(distDir, { recursive: true });
for (const name of readdirSync(srcDir)) {
  if (!name.endsWith(".json")) continue;
  copyFileSync(join(srcDir, name), join(distDir, name));
  console.log("copied", name);
}
