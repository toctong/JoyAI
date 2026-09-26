/** 漫剧风格模板类型与查找助手（目录由 GET /styles 提供） */

export type ManjuStyleTemplate = {
  /** 稳定 slug，写入 settings.styleId */
  id: string;
  label: string;
  /** 写入提示词的完整风格句 */
  prompt: string;
  /** 封面图（public 路径或绝对 URL） */
  thumb: string;
  /** 无封面时的 CSS 色系回退 */
  tone: string;
};

export type StyleApiRow = {
  id: string;
  slug: string;
  label: string;
  prompt: string;
  thumbUrl: string;
  tone: string;
};

/** Map server style_template rows to manju UI cards (id = slug). */
export function mapStyleApiRows(rows: StyleApiRow[]): ManjuStyleTemplate[] {
  return rows.map((row) => ({
    id: row.slug,
    label: row.label,
    prompt: row.prompt,
    thumb: row.thumbUrl,
    tone: row.tone || "cinematic",
  }));
}

export function styleTemplateById(
  id: string | undefined | null,
  catalog: ManjuStyleTemplate[] = [],
): ManjuStyleTemplate | undefined {
  if (!id) return undefined;
  return catalog.find((t) => t.id === id);
}

/** 按风格文案反查模板；对不上则视为自定义 */
export function styleIdFromPrompt(
  style: string | undefined | null,
  catalog: ManjuStyleTemplate[] = [],
): string | undefined {
  const text = style?.trim();
  if (!text || !catalog.length) return undefined;
  return catalog.find((t) => t.prompt === text || t.label === text)?.id;
}
