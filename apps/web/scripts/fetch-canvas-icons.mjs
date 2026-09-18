/**
 * Fetch a unified Lucide outline set into public/canvas-icons.
 * Source: lucide-static via jsDelivr (ISC) — consistent 24×24 stroke icons.
 * Normalized for CSS mask: black stroke, no width/height.
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "../public/canvas-icons");
const VER = "0.544.0";
const BASE = `https://cdn.jsdelivr.net/npm/lucide-static@${VER}/icons`;

/** local file name → lucide icon name */
const MAP = {
  alert: "circle-alert",
  menu: "menu",
  "distribute-v": "align-vertical-space-between",
  "folder-plus": "folder-plus",
  "align-center-h": "align-horizontal-justify-center",
  "align-bottom": "align-vertical-justify-end",
  home: "home",
  "align-right": "align-horizontal-justify-end",
  "align-center-v": "align-vertical-justify-center",
  more: "ellipsis",
  loader: "loader-circle",
  "align-top": "align-vertical-justify-start",
  "distribute-h": "align-horizontal-space-between",
  "chevron-left": "chevron-left",
  move: "move",
  "send-back": "send-to-back",
  wand: "wand-sparkles",
  ungroup: "ungroup",
  "align-left": "align-horizontal-justify-start",
  "panel-open": "panel-left-open",
  "bring-front": "bring-to-front",
  keyboard: "keyboard",
  "zoom-in": "zoom-in",
  "zoom-out": "zoom-out",
  video: "video",
  unlock: "unlock",
  upload: "upload",
  undo: "undo-2",
  text: "type",
  trash: "trash",
  subject: "user-round",
  snap: "magnet",
  share: "share-2",
  select: "mouse-pointer-2",
  history: "history",
  search: "search",
  scissors: "scissors",
  retry: "rotate-cw",
  redo: "redo-2",
  prompt: "sparkles",
  plus: "plus",
  play: "play",
  pencil: "pencil",
  pause: "pause",
  panorama: "globe",
  "panel-bottom": "panel-bottom",
  "panel-close": "panel-left-close",
  palette: "palette",
  minus: "minus",
  outpaint: "expand",
  inpaint: "paintbrush",
  info: "info",
  hand: "hand",
  help: "circle-question-mark",
  image: "image",
  frame: "frame",
  grid: "grid-3x3",
  group: "group",
  folder: "folder",
  file: "file",
  fit: "scan",
  eraser: "eraser",
  download: "download",
  // director: custom cube+orbit SVG (not lucide clapperboard)
  dots: "grip",
  copy: "copy",
  check: "check",
  close: "x",
  brush: "brush",
  camera: "camera",
  audio: "audio-lines",
  blank: "square",
  link: "link",
  lock: "lock",
  message: "message-square",
  maximize: "maximize-2",
};

function normalize(svg) {
  const start = svg.indexOf("<svg");
  const body = start >= 0 ? svg.slice(start) : svg;
  return body
    .replace(/\s+class="[^"]*"/g, "")
    .replace(/\s+width="24"/g, "")
    .replace(/\s+height="24"/g, "")
    .replace(/stroke="currentColor"/g, 'stroke="black"')
    .replace(/stroke-width="2"/g, 'stroke-width="1.75"')
    .replace(/>\s+</g, "><")
    .replace(/\n+/g, "")
    .trim();
}

async function fetchOne(local, lucide, attempt = 1) {
  const url = `${BASE}/${lucide}.svg`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.text();
    const out = normalize(raw);
    if (!out.includes("viewBox")) throw new Error("missing viewBox");
    await writeFile(path.join(OUT, `${local}.svg`), `${out}\n`, "utf8");
    return local;
  } catch (err) {
    if (attempt < 4) {
      await new Promise((r) => setTimeout(r, 400 * attempt));
      return fetchOne(local, lucide, attempt + 1);
    }
    throw new Error(`${local} ← ${lucide}: ${err.message ?? err}`);
  }
}

async function mapPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let i = 0;
  async function run() {
    while (i < items.length) {
      const idx = i;
      i += 1;
      results[idx] = await worker(items[idx], idx);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => run()),
  );
  return results;
}

await mkdir(OUT, { recursive: true });
const entries = Object.entries(MAP);
const settled = await mapPool(entries, 6, async ([local, lucide]) => {
  try {
    await fetchOne(local, lucide);
    return { ok: true, local };
  } catch (err) {
    return { ok: false, local, err: String(err.message ?? err) };
  }
});

const ok = settled.filter((r) => r.ok);
const fail = settled.filter((r) => !r.ok);
console.log(`Wrote ${ok.length}/${entries.length} icons → ${OUT}`);
if (fail.length) {
  console.error("Failed:\n" + fail.map((f) => f.err).join("\n"));
  process.exit(1);
}
