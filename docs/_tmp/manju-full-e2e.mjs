/**
 * 漫剧全流程 E2E（API）：写词 → 资产生图 → 分镜静帧 → I2V → 剪映导出
 * 项目：掩耳盗铃 cmup7iu5v613a7089dfaab506
 *
 * 说明：图/视频 Job 不会自动回写 manju draft（需前端 bindJob），
 * 本脚本轮询成功后自行 PATCH 整份 draft。
 */
import fs from "node:fs";
import path from "node:path";

const BASE = "http://localhost:3001/api";
const PROJECT_ID = "cmup7iu5v613a7089dfaab506";
const OUT_DIR = "G:/project/JoyAI/docs/_tmp";
const REPORT = path.join(OUT_DIR, "yanerdaoling-full-e2e-report.json");

const IMAGE_AVOID =
  "文字、字幕、水印、logo、对话框、二维码、畸形手指、重复肢体、崩坏五官";
const VIDEO_AVOID =
  "BGM、配乐说明、文字字幕、水印、logo、UI 界面、分屏、拼贴";

const KIND_LABEL = { character: "角色", scene: "场景", prop: "道具" };

/** @type {string} */
let token = "";

async function api(method, p, body) {
  const r = await fetch(BASE + p, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const t = await r.text();
  let j;
  try {
    j = JSON.parse(t);
  } catch {
    j = t;
  }
  if (!r.ok) throw new Error(`${method} ${p} ${r.status} ${t.slice(0, 800)}`);
  return j;
}

async function login() {
  const j = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin123" }),
  }).then((r) => r.json());
  token = j.accessToken || j.token;
  if (!token) throw new Error("login failed: " + JSON.stringify(j));
}

async function getProject() {
  return api("GET", `/manju/projects/${PROJECT_ID}`);
}

async function saveDraft(draft) {
  return api("PATCH", `/manju/projects/${PROJECT_ID}`, { draft });
}

async function waitJob(id, label, maxPolls = 120, intervalMs = 5000) {
  for (let i = 0; i < maxPolls; i++) {
    await sleep(intervalMs);
    const j = await api("GET", `/jobs/${id}`);
    const err = j.error ? String(j.error).slice(0, 120) : "";
    if (i % 3 === 0 || ["succeeded", "failed", "cancelled"].includes(j.status)) {
      console.log(`  [${label}] poll ${i} ${j.status}${err ? " " + err : ""}`);
    }
    if (["succeeded", "failed", "cancelled"].includes(j.status)) return j;
  }
  throw new Error(`timeout waiting job ${id} (${label})`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function pickMedia(job) {
  const assets = job.assets || [];
  const first = assets.find((a) => a.url) || assets[0];
  const resultUrls = job.result?.urls;
  const url =
    first?.url ||
    (Array.isArray(resultUrls) ? resultUrls[0] : null) ||
    null;
  const assetId =
    first?.id ||
    (Array.isArray(job.result?.assetIds) ? job.result.assetIds[0] : null) ||
    null;
  return { url, assetId };
}

function trimJoin(parts) {
  return parts
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean)
    .join("\n");
}

function styleLine(settings) {
  const style = settings?.style?.trim();
  return style ? `风格：${style}` : "";
}

function assetRegistryName(asset, all) {
  if (!asset.parentId) return asset.name.trim();
  const parent = all.find((a) => a.id === asset.parentId);
  return parent
    ? `${parent.name.trim()}/${asset.name.trim()}`
    : asset.name.trim();
}

function preferredAssetRatio(kind) {
  if (kind === "character" || kind === "scene") return "16:9";
  return "1:1";
}

function buildAssetPrompt(asset, settings, all) {
  const reg = assetRegistryName(asset, all);
  const title = `${KIND_LABEL[asset.kind]}设定图：${reg}`;
  const d = asset.detail || {};
  const detailBits =
    asset.kind === "character"
      ? [d.age, d.gender, d.hairstyle, d.face, d.gaze, d.clothing, d.traits]
      : asset.kind === "scene"
        ? [d.location, d.timeOfDay, d.architecture, d.lighting, d.atmosphere]
        : [d.propMaterial, d.propTexture, d.propSize, d.propSpecial];
  const detailLine = detailBits
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean)
    .join("；");
  const desc =
    [asset.description?.trim(), detailLine].filter(Boolean).join("。") ||
    "补充清晰外观描述";
  const layout =
    asset.kind === "character"
      ? "布局：横版三视图，纯白干净背景；正面全身、正侧全身、背面全身一致。"
      : asset.kind === "scene"
        ? "布局：单张环境建立镜头，宽景全貌，画面中不要出现人物。"
        : "布局：单张道具特写，浅灰背景，产品级展示，居中清晰。";
  return trimJoin([
    title,
    styleLine(settings),
    `描述：${desc}`,
    layout,
    "要求：细节清晰，适合作为后续分镜一致性参考。",
    `Avoid: ${IMAGE_AVOID}`,
  ]);
}

