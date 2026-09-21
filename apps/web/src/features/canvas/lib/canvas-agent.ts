import type { CanvasNode, CanvasNodeType } from "@joyai/shared";
import { useCanvasStore } from "../store";
import { api } from "@/shared/lib/api";

export const AGENT_MAX_ROUNDS = 6;
export const AGENT_ACTIONS_PER_ROUND = 4;

export const CANVAS_AGENT_SYSTEM = `你是 JoyAI 无限画布助手。每一轮只做一小步，看到工具结果后再决定下一步。
必须只输出一个 JSON 对象（不要 markdown 围栏），格式：
{"reply":"给用户的简短中文说明","actions":[...]}

节点一律用短 id（n1、n2…），不要编造不存在的 id。本轮新建的节点 id 会在工具结果里返回，连线放到下一轮，不要猜测新 id。

可用 actions（name + args），每轮最多 ${AGENT_ACTIONS_PER_ROUND} 个：
- get_selection：无参数
- inspect_node：{"nodeId":"n1"}。修改或对已有节点生成之前必须先 inspect
- create_node：{"type":"text"|"image"|"prompt"|"video","x"?:number,"y"?:number,"data"?:{"title"?:string,"prompt"?:string,"text"?:string}}
- update_node：{"nodeId":"n1","data":{"title"?:string,"prompt"?:string,"text"?:string}}
- connect_nodes：{"source":"n1","target":"n2"}
- generate_image：{"prompt":string,"nodeId"?:string,"n"?:1-4,"modelId"?:string}
- generate_video：{"prompt":string,"nodeId"?:string,"modelId"?:string}
- generate_text：{"prompt":string,"nodeId"?:string,"modelId"?:string}

规则：
1. 优先少步完成。任务完成时 actions 为 []。
2. 生成类动作会提交异步 Job。Assist 模式下要等用户确认，你仍然应该提出它们。
3. 不要输出 base64；不要删除节点；不要安排复杂编排脚本。
4. 若只需聊天、无需改画布，actions 为 []。`;

const NODE_TYPES: CanvasNodeType[] = ["text", "image", "prompt", "video"];
const TEXT_KEYS = ["title", "prompt", "text"] as const;

export type CanvasAgentAction =
  | { name: "get_selection" }
  | { name: "inspect_node"; args: { nodeId: string } }
  | {
      name: "create_node";
      args: {
        type: CanvasNodeType;
        x?: number;
        y?: number;
        data?: Record<string, unknown>;
      };
    }
  | {
      name: "update_node";
      args: { nodeId: string; data: Record<string, unknown> };
    }
  | { name: "connect_nodes"; args: { source: string; target: string } }
  | {
      name: "generate_image";
      args: {
        prompt: string;
        nodeId?: string;
        n?: number;
        modelId?: string;
      };
    }
  | {
      name: "generate_video";
      args: { prompt: string; nodeId?: string; modelId?: string };
    }
  | {
      name: "generate_text";
      args: { prompt: string; nodeId?: string; modelId?: string };
    };

export type CanvasAgentPlan = {
  reply: string;
  actions: CanvasAgentAction[];
};

export type AgentStepLog = { ui: string; model: string };

export type AgentExecContext = {
  refs: AgentNodeRefs;
  /** Real node ids inspected or created in this user turn. */
  touched: Set<string>;
  pushHistoryOnce: () => void;
  /** False after the user stops the turn. */
  alive?: () => boolean;
};

/** Session-stable short ids so the model never has to echo UUIDs. */
export class AgentNodeRefs {
  private seq = 0;
  private toShort = new Map<string, string>();
  private toReal = new Map<string, string>();

  label(realId: string): string {
    const hit = this.toShort.get(realId);
    if (hit) return hit;
    this.seq += 1;
    const short = `n${this.seq}`;
    this.toShort.set(realId, short);
    this.toReal.set(short, realId);
    return short;
  }

  resolve(token: string): string | null {
    const raw = token.trim();
    if (!raw) return null;
    const fromShort = this.toReal.get(raw);
    if (fromShort) return fromShort;
    if (this.toShort.has(raw)) return raw;
    const exists = useCanvasStore.getState().nodes.some((n) => n.id === raw);
    if (!exists) return null;
    this.label(raw);
    return raw;
  }
}

