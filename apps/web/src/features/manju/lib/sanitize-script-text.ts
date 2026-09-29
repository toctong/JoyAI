/**
 * 整理帮写正文：钩子/预告元标注移出可拍正文，供写入分集 hook。
 */

const HOOK_RE =
  /(?:\n|^)\s*(?:本集钩子|下集预告|下集钩子|剧集钩子)[：:]\s*([\s\S]*?)\s*$/u;

export function sanitizeScriptBody(raw: string): {
  script: string;
  hook: string | null;
} {
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) return { script: "", hook: null };

  const match = text.match(HOOK_RE);
  if (!match) {
    return { script: text, hook: null };
  }

  const hook = match[1]?.replace(/\s+/g, " ").trim() || null;
  const script = text.slice(0, match.index).replace(/\s+$/u, "").trim();
  return { script, hook };
}
