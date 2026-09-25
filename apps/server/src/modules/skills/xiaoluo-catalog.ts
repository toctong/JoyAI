import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { SkillCategory } from "../../database/entities/skill.entity";

export type XiaoluoSkillMeta = {
  /** frontmatter `name` → slug */
  slug: string;
  /** Display name (Chinese title from H1 or override) */
  name: string;
  description: string;
  category: SkillCategory;
  purpose: string;
  sortOrder: number;
  /** Filename under skills/xiaoluo/ */
  file: string;
};

/**
 * Catalog of XiaoLuo drama skills we ship as FrameRally builtins.
 * `file` is the markdown under `modules/jobs/skills/xiaoluo/`.
 */
export const XIAOLUO_SKILL_CATALOG: XiaoluoSkillMeta[] = [
  // —— 文本 / 导演（LLM）——
  {
    slug: "film-script-analysis",
    name: "影视剧本分析",
    description:
      "证据驱动的剧本深度审计：结构、人物、表演与对白，并提炼创作规范。",
    category: "manju",
    purpose: "film_script_analysis",
    sortOrder: 200,
    file: "影视剧本分析.md",
  },
  {
    slug: "film-screenwriting",
    name: "影视编剧创作",
    description:
      "从模糊创意到可拍摄方案：世界观、人物、三幕、分集与正文。",
    category: "manju",
    purpose: "film_screenwriting",
    sortOrder: 210,
    file: "影视编剧创作.md",
  },
  {
    slug: "original-screenplay-adaptation",
    name: "影视剧本原创改编",
    description: "深层结构重构改编，重建人物体系与因果，降低同质化风险。",
    category: "manju",
    purpose: "original_screenplay_adaptation",
    sortOrder: 220,
    file: "影视剧本原创改编.md",
  },
  {
    slug: "video-shot-analysis",
    name: "视频拉片拆解",
    description: "逐镜拉片：时间码、景别、运镜、表演与声音设计。",
    category: "manju",
    purpose: "video_shot_analysis",
    sortOrder: 230,
    file: "视频拉片拆解.md",
  },
  {
    slug: "script-assets-dna",
    name: "剧本资产 DNA 美术指导",
    description: "从剧本提炼角色/场景/道具视觉 DNA，生成高一致性生图指令。",
    category: "manju",
    purpose: "script_assets_dna",
    sortOrder: 240,
    file: "剧本资产-DNA-美术指导.md",
  },
  {
    slug: "script-to-video",
    name: "剧本分镜脚本",
    description: "剧本 → 资产统一、时长受控的专业视频分镜脚本。",
    category: "manju",
    purpose: "script_to_video",
    sortOrder: 250,
    file: "剧本分镜脚本.md",
  },
  {
    slug: "90s-script-to-video",
    name: "90秒剧本转视频",
    description: "单集 0–90s 连续时间轴的专业分镜脚本。",
    category: "manju",
    purpose: "script_to_video_90s",
    sortOrder: 260,
    file: "90s-script-to-video.md",
  },
  // —— 视觉资产 / 分镜板（图像 brief）——
  {
    slug: "visual-storyboard-grid",
    name: "视觉分镜九宫格",
    description: "3×3 纯视觉电影分镜九宫格，锁定人物场景风格连续性。",
    category: "tools",
    purpose: "visual_storyboard_grid",
    sortOrder: 300,
    file: "视觉分镜九宫格生成.md",
  },
  {
    slug: "storyboard-panel",
    name: "故事面板",
    description: "横向故事分镜表：景别、运镜、时长与剧情提示。",
    category: "tools",
    purpose: "storyboard_panel",
    sortOrder: 310,
    file: "故事面板.md",
  },
  {
    slug: "character-turnaround",
    name: "角色设定图",
    description: "参考图生成角色设定板与三视图，严格继承视觉身份。",
    category: "tools",
    purpose: "character_turnaround",
    sortOrder: 320,
    file: "角色设定图.md",
  },
  {
    slug: "character-orthographic",
    name: "角色三视图",
    description: "工业级正交三/四视图，供建模与动画资产使用。",
    category: "tools",
    purpose: "character_orthographic",
    sortOrder: 330,
    file: "角色三视图.md",
  },
  {
    slug: "character-expression",
    name: "角色表情设定",
    description: "角色表情设定板，保持身份与风格一致。",
    category: "tools",
    purpose: "character_expression",
    sortOrder: 340,
    file: "角色表情设定.md",
  },
  {
    slug: "character-action",
    name: "角色动作设定",
    description: "角色动作姿态设定，服务分镜与资产生成。",
    category: "tools",
    purpose: "character_action",
    sortOrder: 350,
    file: "角色动作设定.md",
  },
  {
    slug: "character-costume",
    name: "角色服装设定",
    description: "服装定妆与材质细节设定图。",
    category: "tools",
    purpose: "character_costume",
    sortOrder: 360,
    file: "角色服装设定.md",
  },
  {
    slug: "character-props",
    name: "角色道具设定",
    description: "角色随身道具视觉设定。",
    category: "tools",
    purpose: "character_props",
    sortOrder: 370,
    file: "角色道具设定.md",
  },
  {
    slug: "scene-four-views",
    name: "场景四视图",
    description: "场景多视角设定，保持空间结构一致。",
    category: "tools",
    purpose: "scene_four_views",
    sortOrder: 380,
    file: "场景四视图.md",
  },
  {
    slug: "scene-topdown",
    name: "场景俯视布局",
    description: "场景俯视平面布局，服务调度与空间连贯。",
    category: "tools",
    purpose: "scene_topdown",
    sortOrder: 390,
    file: "场景俯视布局.md",
  },
  {
    slug: "ai-drama-scene-layout",
    name: "AI短剧场景布局设计",
    description: "短剧场景布局与空间设计指导。",
    category: "tools",
    purpose: "ai_drama_scene_layout",
    sortOrder: 400,
    file: "AI短剧场景布局设计.md",
  },
  {
    slug: "vr-scene",
    name: "VR场景图",
    description: "沉浸式 / VR 向场景视觉设定。",
    category: "tools",
    purpose: "vr_scene",
    sortOrder: 410,
    file: "VR场景图.md",
  },
];

