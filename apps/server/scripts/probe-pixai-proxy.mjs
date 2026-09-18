import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";

const proxy = "http://8.130.171.89:20171";
const headers = {
  "User-Agent": "Mozilla/5.0",
  "Content-Type": "application/json",
  Accept: "application/json",
  Origin: "https://pixai.art",
  Referer: "https://pixai.art/zh/market",
};

async function post(op, query, variables = {}) {
  for (let i = 0; i < 4; i++) {
    const agent = new HttpsProxyAgent(proxy);
    try {
      const r = await axios.post(
        `https://api.pixai.art/graphql?operation=${encodeURIComponent(op)}`,
        { operationName: op, query, variables },
        {
          timeout: 20000,
          httpAgent: agent,
          httpsAgent: agent,
          proxy: false,
          validateStatus: () => true,
          headers,
        },
      );
      return r.data;
    } catch {
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  return { errors: [{ message: "all retries failed" }] };
}

function show(label, data) {
  const err = data?.errors?.[0]?.message;
  console.log(
    `[${label}]`,
    err ? `ERR ${err.slice(0, 140)}` : JSON.stringify(data).slice(0, 500),
  );
}

const mediaId = "308108996588551540";

// Known from greasyfork: getMedia often needs APQ; try inline variants
const mediaQueries = [
  [`media(id:$id){id}`, { id: mediaId }],
  [`media(id:$id){id width height}`, { id: mediaId }],
  [`media(id:$id){id type}`, { id: mediaId }],
  [`media(id:$id){id urls}`, { id: mediaId }],
  [`media(id:$id){id image}`, { id: mediaId }],
  [`media(id:$id){id publicUrl}`, { id: mediaId }],
  [`media(id:$id){id downloadUrl}`, { id: mediaId }],
  [`media(id:$id){id thumbnail}`, { id: mediaId }],
  [`media(id:$id){id variants}`, { id: mediaId }],
];

for (const [sel, vars] of mediaQueries) {
  show(
    sel,
    await post(
      "getMedia",
      `query getMedia($id: String!) { ${sel} }`,
      vars,
    ),
  );
}

// Also try Image CDN guess patterns used by PixAI
const guesses = [
  `https://media.pixai.art/${mediaId}`,
  `https://cdn.pixai.art/${mediaId}`,
  `https://api.pixai.art/v1/media/${mediaId}/image`,
  `https://api.pixai.art/v1/media/${mediaId}`,
];
for (const url of guesses) {
  const agent = new HttpsProxyAgent(proxy);
  try {
    const r = await axios.get(url, {
      timeout: 12000,
      httpAgent: agent,
      httpsAgent: agent,
      proxy: false,
      validateStatus: () => true,
      maxRedirects: 0,
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    console.log(
      `[guess] ${r.status} ${url} ct=${r.headers["content-type"]} loc=${r.headers.location || ""}`,
    );
  } catch (e) {
    console.log(`[guess] ERR ${url} ${e.code || e.message}`);
  }
}
