/**
 * 续跑：补分镜 8/9 + 全量 I2V + 剪映导出（跳过已有结果）
 */
import fs from "node:fs";
import path from "node:path";

const BASE = "http://localhost:3001/api";
const PROJECT_ID = "cmup7iu5v613a7089dfaab506";
const OUT_DIR = "G:/project/JoyAI/docs/_tmp";
const REPORT = path.join(OUT_DIR, "yanerdaoling-resume-report.json");

const IMAGE_AVOID =
  "文字、字幕、水印、logo、对话框、二维码、畸形手指、重复肢体、崩坏五官";
const VIDEO_AVOID =
  "BGM、配乐说明、文字字幕、水印、logo、UI 界面、分屏、拼贴";
const KIND_LABEL = { character: "角色", scene: "场景", prop: "道具" };

let token = "";

async function api(method, p, body, retries = 3) {
  let last;
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(BASE + p, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const t = await r.text();
      const j = JSON.parse(t);
      if (!r.ok) throw new Error(`${method} ${p} ${r.status} ${t.slice(0, 500)}`);
      return j;
    } catch (e) {
      last = e;
      console.log(`  api retry ${i + 1}/${retries}: ${e.message || e}`);
      await sleep(2000 * (i + 1));
    }
  }
  throw last;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitJob(id, label, maxPolls = 180, intervalMs = 5000) {
  for (let i = 0; i < maxPolls; i++) {
    await sleep(intervalMs);
    const j = await api("GET", `/jobs/${id}`);
    if (i % 3 === 0 || ["succeeded", "failed", "cancelled"].includes(j.status)) {
      console.log(`  [${label}] poll ${i} ${j.status}${j.error ? " " + j.error : ""}`);
    }
    if (["succeeded", "failed", "cancelled"].includes(j.status)) return j;
  }
  throw new Error(`timeout ${id}`);
}

function pickMedia(job) {
  const assets = job.assets || [];
  const first = assets.find((a) => a.url) || assets[0];
  return {
    url: first?.url || job.result?.urls?.[0] || null,
    assetId: first?.id || job.result?.assetIds?.[0] || null,
  };
}

function trimJoin(parts) {
  return parts.map((p) => (typeof p === "string" ? p.trim() : "")).filter(Boolean).join("\n");
}

function assetRegistryName(asset, all) {
  if (!asset.parentId) return asset.name.trim();
  const parent = all.find((a) => a.id === asset.parentId);
  return parent ? `${parent.name.trim()}/${asset.name.trim()}` : asset.name.trim();
}

function resolveShotRefs(shot, project) {
  const kindOrder = ["character", "scene", "prop"];
  const linked = project.assets.filter(
    (a) => (shot.assetRefs || []).includes(a.id) && (a.assetId || a.imageUrl),
  );
  const ordered = kindOrder.flatMap((k) => linked.filter((a) => a.kind === k));
  return ordered.map((asset, i) => ({
    index: i + 1,
    asset,
    label: `${KIND_LABEL[asset.kind]}「${assetRegistryName(asset, project.assets)}」`,
    registryName: assetRegistryName(asset, project.assets),
  }));
}

function renderMentions(text, slots) {
  if (!text) return text;
  const byName = new Map();
  for (const s of slots) {
    byName.set(s.registryName, s.index);
    byName.set(s.asset.name.trim(), s.index);
    for (const al of s.asset.aliases || []) if (al?.trim()) byName.set(al.trim(), s.index);
  }
  return text.replace(/@\[([^\]]+)\]/g, (full, name) => {
    const idx = byName.get(String(name).trim());
    return idx != null ? `图${idx}` : full;
  });
}

function buildShotImagePrompt(shot, project) {
  const refs = resolveShotRefs(shot, project);
  const raw =
    shot.imagePrompt?.trim() ||
    [shot.visual?.trim(), shot.dialogue?.trim() ? `对白氛围：「${shot.dialogue.trim()}」` : ""]
      .filter(Boolean)
      .join("。") ||
    "空镜头";
  const body = renderMentions(raw, refs);
  const refDecl =
    refs.length === 0
      ? ""
      : `参考图：${refs.map((s) => `图${s.index}=${s.label}`).join("；")}。画面中上述主体须与对应参考图外观一致。`;
  return trimJoin([
    `分镜静帧，画幅 ${project.settings.ratio}`,
    project.settings.style ? `风格：${project.settings.style}` : "",
    refDecl,
    `画面：${body}`,
    "电影构图，单帧关键画面，叙事清楚。",
    `Avoid: ${IMAGE_AVOID}`,
  ]);
}

