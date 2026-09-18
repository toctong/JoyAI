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
      "https://api.pixai.art/graphql",
      { query, variables },
      { timeout: 25000, headers, validateStatus: () => true },
    );
    console.log(`\n=== GQL ${name} ${r.status} ===`);
    console.log(JSON.stringify(r.data)?.slice(0, 1800));
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
        ? r.data.slice(0, 800)
        : JSON.stringify(r.data)?.slice(0, 1200),
    );
  } catch (e) {
    console.log(`\n=== ${name} ERR ===`, e.message);
  }
}

await gql("typename", "query { __typename }");

const queries = [
  [
    "modelsHot",
    `query($first:Int!,$after:String){
      models(first:$first, after:$after, orderBy:HOT){
        pageInfo{hasNextPage endCursor}
        edges{node{id title name type likedCount usedCount}}
      }
    }`,
    { first: 3 },
  ],
  [
    "modelsHotStr",
    `query($first:Int!){
      models(first:$first, orderBy:"hot"){
        edges{node{id title}}
      }
    }`,
    { first: 3 },
  ],
  [
    "searchModels",
    `query($first:Int!){
      searchModels(first:$first){
        edges{node{id title name}}
      }
    }`,
    { first: 3 },
  ],
  [
    "marketModels",
    `query($first:Int!){
      marketModels(first:$first){
        edges{node{id title}}
      }
    }`,
    { first: 3 },
  ],
  [
    "discoverModels",
    `query($first:Int!){
      discoverModels(first:$first){
        edges{node{id title}}
      }
    }`,
    { first: 3 },
  ],
  [
    "artworks",
    `query($first:Int!){
      artworks(first:$first){
        edges{node{id title prompts}}
      }
    }`,
    { first: 3 },
  ],
  [
    "feed",
    `query($first:Int!){
      feed(first:$first){
        edges{node{id}}
      }
    }`,
    { first: 3 },
  ],
  [
    "getModel",
    `query($id:ID!){
      model(id:$id){
        id title name description
        cover{id urls{small medium large}}
      }
    }`,
    { id: "1982880136609467518" },
  ],
];

for (const [name, query, variables] of queries) {
  await gql(name, query, variables);
}

await get("civitai", "https://civitai.com/api/v1/models?limit=1&nsfw=false");
await get(
  "civitai-images",
  "https://civitai.com/api/v1/images?limit=2&nsfw=None&sort=Most%20Reactions",
);