function resolveShotRefs(shot, project) {
  const kindOrder = ["character", "scene", "prop"];
  const linked = project.assets.filter(
    (a) =>
      (shot.assetRefs || []).includes(a.id) && (a.assetId || a.imageUrl),
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
    for (const al of s.asset.aliases || []) {
      if (al?.trim()) byName.set(al.trim(), s.index);
    }
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
    styleLine(project.settings),
    refDecl,
    `画面：${body}`,
    shot.shotSize || shot.cameraAngle || shot.cameraMove
      ? `镜头：${[shot.shotSize, shot.cameraAngle, shot.cameraMove].filter(Boolean).join(" / ")}`
      : null,
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
    shot.duration && shot.duration > 0
      ? shot.duration
      : project.settings.duration || 5;
  return trimJoin([
    `镜头时长约 ${duration} 秒，画幅 ${project.settings.ratio}`,
    styleLine(project.settings),
    "图生视频：以首帧分镜图为起点，自然演绎镜头内动作，保持人物造型与场景一致。",
    `动态：${body}`,
    shot.dialogue?.trim()
      ? `可配合对白口型氛围，不要烧录字幕：${shot.dialogue.trim()}`
      : null,
    `Avoid: ${VIDEO_AVOID}`,
  ]);
}

function buildAuthorPrompt(project, episodeId) {
  const shots = project.shots.filter((s) => s.episodeId === episodeId);
  const shotBrief = shots
    .map((s) => {
      const assetNames = project.assets
        .filter((a) => (s.assetRefs || []).includes(a.id))
        .map((a) => assetRegistryName(a, project.assets))
        .filter(Boolean)
        .join("、");
      return `#${s.index} 画面:${s.visual} 对白:${s.dialogue || "无"} 资产:${assetNames || "无"}`;
    })
    .join("\n");
  const registryHint = project.assets
    .map((a) => assetRegistryName(a, project.assets))
    .filter(Boolean)
    .join("、");
  return [
    `风格：${project.settings.style}`,
    `画幅：${project.settings.ratio}`,
    "范围：当前分集。下面的 #数字是项目全局镜号。",
    "说明：输出 JSON 的 index 必须与下列全局 #index 完全一致。",
    "资产指认：提示词里用 @[登记名] 指认出场资产。",
    "imagePrompt=冻结关键帧；videoPrompt=起点→动作→终点与运镜；不要改对白与镜序。",
    `可用登记名：${registryHint || "（暂无）"}`,
    "",
    "已锁定镜头：",
    shotBrief || "（无镜头）",
  ].join("\n");
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

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const report = {
    startedAt: new Date().toISOString(),
    projectId: PROJECT_ID,
    steps: {},
    issues: [],
  };

  await login();
  let p = await getProject();
  let draft = p.draft;
  const epId = draft.episodes?.[0]?.id;
  if (!epId) throw new Error("no episode");
  console.log("project", p.title, "ep", epId, "assets", draft.assets.length, "shots", draft.shots.length);
  report.episodeId = epId;
  report.settings = draft.settings;

  // ---------- 1) author_prompts ----------
  console.log("\n=== 1) author_prompts ===");
  try {
    const prompt = buildAuthorPrompt(
      { ...draft, id: PROJECT_ID, settings: draft.settings, assets: draft.assets, shots: draft.shots, episodes: draft.episodes },
      epId,
    );
    const job = await api("POST", "/jobs", {
      kind: "llm",
      input: {
        purpose: "author_prompts",
        prompt,
        manjuProjectId: PROJECT_ID,
        manjuEpisodeId: epId,
        modelId: draft.settings.llmModelId,
      },
    });
    const done = await waitJob(job.id, "author_prompts", 40, 3000);
    report.steps.author_prompts = {
      jobId: job.id,
      status: done.status,
      error: done.error || null,
    };
    if (done.status !== "succeeded") {
      report.issues.push({
        level: "P0",
        step: "author_prompts",
        message: done.error || done.status,
      });
    }
    p = await getProject();
    draft = p.draft;
    // restore settings if wiped
    if (!draft.settings?.llmModelId) {
      report.issues.push({
        level: "P0",
        step: "author_prompts",
        message: "写词后 settings 模型 id 丢失，已尝试恢复",
      });
      draft = (
        await saveDraft({
          ...draft,
          settings: { ...draft.settings, ...report.settings },
          scriptConfirmed: true,
        })
      ).draft;
    }
    const withPrompt = (draft.shots || []).filter(
      (s) => s.imagePrompt?.trim() || s.videoPrompt?.trim(),
    ).length;
    console.log("shots with prompts:", withPrompt, "/", draft.shots.length);
    report.steps.author_prompts.shotsWithPrompt = withPrompt;
  } catch (e) {
    console.error(e);
    report.steps.author_prompts = { error: String(e) };
    report.issues.push({ level: "P0", step: "author_prompts", message: String(e) });
  }

  // ---------- 2) asset images ----------
  console.log("\n=== 2) asset images ===");
  // Priority: main character/scene/prop first, then rest. Skip voice-only 邻人甲 optionally — still generate for coverage.
  const assets = [...(draft.assets || [])];
  const assetResults = [];
  await mapPool(assets, 2, async (asset) => {
    const label = `${asset.kind}:${asset.name}`;
    try {
      if (asset.imageUrl && asset.assetId) {
        console.log(`  skip ${label} (already has image)`);
        assetResults.push({ ...asset, ok: true, skipped: true });
        return;
      }
      const prompt = buildAssetPrompt(asset, draft.settings, draft.assets);
      const job = await api("POST", "/jobs", {
        kind: "image",
        input: {
          prompt,
          ratio: preferredAssetRatio(asset.kind),
          n: 1,
          modelId: draft.settings.imageModelId,
          manjuProjectId: PROJECT_ID,
        },
      });
      // bind job id into draft
      draft.assets = draft.assets.map((a) =>
        a.id === asset.id
          ? { ...a, jobId: job.id, status: "queued" }
          : a,
      );
      await saveDraft(draft);
      p = await getProject();
      draft = p.draft;

      const done = await waitJob(job.id, label, 90, 5000);
      const media = pickMedia(done);
      if (done.status === "succeeded" && media.url) {
        draft.assets = draft.assets.map((a) =>
          a.id === asset.id
            ? {
                ...a,
                imageUrl: media.url,
                assetId: media.assetId,
                jobId: job.id,
                status: "succeeded",
              }
            : a,
        );
        await saveDraft(draft);
        p = await getProject();
        draft = p.draft;
        console.log(`  OK ${label}`);
        assetResults.push({
          id: asset.id,
          name: asset.name,
          kind: asset.kind,
          ok: true,
          jobId: job.id,
          url: media.url,
          assetId: media.assetId,
        });
      } else {
        console.log(`  FAIL ${label}`, done.error || done.status);
        report.issues.push({
          level: "P0",
          step: "asset_image",
          name: label,
          message: done.error || done.status,
          jobId: job.id,
        });
        assetResults.push({
          id: asset.id,
          name: asset.name,
          kind: asset.kind,
          ok: false,
          jobId: job.id,
          error: done.error || done.status,
        });
      }
    } catch (e) {
      console.error(`  ERR ${label}`, e);
      report.issues.push({
        level: "P0",
        step: "asset_image",
        name: label,
        message: String(e),
      });
      assetResults.push({
        id: asset.id,
        name: asset.name,
        kind: asset.kind,
        ok: false,
        error: String(e),
      });
    }
  });
  report.steps.asset_images = {
    total: assets.length,
    ok: assetResults.filter((r) => r.ok).length,
    fail: assetResults.filter((r) => !r.ok).length,
    items: assetResults,
  };

  // ---------- 3) storyboard images ----------
  console.log("\n=== 3) storyboard images ===");
  p = await getProject();
  draft = p.draft;
  const shots = (draft.shots || []).filter((s) => s.episodeId === epId);
  const shotImgResults = [];
  await mapPool(shots, 2, async (shot) => {
    const label = `shot#${shot.index}:${shot.title || ""}`;
    try {
      if (shot.storyboardImageUrl && shot.storyboardAssetId) {
        console.log(`  skip ${label}`);
        shotImgResults.push({ index: shot.index, ok: true, skipped: true });
        return;
      }
      // refresh project for latest asset refs
      p = await getProject();
      draft = p.draft;
      const live = draft.shots.find((s) => s.id === shot.id) || shot;
      const projectView = {
        id: PROJECT_ID,
        settings: draft.settings,
        assets: draft.assets,
        shots: draft.shots,
        episodes: draft.episodes,
      };
      const prompt = buildShotImagePrompt(live, projectView);
      const refs = resolveShotRefs(live, projectView);
      const referenceAssetIds = refs
        .map((r) => r.asset.assetId)
        .filter(Boolean);
      const referenceUrls = refs
        .filter((r) => !r.asset.assetId && r.asset.imageUrl)
        .map((r) => r.asset.imageUrl);

      const job = await api("POST", "/jobs", {
        kind: "image",
        input: {
          prompt,
          ratio: draft.settings.ratio,
          n: 1,
          modelId: draft.settings.imageModelId,
          manjuProjectId: PROJECT_ID,
          referenceAssetIds: referenceAssetIds.length
            ? referenceAssetIds
            : undefined,
          referenceUrls: referenceUrls.length ? referenceUrls : undefined,
        },
      });

      draft.shots = draft.shots.map((s) =>
        s.id === shot.id
          ? { ...s, storyboardJobId: job.id, storyboardStatus: "queued" }
          : s,
      );
      await saveDraft(draft);

      const done = await waitJob(job.id, label, 90, 5000);
      const media = pickMedia(done);
      if (done.status === "succeeded" && media.url) {
        p = await getProject();
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
        await saveDraft(draft);
        console.log(`  OK ${label} refs=${referenceAssetIds.length}`);
        shotImgResults.push({
          index: shot.index,
          title: shot.title,
          ok: true,
          jobId: job.id,
          url: media.url,
          refCount: referenceAssetIds.length + referenceUrls.length,
        });
      } else {
        console.log(`  FAIL ${label}`, done.error || done.status);
        report.issues.push({
          level: "P0",
          step: "storyboard_image",
          name: label,
          message: done.error || done.status,
          jobId: job.id,
        });
        shotImgResults.push({
          index: shot.index,
          ok: false,
          jobId: job.id,
          error: done.error || done.status,
        });
      }
    } catch (e) {
      console.error(`  ERR ${label}`, e);
      report.issues.push({
        level: "P0",
        step: "storyboard_image",
        name: label,
        message: String(e),
      });
      shotImgResults.push({ index: shot.index, ok: false, error: String(e) });
    }
  });
  report.steps.storyboard_images = {
    total: shots.length,
    ok: shotImgResults.filter((r) => r.ok).length,
    fail: shotImgResults.filter((r) => !r.ok).length,
    items: shotImgResults,
  };

  // ---------- 4) videos (I2V) ----------
  console.log("\n=== 4) videos I2V ===");
  p = await getProject();
  draft = p.draft;
  const videoShots = (draft.shots || []).filter(
    (s) => s.episodeId === epId && s.storyboardImageUrl,
  );
  const videoResults = [];
  // Seedance can be slow; concurrency 1 is safer for provider limits
  await mapPool(videoShots, 1, async (shot) => {
    const label = `video#${shot.index}:${shot.title || ""}`;
    try {
      if (shot.videoUrl && shot.videoAssetId) {
        console.log(`  skip ${label}`);
        videoResults.push({ index: shot.index, ok: true, skipped: true });
        return;
      }
      p = await getProject();
      draft = p.draft;
      const live = draft.shots.find((s) => s.id === shot.id) || shot;
      const projectView = {
        id: PROJECT_ID,
        settings: draft.settings,
        assets: draft.assets,
        shots: draft.shots,
        episodes: draft.episodes,
      };
      const prompt = buildShotVideoPrompt(live, projectView);
      const duration =
        live.duration && live.duration > 0
          ? live.duration
          : draft.settings.duration || 5;
      const referenceAssetIds = live.storyboardAssetId
        ? [live.storyboardAssetId]
        : undefined;
      const referenceUrls =
        !live.storyboardAssetId && live.storyboardImageUrl
          ? [live.storyboardImageUrl]
          : undefined;

      const job = await api("POST", "/jobs", {
        kind: "video",
        input: {
          prompt,
          ratio: draft.settings.ratio,
          duration,
          modelId: draft.settings.videoModelId,
          manjuProjectId: PROJECT_ID,
          referenceAssetIds,
          referenceUrls,
          refMode: "first_last",
        },
      });

      draft.shots = draft.shots.map((s) =>
        s.id === shot.id
          ? { ...s, videoJobId: job.id, videoStatus: "queued" }
          : s,
      );
      await saveDraft(draft);

      const done = await waitJob(job.id, label, 180, 8000);
      const media = pickMedia(done);
      if (done.status === "succeeded" && media.url) {
        p = await getProject();
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
        // mark mode locked via completed step if needed
        const steps = new Set(draft.completedSteps || []);
        steps.add("storyboard-video");
        draft.completedSteps = [...steps];
        await saveDraft(draft);
        console.log(`  OK ${label}`);
        videoResults.push({
          index: shot.index,
          title: shot.title,
          ok: true,
          jobId: job.id,
          url: media.url,
        });
      } else {
        console.log(`  FAIL ${label}`, done.error || done.status);
        report.issues.push({
          level: "P0",
          step: "video",
          name: label,
          message: done.error || done.status,
          jobId: job.id,
        });
        videoResults.push({
          index: shot.index,
          ok: false,
          jobId: job.id,
          error: done.error || done.status,
        });
      }
    } catch (e) {
      console.error(`  ERR ${label}`, e);
      report.issues.push({
        level: "P0",
        step: "video",
        name: label,
        message: String(e),
      });
      videoResults.push({ index: shot.index, ok: false, error: String(e) });
    }
  });
  report.steps.videos = {
    total: videoShots.length,
    ok: videoResults.filter((r) => r.ok).length,
    fail: videoResults.filter((r) => !r.ok).length,
    items: videoResults,
  };

  // ---------- 5) workflow + jianying export ----------
  console.log("\n=== 5) workflow + export ===");
  try {
    const wf = await api("GET", `/manju/projects/${PROJECT_ID}/workflow`);
    report.steps.workflow = wf;
    console.log("workflow", JSON.stringify(wf));
  } catch (e) {
    report.issues.push({
      level: "P1",
      step: "workflow",
      message: String(e),
    });
  }

  try {
    const r = await fetch(
      `${BASE}/manju/projects/${PROJECT_ID}/export/jianying?episodeId=${encodeURIComponent(epId)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const buf = Buffer.from(await r.arrayBuffer());
    const zipPath = path.join(OUT_DIR, "yanerdaoling-jianying.zip");
    if (r.ok && buf.length > 100) {
      fs.writeFileSync(zipPath, buf);
      report.steps.jianying = {
        ok: true,
        bytes: buf.length,
        path: zipPath,
        status: r.status,
      };
      console.log("jianying zip", buf.length, "bytes");
    } else {
      const text = buf.toString("utf8").slice(0, 500);
      report.steps.jianying = { ok: false, status: r.status, body: text };
      report.issues.push({
        level: "P1",
        step: "jianying",
        message: `export failed ${r.status} ${text}`,
      });
      console.log("jianying FAIL", r.status, text);
    }
  } catch (e) {
    report.issues.push({ level: "P1", step: "jianying", message: String(e) });
  }

  // final snapshot
  p = await getProject();
  draft = p.draft;
  report.finishedAt = new Date().toISOString();
  report.final = {
    title: p.title,
    scriptConfirmed: draft.scriptConfirmed,
    settings: draft.settings,
    assets: (draft.assets || []).map((a) => ({
      kind: a.kind,
      name: a.name,
      hasImage: !!a.imageUrl,
    })),
    shots: (draft.shots || []).map((s) => ({
      index: s.index,
      title: s.title,
      hasPrompt: !!(s.imagePrompt || s.videoPrompt),
      hasImage: !!s.storyboardImageUrl,
      hasVideo: !!s.videoUrl,
    })),
    counts: {
      assetsWithImage: (draft.assets || []).filter((a) => a.imageUrl).length,
      shotsWithPrompt: (draft.shots || []).filter(
        (s) => s.imagePrompt || s.videoPrompt,
      ).length,
      storyboards: (draft.shots || []).filter((s) => s.storyboardImageUrl).length,
      videos: (draft.shots || []).filter((s) => s.videoUrl).length,
    },
  };

  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2), "utf8");
  console.log("\n=== DONE ===");
  console.log(JSON.stringify(report.final.counts, null, 2));
  console.log("issues", report.issues.length);
  console.log("report", REPORT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