export function isGenerateAction(
  action: CanvasAgentAction,
): action is Extract<
  CanvasAgentAction,
  { name: "generate_image" | "generate_video" | "generate_text" }
> {
  return (
    action.name === "generate_image" ||
    action.name === "generate_video" ||
    action.name === "generate_text"
  );
}

export function describeAgentAction(action: CanvasAgentAction): string {
  if (action.name === "generate_image") {
    const who = action.args.nodeId ?? "新图像节点";
    return `生图 ×${action.args.n ?? 1} → ${who}：${clip(action.args.prompt, 72)}`;
  }
  if (action.name === "generate_video") {
    const who = action.args.nodeId ?? "新视频节点";
    return `生视频 → ${who}：${clip(action.args.prompt, 72)}`;
  }
  if (action.name === "generate_text") {
    const who = action.args.nodeId ?? "新文本节点";
    return `生成文本 → ${who}：${clip(action.args.prompt, 72)}`;
  }
  return action.name;
}

function clip(text: string, max: number) {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function summarizeNode(node: CanvasNode, refs: AgentNodeRefs, selected: boolean) {
  const title = String(node.data.title ?? "").trim();
  const prompt = String(node.data.prompt ?? node.data.text ?? "").trim();
  const hasMedia =
    Boolean(String(node.data.url ?? "")) &&
    !String(node.data.url ?? "").startsWith("data:");
  return {
    id: refs.label(node.id),
    type: node.type,
    selected: selected || undefined,
    title: title || undefined,
    status: String(node.data.status ?? "idle"),
    hasMedia,
    promptPreview: prompt ? prompt.slice(0, 120) : undefined,
    x: Math.round(node.x),
    y: Math.round(node.y),
  };
}

export function buildCanvasAgentContext(refs: AgentNodeRefs) {
  const state = useCanvasStore.getState();
  const selectedSet = new Set(state.selectedIds);
  const ranked = [
    ...state.nodes.filter((n) => selectedSet.has(n.id)),
    ...state.nodes.filter((n) => !selectedSet.has(n.id)),
  ];
  const shown = ranked.slice(0, 40);
  const shownIds = new Set(shown.map((n) => n.id));
  return {
    nodeCount: state.nodes.length,
    truncated: state.nodes.length > shown.length,
    edgeCount: state.edges.length,
    selected: state.selectedIds.map((id) => refs.label(id)),
    nodes: shown.map((n) => summarizeNode(n, refs, selectedSet.has(n.id))),
    edges: state.edges
      .filter((e) => shownIds.has(e.source) && shownIds.has(e.target))
      .slice(0, 40)
      .map((e) => ({
        source: refs.label(e.source),
        target: refs.label(e.target),
      })),
  };
}

export function buildAgentTurnPrompt(input: {
  refs: AgentNodeRefs;
  userText: string;
  /** Tool steps already done in this user turn. */
  transcript: string[];
  /** Prior chat turns in this conversation (multi-turn memory). */
  chatHistory?: string;
}) {
  const steps = input.transcript.length
    ? input.transcript.join("\n\n")
    : "（尚无）";
  const chat = input.chatHistory?.trim() || "（尚无）";
  return [
    "当前画布上下文（JSON，节点用短 id）：",
    JSON.stringify(buildCanvasAgentContext(input.refs)),
    "",
    "近期对话（同一会话内的多轮，供理解上下文；本轮工具步骤见下方）：",
    chat,
    "",
    "本轮用户请求：",
    input.userText.trim(),
    "",
    "本轮已完成的工具步骤：",
    steps,
    "",
    "请给出下一轮 JSON。任务完成则 actions 为空数组。",
  ].join("\n");
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* continue */
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      /* continue */
    }
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1));
  }
  throw new Error("无法解析 Agent JSON");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function textPatch(source: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of TEXT_KEYS) {
    if (typeof source[key] !== "string") continue;
    const value = source[key].trim();
    if (!value || value.startsWith("data:")) continue;
    out[key] = value.slice(0, 2000);
  }
  return out;
}

