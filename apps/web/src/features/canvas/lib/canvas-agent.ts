import type { CanvasNode, CanvasNodeType } from "@joyai/shared";
import { useCanvasStore } from "../store";
import { api } from "@/shared/lib/api";

export const CANVAS_AGENT_SYSTEM = `你是 JoyAI 无限画布助手。根据用户意图规划画布操作。
必须只输出一个 JSON 对象（不要 markdown 围栏），格式：
{"reply":"给用户的简短中文说明","actions":[...]}

可用 actions（name + args）：
- get_selection：无参数，读取当前选中（也可不调用，上下文已含选区）
- create_node：{"type":"text"|"image"|"prompt"|"video","x"?:number,"y"?:number,"data"?:object}
- connect_nodes：{"source":"nodeId","target":"nodeId"}
- generate_image：{"prompt":string,"nodeId"?:string,"n"?:1-4,"modelId"?:string}
- generate_video：{"prompt":string,"nodeId"?:string,"modelId"?:string}
- generate_text：{"prompt":string,"nodeId"?:string,"modelId"?:string}

规则：
1. 优先少步完成；不要编造不存在的 nodeId。
2. 生成类动作会提交异步 Job；reply 里说明已提交即可。
3. 不要输出 base64；不要删除节点；不要安排复杂编排脚本。
4. 若只需聊天回答、无需改画布，actions 可为 []。`;

