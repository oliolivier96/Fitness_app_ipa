import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const outDir = join(root, "www");

/** iOS home screen needs PNG; derive it from icon.svg so you only maintain icon.svg. */
function writeAppleTouchIconFromSvg() {
  const svgPath = join(root, "icon.svg");
  if (!existsSync(svgPath)) return false;
  const svg = readFileSync(svgPath, "utf8");
  const match = svg.match(/href="data:image\/png;base64,([^"]+)"/);
  if (!match) {
    console.warn("icon.svg: no embedded PNG found — copy icon.svg to apple-touch-icon.png manually.");
    return false;
  }
  const png = Buffer.from(match[1], "base64");
  writeFileSync(join(root, "apple-touch-icon.png"), png);
  console.log("Wrote apple-touch-icon.png from icon.svg");
  return true;
}

writeAppleTouchIconFromSvg();

const assets = [
  "index.html",
  "styles.css",
  "app.js",
  "icon.svg",
  "apple-touch-icon.png",
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