export function parseAgentPlan(text: string): CanvasAgentPlan {
  let raw: unknown;
  try {
    raw = extractJsonObject(text);
  } catch {
    return { reply: text.trim() || "已收到", actions: [] };
  }
  const obj = asRecord(raw);
  if (!obj) return { reply: text.trim() || "已收到", actions: [] };
  const reply = String(obj.reply ?? obj.message ?? "").trim() || "已处理";
  const actionsRaw = Array.isArray(obj.actions) ? obj.actions : [];
  const actions: CanvasAgentAction[] = [];
  for (const item of actionsRaw.slice(0, AGENT_ACTIONS_PER_ROUND)) {
    const row = asRecord(item);
    if (!row) continue;
    const name = String(row.name ?? row.action ?? "");
    const args = asRecord(row.args) ?? row;
    if (name === "get_selection") {
      actions.push({ name: "get_selection" });
      continue;
    }
    if (name === "inspect_node") {
      const nodeId = String(args.nodeId ?? args.id ?? "").trim();
      if (nodeId) actions.push({ name: "inspect_node", args: { nodeId } });
      continue;
    }
    if (name === "create_node") {
      const type = String(args.type ?? "text") as CanvasNodeType;
      const data = asRecord(args.data);
      actions.push({
        name: "create_node",
        args: {
          type,
          x: typeof args.x === "number" ? args.x : undefined,
          y: typeof args.y === "number" ? args.y : undefined,
          data: data ? textPatch(data) : undefined,
        },
      });
      continue;
    }
    if (name === "update_node") {
      const nodeId = String(args.nodeId ?? args.id ?? "").trim();
      const data = asRecord(args.data) ?? args;
      const patch = textPatch(data);
      if (nodeId && Object.keys(patch).length) {
        actions.push({ name: "update_node", args: { nodeId, data: patch } });
      }
      continue;
    }
    if (name === "connect_nodes") {
      const source = String(args.source ?? "").trim();
      const target = String(args.target ?? "").trim();
      if (source && target) {
        actions.push({ name: "connect_nodes", args: { source, target } });
      }
      continue;
    }
    if (name === "generate_image") {
      const prompt = String(args.prompt ?? "").trim();
      if (!prompt || prompt.startsWith("data:")) continue;
      const n = Number(args.n);
      actions.push({
        name: "generate_image",
        args: {
          prompt,
          nodeId: args.nodeId ? String(args.nodeId) : undefined,
          n: Number.isFinite(n) ? Math.min(4, Math.max(1, Math.floor(n))) : 1,
          modelId: args.modelId ? String(args.modelId) : undefined,
        },
      });
      continue;
    }
    if (name === "generate_video") {
      const prompt = String(args.prompt ?? "").trim();
      if (!prompt || prompt.startsWith("data:")) continue;
      actions.push({
        name: "generate_video",
        args: {
          prompt,
          nodeId: args.nodeId ? String(args.nodeId) : undefined,
          modelId: args.modelId ? String(args.modelId) : undefined,
        },
      });
      continue;
    }
    if (name === "generate_text") {
      const prompt = String(args.prompt ?? "").trim();
      if (!prompt || prompt.startsWith("data:")) continue;
      actions.push({
        name: "generate_text",
        args: {
          prompt,
          nodeId: args.nodeId ? String(args.nodeId) : undefined,
          modelId: args.modelId ? String(args.modelId) : undefined,
        },
      });
    }
  }
  return { reply, actions };
}

function step(ui: string, model = ui): AgentStepLog {
  return { ui, model };
}

function inspectPayload(node: CanvasNode, refs: AgentNodeRefs) {
  const prompt = String(node.data.prompt ?? "").trim();
  const text = String(node.data.text ?? "").trim();
  const title = String(node.data.title ?? "").trim();
  const url = String(node.data.url ?? "");
  return {
    id: refs.label(node.id),
    type: node.type,
    title: title || undefined,
    status: String(node.data.status ?? "idle"),
    prompt: prompt ? prompt.slice(0, 400) : undefined,
    text: text ? text.slice(0, 400) : undefined,
    hasMedia: Boolean(url) && !url.startsWith("data:"),
    x: Math.round(node.x),
    y: Math.round(node.y),
    width: node.width,
    height: node.height,
  };
}

