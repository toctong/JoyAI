import axios from "axios";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const headers = {
  "User-Agent": UA,
  Accept: "application/json",
  "Content-Type": "application/json",
  Origin: "https://pixai.art",
  Referer: "https://pixai.art/zh/market",
};

async function gql(name, query, variables = {}) {
  try {
    const r = await axios.post(
      `https://api.pixai.art/graphql?operation=${encodeURIComponent(name)}`,
      { query, variables, operationName: name },
      { timeout: 25000, headers, validateStatus: () => true },
    );
    console.log(`\n=== GQL ${name} ${r.status} ===`);
    console.log(JSON.stringify(r.data)?.slice(0, 2000));
  } catch (e) {
    console.log(`\n=== GQL ${name} ERR ===`, e.message);
  }
}

async function get(name, url) {
  try {
    const r = await axios.get(url, {
      timeout: 25000,
      headers: { "User-Agent": UA, Accept: "application/json" },
      validateStatus: () => true,
    });
    console.log(`\n=== ${name} ${r.status} ===`);
    console.log(
      typeof r.data === "string"
        ? r.data.slice(0, 900)
        : JSON.stringify(r.data)?.slice(0, 1400),
    );
  } catch (e) {
    console.log(`\n=== ${name} ERR ===`, e.message);
  }
}

await gql("typename", "query typename { __typename }");

await gql(
  "getGenerationModelByVersionId",
  `query getGenerationModelByVersionId($id: ID!) {
    modelVersion(id: $id) {
      id
      name
      model {
        id
        title
        name
      }
    }
  }`,
  { id: "1983308862240288769" },
);

const listOps = [
  [
    "models",
    `query models($first: Int, $after: String) {
      models(first: $first, after: $after) {
        pageInfo { hasNextPage endCursor }
        edges { node { id title name type } }
      }
    }`,
    { first: 5 },
  ],
  [
    "searchModels",
    `query searchModels($first: Int) {
      searchModels(first: $first) {
        edges { node { id title name } }
      }
    }`,
    { first: 5 },
  ],
  [
    "discoverFeed",
    `query discoverFeed($first: Int) {
      discoverFeed(first: $first) {
        edges { node { id } }
      }
    }`,
    { first: 5 },
  ],
];

for (const [name, query, variables] of listOps) {
  await gql(name, query, variables);
}

await get("civitai-models", "https://civitai.com/api/v1/models?limit=1&nsfw=false");
await get(
  "civitai-images",
  "https://civitai.com/api/v1/images?limit=2&nsfw=None&sort=Most%20Reactions",
);
