const API = process.env.API_BASE || "http://localhost:3001/api";

async function req(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const err = new Error(
      typeof data === "object" && data?.message
        ? Array.isArray(data.message)
          ? data.message.join("; ")
          : String(data.message)
        : `HTTP ${res.status}`,
    );
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const username = process.env.SMOKE_USER || "admin";
const password = process.env.SMOKE_PASS || "admin123";

console.log("login...");
const auth = await req("/auth/login", {
  method: "POST",
  body: { username, password },
});
const token = auth.accessToken || auth.token;
if (!token) {
  console.error("no token in login response", auth);
  process.exit(1);
}
console.log("ok user", auth.user?.username ?? username, "role", auth.user?.role);

console.log("GET /models (public)...");
const models = await req("/models", { token });
const imageModels = (models || []).filter((m) => m.kind === "image");
const videoModels = (models || []).filter((m) => m.kind === "video");
console.log(
  `models: total=${models.length} image=${imageModels.length} video=${videoModels.length}`,
);
console.log(
  "sample:",
  models.slice(0, 5).map((m) => ({ id: m.id, name: m.name, kind: m.kind, isDefault: m.isDefault })),
);

if (!imageModels.length) {
  console.error("FAIL: no enabled public image models — cannot smoke generate");
  process.exit(2);
}

const modelId =
  imageModels.find((m) => m.isDefault)?.id ?? imageModels[0].id;
console.log("POST /jobs image with model", modelId);
const job = await req("/jobs", {
  method: "POST",
  token,
  body: {
    kind: "image",
    input: {
      prompt: "smoke test: a small red apple on white background",
      width: 1024,
      height: 1024,
      n: 1,
      modelId,
    },
  },
});
console.log("job created", { id: job.id, status: job.status, kind: job.kind });

let last = job;
for (let i = 0; i < 45; i++) {
  await sleep(2000);
  last = await req(`/jobs/${job.id}`, { token });
  console.log(
    `poll ${i + 1}: status=${last.status} assets=${last.assets?.length ?? 0} error=${last.error ?? ""}`,
  );
  if (last.status === "succeeded" || last.status === "failed") break;
}

if (last.status !== "succeeded") {
  console.error("SMOKE_FAIL", { status: last.status, error: last.error });
  process.exit(3);
}

console.log("SMOKE_OK", {
  jobId: last.id,
  assets: (last.assets || []).map((a) => ({
    id: a.id,
    kind: a.kind,
    url: a.url?.slice(0, 80),
  })),
});

if (!videoModels.length) {
  console.log("skip video: no video models");
  process.exit(0);
}

const videoModelId =
  videoModels.find((m) => m.isDefault)?.id ?? videoModels[0].id;
console.log("POST /jobs video with model", videoModelId);
const vjob = await req("/jobs", {
  method: "POST",
  token,
  body: {
    kind: "video",
    input: {
      prompt: "smoke test: gentle ocean waves at sunset, cinematic",
      ratio: "16:9",
      duration: 5,
      modelId: videoModelId,
    },
  },
});
console.log("video job created", { id: vjob.id, status: vjob.status });

let vlast = vjob;
for (let i = 0; i < 90; i++) {
  await sleep(3000);
  vlast = await req(`/jobs/${vjob.id}`, { token });
  console.log(
    `vpoll ${i + 1}: status=${vlast.status} assets=${vlast.assets?.length ?? 0} error=${vlast.error ?? ""}`,
  );
  if (vlast.status === "succeeded" || vlast.status === "failed") break;
}

if (vlast.status !== "succeeded") {
  console.error("VIDEO_SMOKE_FAIL", { status: vlast.status, error: vlast.error });
  process.exit(4);
}

console.log("VIDEO_SMOKE_OK", {
  jobId: vlast.id,
  assets: (vlast.assets || []).map((a) => ({
    id: a.id,
    kind: a.kind,
    url: a.url?.slice(0, 80),
  })),
});