function requireTouched(
  ctx: AgentExecContext,
  realId: string,
  short: string,
  verb: string,
): AgentStepLog | null {
  if (ctx.touched.has(realId)) return null;
  return step(
    `已跳过${verb} ${short}（需先查看）`,
    `拒绝${verb} ${short}：请先 inspect_node`,
  );
}

async function ensureMediaTarget(
  ctx: AgentExecContext,
  kind: "image" | "video" | "text",
  preferredId: string | undefined,
  prompt: string,
): Promise<{ id: string; short: string } | AgentStepLog> {
  const state = useCanvasStore.getState();
  if (preferredId) {
    const real = ctx.refs.resolve(preferredId);
    const short = real ? ctx.refs.label(real) : preferredId;
    if (!real) return step(`找不到节点 ${preferredId}`);
    const blocked = requireTouched(ctx, real, short, "生成");
    if (blocked) return blocked;
    if (!state.nodes.some((n) => n.id === real)) {
      return step(`找不到节点 ${short}`);
    }
    return { id: real, short };
  }
  ctx.pushHistoryOnce();
  const vp = state.viewport;
  const id = state.addNode(kind === "text" ? "text" : kind, {
    x: (-vp.x + 360) / vp.zoom,
    y: (-vp.y + 200) / vp.zoom,
  });
  ctx.touched.add(id);
  const short = ctx.refs.label(id);
  state.updateNodeData(id, {
    prompt,
    title: prompt.slice(0, 24),
    status: "queued",
  });
  return { id, short };
}