function buildShotVideoPrompt(shot, project) {
  const refs = resolveShotRefs(shot, project);
  const raw =
    shot.videoPrompt?.trim() ||
    shot.visual?.trim() ||
    shot.imagePrompt?.trim() ||
    "镜头内动作自然推进";
  const body = renderMentions(raw, refs);
  const duration =
    shot.duration && shot.duration > 0 ? shot.duration : project.settings.duration || 5;
  return trimJoin([
    `镜头时长约 ${duration} 秒，画幅 ${project.settings.ratio}`,
    project.settings.style ? `风格：${project.settings.style}` : "",
    "图生视频：以首帧分镜图为起点，自然演绎镜头内动作，保持人物造型与场景一致。",
    `动态：${body}`,
    shot.dialogue?.trim()
      ? `可配合对白口型氛围，不要烧录字幕：${shot.dialogue.trim()}`
      : null,
    `Avoid: ${VIDEO_AVOID}`,
  ]);
}

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

const login = await fetch(`${BASE}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "admin", password: "admin123" }),
}).then((r) => r.json());
token = login.accessToken || login.token;

let p = await api("GET", `/manju/projects/${PROJECT_ID}`);
let draft = p.draft;
const epId = draft.episodes[0].id;
const report = {
  startedAt: new Date().toISOString(),
  storyboards: [],
  videos: [],
  issues: [],
};

console.log("resume", p.title, "assetsWithImage", draft.assets.filter((a) => a.imageUrl).length, "storyboards", draft.shots.filter((s) => s.storyboardImageUrl).length, "videos", draft.shots.filter((s) => s.videoUrl).length);

// recover: if shot has storyboardJobId succeeded but no url, pull from job
for (const shot of draft.shots) {
  if (!shot.storyboardImageUrl && shot.storyboardJobId) {
    try {
      const j = await api("GET", `/jobs/${shot.storyboardJobId}`);
      const m = pickMedia(j);
      if (j.status === "succeeded" && m.url) {
        shot.storyboardImageUrl = m.url;
        shot.storyboardAssetId = m.assetId;
        shot.storyboardStatus = "succeeded";
        console.log("recovered storyboard", shot.index, m.url.slice(0, 60));
      }
    } catch {}
  }
}
await api("PATCH", `/manju/projects/${PROJECT_ID}`, { draft });
p = await api("GET", `/manju/projects/${PROJECT_ID}`);
draft = p.draft;

// missing storyboards
const needSb = draft.shots.filter((s) => s.episodeId === epId && !s.storyboardImageUrl);
console.log("\n=== storyboards missing", needSb.length, "===");
await mapPool(needSb, 2, async (shot) => {
  const label = `shot#${shot.index}`;
  try {
    p = await api("GET", `/manju/projects/${PROJECT_ID}`);
    draft = p.draft;
    const live = draft.shots.find((s) => s.id === shot.id) || shot;
    const projectView = {
      settings: draft.settings,
      assets: draft.assets,
      shots: draft.shots,
      episodes: draft.episodes,
    };
    const refs = resolveShotRefs(live, projectView);
    const job = await api("POST", "/jobs", {
      kind: "image",
      input: {
        prompt: buildShotImagePrompt(live, projectView),
        ratio: draft.settings.ratio,
        n: 1,
        modelId: draft.settings.imageModelId,
        manjuProjectId: PROJECT_ID,
        referenceAssetIds: refs.map((r) => r.asset.assetId).filter(Boolean),
      },
    });
    draft.shots = draft.shots.map((s) =>
      s.id === shot.id ? { ...s, storyboardJobId: job.id, storyboardStatus: "queued" } : s,
    );
    await api("PATCH", `/manju/projects/${PROJECT_ID}`, { draft });
    const done = await waitJob(job.id, label, 120, 5000);
    const media = pickMedia(done);
    if (done.status === "succeeded" && media.url) {
      p = await api("GET", `/manju/projects/${PROJECT_ID}`);
      draft = p.draft;
      draft.shots = draft.shots.map((s) =>
        s.id === shot.id
          ? {
              ...s,
              storyboardImageUrl: media.url,
              storyboardAssetId: media.assetId,
              storyboardJobId: job.id,
              storyboardStatus: "succeeded",
              storyboardStale: false,
            }
          : s,
      );
      await api("PATCH", `/manju/projects/${PROJECT_ID}`, { draft });
      console.log("OK", label);
      report.storyboards.push({ index: shot.index, ok: true, jobId: job.id });
    } else {
      console.log("FAIL", label, done.error || done.status);
      report.storyboards.push({ index: shot.index, ok: false, error: done.error });
      report.issues.push({ step: "storyboard", index: shot.index, error: done.error });
    }
  } catch (e) {
    console.error("ERR", label, e);
    report.issues.push({ step: "storyboard", index: shot.index, error: String(e) });
  }
});

