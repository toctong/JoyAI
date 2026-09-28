import { api } from "@/shared/lib/api";
import type { ManjuProjectDraft } from "../manju-types";
import { submitWorkflowSkill } from "../lib/workflow-skill";
import { manjuStudioHref, type ManjuStudioSection } from "../studio/manju-studio-routes";

export const MANJU_AGENT_SYSTEM = `你是 FrameRally 漫剧工作台助手。每一轮只做一小步。
必须只输出一个 JSON 对象（不要 markdown 围栏）：
{"reply":"给用户的简短中文说明","actions":[...]}

可用 actions（name + args），每轮最多 4 个：
- navigate：{"section":"overview"|"source"|"characters"|"scenes"|"props"|"settings"|"episode"|"preview","episodeId"?:string}
- run_skill：{"skill":"analyze_assets"|"plan_episodes"|"series_memory"|"script_plan"|"author_prompts"}
- confirm_script：无参数（确认分镜脚本审核门）
- select_shot：{"shotId":string}（仅提示前端选中，不生成）
- list_status：无参数（查看项目摘要）

规则：
1. 优先少步。任务完成时 actions 为 []。
2. 生成类 skill 会提交异步 Job；说明即可，不要假装已完成。
3. 不要输出 base64；不要删除项目。
4. 纯聊天时 actions 为 []。`;

export type ManjuAgentAction =
  | {
      name: "navigate";
      args: { section: ManjuStudioSection; episodeId?: string };
    }
  | {
      name: "run_skill";
      args: {
        skill:
          | "analyze_assets"
          | "plan_episodes"
          | "series_memory"
          | "script_plan"
          | "author_prompts";
      };
    }
  | { name: "confirm_script" }
  | { name: "select_shot"; args: { shotId: string } }
  | { name: "list_status" };

export type ManjuAgentPlan = {
  reply: string;
  actions: ManjuAgentAction[];
};

export type ManjuAgentStepLog = { ui: string; model: string };

export type ManjuAgentExecContext = {
  project: ManjuProjectDraft;
  routerPush: (href: string) => void;
  onSelectShot?: (shotId: string) => void;
  reloadProject: () => Promise<void>;
  setAnalyzing: (v: boolean) => void;
};

const SKILLS = new Set([
  "analyze_assets",
  "plan_episodes",
  "series_memory",
  "script_plan",
  "author_prompts",
]);

const SECTIONS = new Set<ManjuStudioSection>([
  "overview",
  "source",
  "characters",
  "scenes",
  "props",
  "settings",
  "episode",
  "preview",
]);

export function parseManjuAgentPlan(text: string): ManjuAgentPlan {
  const raw = text.trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced?.[1] ?? raw).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return { reply: raw.slice(0, 500) || "（无回复）", actions: [] };
  }
  try {
    const json = JSON.parse(body.slice(start, end + 1)) as {
      reply?: unknown;
      actions?: unknown;
    };
    const reply =
      typeof json.reply === "string" && json.reply.trim()
        ? json.reply.trim()
        : "好的。";
    const actions: ManjuAgentAction[] = [];
    if (Array.isArray(json.actions)) {
      for (const item of json.actions.slice(0, 4)) {
        if (!item || typeof item !== "object") continue;
        const row = item as { name?: unknown; args?: Record<string, unknown> };
        const name = typeof row.name === "string" ? row.name : "";
        const args = row.args ?? {};
        if (name === "navigate") {
          const section = String(args.section || "") as ManjuStudioSection;
          if (!SECTIONS.has(section)) continue;
          actions.push({
            name: "navigate",
            args: {
              section,
              episodeId:
                typeof args.episodeId === "string" ? args.episodeId : undefined,
            },
          });
        } else if (name === "run_skill") {
          const skill = String(args.skill || "");
          if (!SKILLS.has(skill)) continue;
          actions.push({
            name: "run_skill",
            args: {
              skill: skill as
                | "analyze_assets"
                | "plan_episodes"
                | "series_memory"
                | "script_plan"
                | "author_prompts",
            },
          });
        } else if (name === "confirm_script") {
          actions.push({ name: "confirm_script" });
        } else if (name === "select_shot") {
          const shotId = typeof args.shotId === "string" ? args.shotId : "";
          if (shotId) actions.push({ name: "select_shot", args: { shotId } });
        } else if (name === "list_status") {
          actions.push({ name: "list_status" });
        }
      }
    }
    return { reply, actions };
  } catch {
    return { reply: raw.slice(0, 500) || "（解析失败）", actions: [] };
  }
}