export async function executeAgentActions(
  actions: CanvasAgentAction[],
  ctx: AgentExecContext,
): Promise<AgentStepLog[]> {
  const logs: AgentStepLog[] = [];
  const projectId = useCanvasStore.getState().projectId;
  if (!projectId) {
    logs.push(step("缺少项目"));
    return logs;
  }

  for (const action of actions) {
    if (ctx.alive && !ctx.alive()) break;
    try {
      if (action.name === "get_selection") {
        const selected = useCanvasStore
          .getState()
          .selectedIds.map((id) => ctx.refs.label(id));
        const line =
          selected.length > 0 ? `选中 ${selected.join("、")}` : "当前没有选中节点";
        logs.push(step(line));
        continue;
      }

      if (action.name === "inspect_node") {
        const real = ctx.refs.resolve(action.args.nodeId);
        const node = real
          ? useCanvasStore.getState().nodes.find((n) => n.id === real)
          : undefined;
        if (!real || !node) {
          logs.push(step(`找不到节点 ${action.args.nodeId}`));
          continue;
        }
        ctx.touched.add(real);
        const short = ctx.refs.label(real);
        const payload = inspectPayload(node, ctx.refs);
        logs.push(
          step(
            `已查看 ${short}（${node.type}）`,
            `inspect ${short} ${JSON.stringify(payload)}`,
          ),
        );
        continue;
      }

      if (action.name === "create_node") {
        if (!NODE_TYPES.includes(action.args.type)) {
          logs.push(step(`跳过不支持的类型 ${action.args.type}`));
          continue;
        }
        ctx.pushHistoryOnce();
        const at =
          typeof action.args.x === "number" && typeof action.args.y === "number"
            ? { x: action.args.x, y: action.args.y }
            : undefined;
        const id = useCanvasStore.getState().addNode(action.args.type, at);
        ctx.touched.add(id);
        if (action.args.data && Object.keys(action.args.data).length) {
          useCanvasStore.getState().updateNodeData(id, action.args.data);
        }
        const short = ctx.refs.label(id);
        logs.push(step(`已创建 ${action.args.type} ${short}`));
        continue;
      }

      if (action.name === "update_node") {
        const real = ctx.refs.resolve(action.args.nodeId);
        const short = real ? ctx.refs.label(real) : action.args.nodeId;
        if (!real) {
          logs.push(step(`找不到节点 ${action.args.nodeId}`));
          continue;
        }
        const blocked = requireTouched(ctx, real, short, "修改");
        if (blocked) {
          logs.push(blocked);
          continue;
        }
        ctx.pushHistoryOnce();
        useCanvasStore.getState().updateNodeData(real, action.args.data);
        logs.push(step(`已更新 ${short}`));
        continue;
      }

      if (action.name === "connect_nodes") {
        const source = ctx.refs.resolve(action.args.source);
        const target = ctx.refs.resolve(action.args.target);
        if (!source || !target) {
          logs.push(
            step(
              `连线失败（找不到 ${!source ? action.args.source : action.args.target}）`,
            ),
          );
          continue;
        }
        ctx.pushHistoryOnce();
        const edge = useCanvasStore.getState().addEdge(source, target);
        logs.push(
          step(
            edge
              ? `已连线 ${ctx.refs.label(source)} → ${ctx.refs.label(target)}`
              : "连线失败（节点不存在或重复）",
          ),
        );
        continue;
      }

      if (action.name === "generate_image") {
        const target = await ensureMediaTarget(
          ctx,
          "image",
          action.args.nodeId,
          action.args.prompt,
        );
        if (!("id" in target)) {
          logs.push(target);
          continue;
        }
        const n = action.args.n ?? 1;
        ctx.pushHistoryOnce();
        useCanvasStore.getState().updateNodeData(target.id, {
          status: "queued",
          prompt: action.args.prompt,
          genCount: n,
          error: "",
        });
        const job = await api<{ id: string }>("/jobs", {
          method: "POST",
          body: {
            kind: "image",
            input: {
              prompt: action.args.prompt,
              n,
              modelId: action.args.modelId,
              canvasProjectId: projectId,
              canvasNodeId: target.id,
              operation: "generate",
            },
          },
        });
        useCanvasStore.getState().updateNodeData(target.id, {
          status: "running",
          jobId: job.id,
        });
        logs.push(step(`已提交生图 ×${n} → ${target.short}`));
        continue;
      }

      if (action.name === "generate_video") {
        const target = await ensureMediaTarget(
          ctx,
          "video",
          action.args.nodeId,
          action.args.prompt,
        );
        if (!("id" in target)) {
          logs.push(target);
          continue;
        }
        ctx.pushHistoryOnce();
        useCanvasStore.getState().updateNodeData(target.id, {
          status: "queued",
          prompt: action.args.prompt,
          error: "",
        });
        const job = await api<{ id: string }>("/jobs", {
          method: "POST",
          body: {
            kind: "video",
            input: {
              prompt: action.args.prompt,
              modelId: action.args.modelId,
              canvasProjectId: projectId,
              canvasNodeId: target.id,
            },
          },
        });
        useCanvasStore.getState().updateNodeData(target.id, {
          status: "running",
          jobId: job.id,
        });
        logs.push(step(`已提交生视频 → ${target.short}`));
        continue;
      }

      if (action.name === "generate_text") {
        const target = await ensureMediaTarget(
          ctx,
          "text",
          action.args.nodeId,
          action.args.prompt,
        );
        if (!("id" in target)) {
          logs.push(target);
          continue;
        }
        ctx.pushHistoryOnce();
        useCanvasStore.getState().updateNode(target.id, {
          width: 360,
          height: 160,
        });
        useCanvasStore.getState().updateNodeData(target.id, {
          status: "queued",
          text: "",
          error: "",
        });
        const job = await api<{ id: string }>("/jobs", {
          method: "POST",
          body: {
            kind: "llm",
            input: {
              purpose: "chat",
              prompt: action.args.prompt,
              modelId: action.args.modelId,
              canvasProjectId: projectId,
              canvasNodeId: target.id,
            },
          },
        });
        useCanvasStore.getState().updateNodeData(target.id, {
          status: "running",
          jobId: job.id,
        });
        logs.push(step(`已提交文本生成 → ${target.short}`));
      }
    } catch (e) {
      logs.push(
        step(
          `${action.name} 失败：${e instanceof Error ? e.message : "未知错误"}`,
        ),
      );
    }
  }

  return logs;
}
