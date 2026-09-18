import { writeFile } from "node:fs/promises";

const url =
  "https://cdn.jsdelivr.net/npm/lucide-static@0.544.0/icons/history.svg";
const res = await fetch(url);
if (!res.ok) throw new Error(`HTTP ${res.status}`);
let svg = await res.text();
const start = svg.indexOf("<svg");
svg = svg
  .slice(start)
  .replace(/\s+class="[^"]*"/g, "")
  .replace(/\s+width="24"/g, "")
  .replace(/\s+height="24"/g, "")
  .replace(/stroke="currentColor"/g, 'stroke="black"')
  .replace(/stroke-width="2"/g, 'stroke-width="1.75"')
  .replace(/>\s+</g, "><")
  .replace(/\n+/g, "")
  .trim();
await writeFile(
  new URL("../public/canvas-icons/history.svg", import.meta.url),
  `${svg}\n`,
);
console.log("wrote history.svg");