export function buildManjuAgentContext(project: ManjuProjectDraft) {
  return {
    title: project.title,
    scriptConfirmed: project.scriptConfirmed,
    phase: project.phase,
    scriptLen: project.scriptText.length,
    assets: project.assets.map((a) => ({
      id: a.id,
      kind: a.kind,
      name: a.name,
      hasImage: Boolean(a.imageUrl),
    })),
    episodes: project.episodes.map((e) => ({
      id: e.id,
      title: e.title,
      shotCount: project.shots.filter((s) => s.episodeId === e.id).length,
    })),
    shots: project.shots.slice(0, 40).map((s) => ({
      id: s.id,
      index: s.index,
      episodeId: s.episodeId,
      hasStoryboard: Boolean(s.storyboardImageUrl),
      hasVideo: Boolean(s.videoUrl),
      visual: s.visual.slice(0, 80),
    })),
  };
}

export function describeManjuAction(action: ManjuAgentAction): string {
  switch (action.name) {
    case "navigate":
      return `打开 ${action.args.section}`;
    case "run_skill":
      return `提交技能 ${action.args.skill}`;
    case "confirm_script":
      return "确认脚本";
    case "select_shot":
      return `选中镜头 ${action.args.shotId.slice(0, 8)}`;
    case "list_status":
      return "查看状态";
    default:
      return "未知动作";
  }
}

export async function executeManjuAgentActions(
  actions: ManjuAgentAction[],
  ctx: ManjuAgentExecContext,
): Promise<ManjuAgentStepLog[]> {
  const logs: ManjuAgentStepLog[] = [];
  for (const action of actions) {
    try {
      if (action.name === "navigate") {
        const href = manjuStudioHref(ctx.project.id, action.args.section, {
          epId: action.args.episodeId ?? ctx.project.episodes[0]?.id,
        });
        ctx.routerPush(href);
        logs.push({
          ui: `已导航到 ${action.args.section}`,
          model: describeManjuAction(action),
        });
      } else if (action.name === "run_skill") {
        ctx.setAnalyzing(true);
        await submitWorkflowSkill({
          project: ctx.project,
          skill: action.args.skill,
        });
        logs.push({
          ui: `已提交 ${action.args.skill}`,
          model: describeManjuAction(action),
        });
      } else if (action.name === "confirm_script") {
        await api(`/manju/projects/${ctx.project.id}/script-review/confirm`, {
          method: "POST",
          body: {},
        });
        await ctx.reloadProject();
        logs.push({ ui: "脚本已确认", model: describeManjuAction(action) });
      } else if (action.name === "select_shot") {
        ctx.onSelectShot?.(action.args.shotId);
        logs.push({
          ui: `已选中镜头`,
          model: describeManjuAction(action),
        });
      } else if (action.name === "list_status") {
        const c = buildManjuAgentContext(ctx.project);
        logs.push({
          ui: `资产 ${c.assets.length} · 分集 ${c.episodes.length} · 镜头 ${ctx.project.shots.length} · 确认 ${c.scriptConfirmed ? "是" : "否"}`,
          model: JSON.stringify(c).slice(0, 400),
        });
      }
    } catch (e) {
      logs.push({
        ui: e instanceof Error ? e.message : "动作失败",
        model: describeManjuAction(action),
      });
    }
  }
  return logs;
}