export type CanvasAgentAction =
  | { name: "get_selection"; args?: Record<string, never> }
  | {
      name: "create_node";
      args: {
        type: CanvasNodeType;
        x?: number;
        y?: number;
        data?: Record<string, unknown>;
      };
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

function summarizeNode(node: CanvasNode) {
  const title = String(node.data.title ?? "").trim();
  const prompt = String(node.data.prompt ?? node.data.text ?? "").trim();
  const status = String(node.data.status ?? "idle");
  const hasMedia = Boolean(String(node.data.url ?? "")) &&
    !String(node.data.url ?? "").startsWith("data:");
  return {
    id: node.id,
    type: node.type,
    title: title || undefined,
    status,
    hasMedia,
    promptPreview: prompt ? prompt.slice(0, 120) : undefined,
    x: Math.round(node.x),
    y: Math.round(node.y),
  };
}

export function buildCanvasAgentContext() {
  const state = useCanvasStore.getState();
  const selected = state.nodes.filter((n) => state.selectedIds.includes(n.id));
  return {
    projectId: state.projectId,
    nodeCount: state.nodes.length,
    edgeCount: state.edges.length,
    selected: selected.map(summarizeNode),
    nodes: state.nodes.slice(0, 40).map(summarizeNode),
  };
}

export function buildAgentUserPrompt(userText: string) {
  const ctx = buildCanvasAgentContext();
  return [
    "当前画布上下文（JSON）：",
    JSON.stringify(ctx),
    "",
    "用户请求：",
    userText.trim(),
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

export function parseAgentPlan(text: string): CanvasAgentPlan {
  let raw: unknown;
  try {
    raw = extractJsonObject(text);
  } catch {
    return { reply: text.trim() || "已收到", actions: [] };
  }
  if (!raw || typeof raw !== "object") {
    return { reply: text.trim() || "已收到", actions: [] };
  }
  const obj = raw as Record<string, unknown>;
  const reply = String(obj.reply ?? obj.message ?? "").trim() || "已处理";
  const actionsRaw = Array.isArray(obj.actions) ? obj.actions : [];
  const actions: CanvasAgentAction[] = [];
  for (const item of actionsRaw.slice(0, 12)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const name = String(row.name ?? row.action ?? "");
    const args =
      row.args && typeof row.args === "object"
        ? (row.args as Record<string, unknown>)
        : row;
    if (name === "get_selection") {
      actions.push({ name: "get_selection" });
      continue;
    }
    if (name === "create_node") {
      const type = String(args.type ?? "text") as CanvasNodeType;
      actions.push({
        name: "create_node",
        args: {
          type,
          x: typeof args.x === "number" ? args.x : undefined,
          y: typeof args.y === "number" ? args.y : undefined,
          data:
            args.data && typeof args.data === "object"
              ? (args.data as Record<string, unknown>)
              : undefined,
        },
      });
      continue;
    }
    if (name === "connect_nodes") {
      const source = String(args.source ?? "");
      const target = String(args.target ?? "");
      if (source && target) {
        actions.push({ name: "connect_nodes", args: { source, target } });
      }
      continue;
    }
    if (name === "generate_image") {
      const prompt = String(args.prompt ?? "").trim();
      if (!prompt) continue;
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
      if (!prompt) continue;
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
      if (!prompt) continue;
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

async function ensureMediaTarget(
  kind: "image" | "video" | "text",
  preferredId?: string,
  prompt?: string,
) {
  const state = useCanvasStore.getState();
  if (preferredId) {
    const found = state.nodes.find((n) => n.id === preferredId);
    if (found) return found.id;
  }
  const vp = state.viewport;
  const x = (-vp.x + 360) / vp.zoom;
  const y = (-vp.y + 200) / vp.zoom;
  const id = state.addNode(kind === "text" ? "text" : kind, { x, y });
  if (prompt) {
    state.updateNodeData(id, {
      prompt,
      title: prompt.slice(0, 24),
      status: "queued",
    });
  }
  return id;
}

export async function executeAgentActions(
  actions: CanvasAgentAction[],
): Promise<string[]> {
  const logs: string[] = [];
  const projectId = useCanvasStore.getState().projectId;
  if (!projectId) {
    logs.push("缺少 projectId");
    return logs;
  }

  useCanvasStore.getState().pushHistory();

  for (const action of actions) {
    try {
      if (action.name === "get_selection") {
        const selected = useCanvasStore.getState().selectedIds;
        logs.push(`选中 ${selected.length} 个节点`);
        continue;
      }
      if (action.name === "create_node") {
        const type = action.args.type;
        const allowed: CanvasNodeType[] = [
          "text",
          "image",
          "prompt",
          "video",
        ];
        if (!allowed.includes(type)) {
          logs.push(`跳过不支持的类型 ${type}`);
          continue;
        }
        const at =
          typeof action.args.x === "number" && typeof action.args.y === "number"
            ? { x: action.args.x, y: action.args.y }
            : undefined;
        const id = useCanvasStore.getState().addNode(type, at);
        if (action.args.data) {
          useCanvasStore.getState().updateNodeData(id, action.args.data);
        }
        logs.push(`已创建 ${type} 节点 ${id}`);
        continue;
      }
      if (action.name === "connect_nodes") {
        const edge = useCanvasStore
          .getState()
          .addEdge(action.args.source, action.args.target);
        logs.push(edge ? `已连线 ${edge}` : "连线失败（节点不存在或重复）");
        continue;
      }
      if (action.name === "generate_image") {
        const targetId = await ensureMediaTarget(
          "image",
          action.args.nodeId,
          action.args.prompt,
        );
        const n = action.args.n ?? 1;
        useCanvasStore.getState().updateNodeData(targetId, {
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
              canvasNodeId: targetId,
              operation: "generate",
            },
          },
        });
        useCanvasStore.getState().updateNodeData(targetId, {
          status: "running",
          jobId: job.id,
        });
        logs.push(`已提交生图 ×${n} → ${targetId}`);
        continue;
      }
      if (action.name === "generate_video") {
        const targetId = await ensureMediaTarget(
          "video",
          action.args.nodeId,
          action.args.prompt,
        );
        useCanvasStore.getState().updateNodeData(targetId, {
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
              canvasNodeId: targetId,
            },
          },
        });
        useCanvasStore.getState().updateNodeData(targetId, {
          status: "running",
          jobId: job.id,
        });
        logs.push(`已提交生视频 → ${targetId}`);
        continue;
      }
      if (action.name === "generate_text") {
        const targetId = await ensureMediaTarget(
          "text",
          action.args.nodeId,
          action.args.prompt,
        );
        useCanvasStore.getState().updateNode(targetId, {
          width: 360,
          height: 160,
        });
        useCanvasStore.getState().updateNodeData(targetId, {
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
              canvasNodeId: targetId,
            },
          },
        });
        useCanvasStore.getState().updateNodeData(targetId, {
          status: "running",
          jobId: job.id,
        });
        logs.push(`已提交文本生成 → ${targetId}`);
      }
    } catch (e) {
      logs.push(
        `${action.name} 失败：${e instanceof Error ? e.message : "未知错误"}`,
      );
    }
  }

  return logs;
}
