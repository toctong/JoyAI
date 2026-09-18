/**
 * Smoke-test PixAI market GraphQL through EXPLORE_MARKET_PROXY (or default).
 * Usage: node scripts/probe-pixai-media.mjs
 */
import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";

const proxy =
  process.env.EXPLORE_MARKET_PROXY?.trim() || "http://8.130.171.89:20171";
const headers = {
  "User-Agent": "JoyAI/0.1 (+probe-pixai-media)",
  "Content-Type": "application/json",
  Accept: "application/json",
  Origin: "https://pixai.art",
  Referer: "https://pixai.art/zh/market",
};

async function post(op, query, variables = {}) {
  for (let i = 0; i < 5; i++) {
    const agent = new HttpsProxyAgent(proxy);
    try {
      const r = await axios.post(
        `https://api.pixai.art/graphql?operation=${encodeURIComponent(op)}`,
        { operationName: op, query, variables },
        {
          timeout: 30000,
          httpAgent: agent,
          httpsAgent: agent,
          proxy: false,
          validateStatus: () => true,
          headers,
        },
      );
      return r.data;
    } catch (e) {
      console.log(`  retry ${i + 1}: ${e.code || e.message}`);
      await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    }
  }
  return { errors: [{ message: "all retries failed" }] };
}

const data = await post(
  "generationModels",
  `query generationModels($first: Int, $after: String) {
    generationModels(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          title
          type
          media { id urls { variant url } }
        }
      }
    }
  }`,
  { first: 3, after: null },
);

if (data?.errors?.length) {
  console.error("FAIL", data.errors[0].message);
  process.exit(1);
}

const edges = data?.data?.generationModels?.edges ?? [];
console.log(`OK proxy=${proxy} items=${edges.length}`);
for (const edge of edges) {
  const n = edge.node;
  const urls = n?.media?.urls ?? [];
  const thumb = urls.find((u) => u.variant === "THUMBNAIL")?.url;
  const pub = urls.find((u) => u.variant === "PUBLIC")?.url;
  console.log(`- ${n.id} ${n.title} thumb=${Boolean(thumb)} public=${Boolean(pub)}`);
}