// videos
p = await api("GET", `/manju/projects/${PROJECT_ID}`);
draft = p.draft;
const needVid = draft.shots.filter(
  (s) => s.episodeId === epId && s.storyboardImageUrl && !s.videoUrl,
);
console.log("\n=== videos missing", needVid.length, "===");
await mapPool(needVid, 1, async (shot) => {
  const label = `video#${shot.index}`;
  try {
    p = await api("GET", `/manju/projects/${PROJECT_ID}`);
    draft = p.draft;
    const live = draft.shots.find((s) => s.id === shot.id) || shot;
    const projectView = {
      settings: draft.settings,
      assets: draft.assets,
      shots: draft.shots,
      episodes: draft.episodes,
    };
    const duration =
      live.duration && live.duration > 0 ? live.duration : draft.settings.duration || 5;
    const job = await api("POST", "/jobs", {
      kind: "video",
      input: {
        prompt: buildShotVideoPrompt(live, projectView),
        ratio: draft.settings.ratio,
        duration,
        modelId: draft.settings.videoModelId,
        manjuProjectId: PROJECT_ID,
        referenceAssetIds: live.storyboardAssetId ? [live.storyboardAssetId] : undefined,
        referenceUrls:
          !live.storyboardAssetId && live.storyboardImageUrl
            ? [live.storyboardImageUrl]
            : undefined,
        refMode: "first_last",
      },
    });
    draft.shots = draft.shots.map((s) =>
      s.id === shot.id ? { ...s, videoJobId: job.id, videoStatus: "queued" } : s,
    );
    await api("PATCH", `/manju/projects/${PROJECT_ID}`, { draft });
    const done = await waitJob(job.id, label, 180, 8000);
    const media = pickMedia(done);
    if (done.status === "succeeded" && media.url) {
      p = await api("GET", `/manju/projects/${PROJECT_ID}`);
      draft = p.draft;
      draft.shots = draft.shots.map((s) =>
        s.id === shot.id
          ? {
              ...s,
              videoUrl: media.url,
              videoAssetId: media.assetId,
              videoJobId: job.id,
              videoStatus: "succeeded",
              videoStale: false,
            }
          : s,
      );
      const steps = new Set(draft.completedSteps || []);
      steps.add("storyboard-video");
      draft.completedSteps = [...steps];
      await api("PATCH", `/manju/projects/${PROJECT_ID}`, { draft });
      console.log("OK", label);
      report.videos.push({ index: shot.index, ok: true, jobId: job.id, url: media.url });
    } else {
      console.log("FAIL", label, done.error || done.status);
      report.videos.push({ index: shot.index, ok: false, error: done.error || done.status });
      report.issues.push({ step: "video", index: shot.index, error: done.error || done.status });
    }
  } catch (e) {
    console.error("ERR", label, e);
    report.issues.push({ step: "video", index: shot.index, error: String(e) });
  }
});

// export
console.log("\n=== export ===");
try {
  const wf = await api("GET", `/manju/projects/${PROJECT_ID}/workflow`);
  report.workflow = wf;
  console.log("workflow", JSON.stringify(wf));
  const r = await fetch(
    `${BASE}/manju/projects/${PROJECT_ID}/export/jianying?episodeId=${encodeURIComponent(epId)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const buf = Buffer.from(await r.arrayBuffer());
  if (r.ok && buf.length > 100) {
    const zipPath = path.join(OUT_DIR, "yanerdaoling-jianying.zip");
    fs.writeFileSync(zipPath, buf);
    report.jianying = { ok: true, bytes: buf.length, path: zipPath };
    console.log("jianying", buf.length);
  } else {
    report.jianying = { ok: false, status: r.status, body: buf.toString("utf8").slice(0, 300) };
    console.log("jianying fail", r.status);
  }
} catch (e) {
  report.issues.push({ step: "export", error: String(e) });
}

p = await api("GET", `/manju/projects/${PROJECT_ID}`);
draft = p.draft;
report.finishedAt = new Date().toISOString();
report.final = {
  assetsWithImage: draft.assets.filter((a) => a.imageUrl).length,
  storyboards: draft.shots.filter((s) => s.storyboardImageUrl).length,
  videos: draft.shots.filter((s) => s.videoUrl).length,
  shots: draft.shots.map((s) => ({
    index: s.index,
    title: s.title,
    img: !!s.storyboardImageUrl,
    vid: !!s.videoUrl,
  })),
};
fs.writeFileSync(REPORT, JSON.stringify(report, null, 2), "utf8");
console.log("\nDONE", report.final);
console.log("issues", report.issues.length);
