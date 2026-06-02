import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const outDir = join(root, "www");
const assets = [
  "index.html",
  "styles.css",
  "app.js",
  "icon.svg",
  "manifest.webmanifest",
  "sw.js",
];

if (existsSync(outDir)) {
  rmSync(outDir, { recursive: true, force: true });
}
mkdirSync(outDir, { recursive: true });

for (const asset of assets) {
  const src = join(root, asset);
  if (!existsSync(src)) {
    console.warn(`Skipping missing asset: ${asset}`);
    continue;
  }
  cpSync(src, join(outDir, asset), { recursive: true });
}

console.log("Web assets prepared in /www");