function xiaoluoDir() {
  const candidates = [
    // nest build: dist/modules/skills → dist/modules/jobs/skills/xiaoluo (if assets copied)
    join(__dirname, "..", "jobs", "skills", "xiaoluo"),
    // ts-node / monorepo cwd = apps/server
    join(process.cwd(), "src", "modules", "jobs", "skills", "xiaoluo"),
    // monorepo root cwd
    join(
      process.cwd(),
      "apps",
      "server",
      "src",
      "modules",
      "jobs",
      "skills",
      "xiaoluo",
    ),
  ];
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  return candidates[0]!;
}

/** Strip YAML frontmatter; keep markdown body as system prompt. */
export function parseSkillMarkdown(raw: string): {
  name?: string;
  description?: string;
  body: string;
} {
  const trimmed = raw.replace(/^\uFEFF/, "");
  if (!trimmed.startsWith("---")) {
    return { body: trimmed.trim() };
  }
  const end = trimmed.indexOf("\n---", 3);
  if (end < 0) return { body: trimmed.trim() };
  const fm = trimmed.slice(3, end).trim();
  const body = trimmed.slice(end + 4).trim();
  let name: string | undefined;
  let description: string | undefined;
  for (const line of fm.split("\n")) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2]?.trim() ?? "";
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key === "name") name = val;
    if (key === "description") description = val;
  }
  return { name, description, body };
}

export function loadXiaoluoBuiltinSeeds(): Array<{
  slug: string;
  name: string;
  description: string;
  category: SkillCategory;
  purpose: string;
  systemPrompt: string;
  sortOrder: number;
}> {
  const dir = xiaoluoDir();
  if (!existsSync(dir)) return [];

  const out: Array<{
    slug: string;
    name: string;
    description: string;
    category: SkillCategory;
    purpose: string;
    systemPrompt: string;
    sortOrder: number;
  }> = [];

  for (const meta of XIAOLUO_SKILL_CATALOG) {
    const full = join(dir, meta.file);
    if (!existsSync(full)) continue;
    const raw = readFileSync(full, "utf8");
    const parsed = parseSkillMarkdown(raw);
    if (!parsed.body) continue;
    out.push({
      slug: meta.slug,
      name: meta.name,
      description: meta.description || parsed.description || "",
      category: meta.category,
      purpose: meta.purpose,
      systemPrompt: parsed.body,
      sortOrder: meta.sortOrder,
    });
  }

  // Optional: pick up any extra .md not in catalog (slug from frontmatter name)
  try {
    const known = new Set(XIAOLUO_SKILL_CATALOG.map((c) => c.file));
    let extraOrder = 500;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".md") || file === "README.md" || known.has(file)) {
        continue;
      }
      const raw = readFileSync(join(dir, file), "utf8");
      const parsed = parseSkillMarkdown(raw);
      const slug = (parsed.name || file.replace(/\.md$/, ""))
        .trim()
        .toLowerCase()
        .replace(/[_\s]+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .replace(/-+/g, "-");
      if (!slug || !parsed.body) continue;
      out.push({
        slug,
        name: parsed.name || file.replace(/\.md$/, ""),
        description: parsed.description || "",
        category: "general",
        purpose: slug.replace(/-/g, "_"),
        systemPrompt: parsed.body,
        sortOrder: extraOrder++,
      });
    }
  } catch {
    /* ignore */
  }

  return out;
}
