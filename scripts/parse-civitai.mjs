const fs = require("fs");
const p =
  "C:/Users/PC/.cursor/projects/d-JoyAI/agent-tools/b85704de-46da-4e70-a2e6-94eba4a3966f.txt";
const j = JSON.parse(fs.readFileSync(p, "utf8"));
const m = j.items[0];
const v = m.modelVersions?.[0];
const img = v?.images?.[0];
console.log(
  JSON.stringify(
    {
      metadata: j.metadata,
      keys: Object.keys(m),
      name: m.name,
      type: m.type,
      nsfw: m.nsfw,
      creator: m.creator,
      version: {
        id: v?.id,
        name: v?.name,
        trainedWords: v?.trainedWords,
        image: img
          ? {
              url: img.url,
              w: img.width,
              h: img.height,
              nsfw: img.nsfw,
              metaKeys: img.meta ? Object.keys(img.meta) : null,
              prompt: img.meta?.prompt?.slice?.(0, 120),
            }
          : null,
      },
    },
    null,
    2,
  ),
);
