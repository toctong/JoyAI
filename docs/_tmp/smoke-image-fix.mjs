/**
 * 冒烟：修后的 ToAPIs 轮询能否取到图片 URL，并回写阿瞒定妆图
 */
import fs from "node:fs";

const BASE = "http://localhost:3001/api";
const PROJECT_ID = "cmup7iu5v613a7089dfaab506";

const login = await fetch(`${BASE}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "admin", password: "admin123" }),
}).then((r) => r.json());
const token = login.accessToken || login.token;
const h = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};

async function api(method, path, body) {
  const r = await fetch(BASE + path, {
    method,
    headers: h,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const t = await r.text();
  const j = JSON.parse(t);
  if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${t.slice(0, 500)}`);
  return j;
}

const p = await api("GET", `/manju/projects/${PROJECT_ID}`);
const draft = p.draft;
const asset = draft.assets.find((a) => a.name === "阿瞒") || draft.assets[0];
if (!asset) throw new Error("no asset");
console.log("target", asset.kind, asset.name, "hasImage", !!asset.imageUrl);

const prompt = [
  `角色设定图：${asset.name}`,
  `风格：${draft.settings.style}`,
  `描述：${asset.description || "年轻瘦削男子"}`,
  "布局：横版三视图，纯白干净背景；正面全身、正侧全身、背面全身一致。",
  "要求：细节清晰，适合作为后续分镜一致性参考。",
].join("\n");

const job = await api("POST", "/jobs", {
  kind: "image",
  input: {
    prompt,
    ratio: "16:9",
    n: 1,
    modelId: draft.settings.imageModelId,
    manjuProjectId: PROJECT_ID,
  },
});
console.log("job", job.id);

for (let i = 0; i < 90; i++) {
  await new Promise((r) => setTimeout(r, 4000));
  const j = await api("GET", `/jobs/${job.id}`);
  console.log(`poll ${i} ${j.status}`, j.error || "");
  if (["succeeded", "failed", "cancelled"].includes(j.status)) {
    const url = j.assets?.[0]?.url || j.result?.urls?.[0];
    const assetId = j.assets?.[0]?.id || j.result?.assetIds?.[0];
    console.log("done", { status: j.status, url, assetId, error: j.error });
    if (j.status === "succeeded" && url) {
      const cur = await api("GET", `/manju/projects/${PROJECT_ID}`);
      const d = cur.draft;
      d.assets = d.assets.map((a) =>
        a.id === asset.id
          ? {
              ...a,
              imageUrl: url,
              assetId,
              jobId: job.id,
              status: "succeeded",
            }
          : a,
      );
      await api("PATCH", `/manju/projects/${PROJECT_ID}`, { draft: d });
      console.log("patched asset image ok");
    }
    fs.writeFileSync(
      "G:/project/JoyAI/docs/_tmp/smoke-image-result.json",
      JSON.stringify(j, null, 2),
      "utf8",
    );
    process.exit(j.status === "succeeded" && url ? 0 : 1);
  }
}
console.error("timeout");
process.exit(1);
