"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import type { Editor, JSONContent } from "@tiptap/core";
import { MentionTag } from "./extensions/mention-tag";
import {
  emptyDoc,
  hasMentionWireToken,
  mentionExpandText,
  plainTextToDoc,
  serializeForGenerate,
  serializeToPlainText,
  type PromptGeneratePayload,
} from "./serialize";
import { filterSlashCommands, type SlashCommand } from "./slash-items";
import { cn } from "@/shared/lib/utils";
import "./ai-prompt-editor.css";

export type MentionCandidate = {
  id: string;
  label: string;
  url: string;
  mediaKind: "image" | "video" | "audio" | "text";
  expandText?: string;
};

function expandForItem(item: MentionCandidate): string {
  if (item.expandText?.trim()) return item.expandText.trim();
  const m = item.label.match(/(\d+)\s*$/);
  const index1 = m ? Number(m[1]) : 1;
  const kind =
    item.mediaKind === "video" || item.mediaKind === "audio"
      ? item.mediaKind
      : "image";
  return mentionExpandText(kind, index1);
}

type MenuState =
  | { type: "slash"; query: string; from: number; to: number; index: number }
  | { type: "mention"; query: string; from: number; to: number; index: number }
  | null;

type Props = {
  placeholder?: string;
  initialText?: string;
  mentionItems?: MentionCandidate[];
  disabled?: boolean;
  className?: string;
  onPlainChange?: (text: string) => void;
  onPayloadChange?: (payload: PromptGeneratePayload) => void;
  onKindCommand?: (kind: "image" | "video" | "text") => void;
  editorRef?: MutableRefObject<Editor | null>;
};

function getTriggerBeforeCursor(editor: Editor): MenuState {
  const { from } = editor.state.selection;
  const textBefore = editor.state.doc.textBetween(
    Math.max(0, from - 40),
    from,
    "\n",
    "\n",
  );
  const slashMatch = textBefore.match(/(?:^|\s)\/([^\s/]*)$/);
  if (slashMatch) {
    const query = slashMatch[1] ?? "";
    return {
      type: "slash",
      query,
      from: from - query.length - 1,
      to: from,
      index: 0,
    };
  }
  const mentionMatch = textBefore.match(/(?:^|\s)@([^\s@]*)$/);
  if (mentionMatch) {
    const query = mentionMatch[1] ?? "";
    return {
      type: "mention",
      query,
      from: from - query.length - 1,
      to: from,
      index: 0,
    };
  }
  return null;
}

function filterMentionItems(items: MentionCandidate[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return items.slice(0, 12);
  return items
    .filter((i) => i.label.toLowerCase().includes(q))
    .slice(0, 12);
}

export function AiPromptEditor({
  placeholder = "输入想法，支持 / 指令与 @ 引用素材",
  initialText = "",
  mentionItems = [],
  disabled,
  className,
  onPlainChange,
  onPayloadChange,
  onKindCommand,
  editorRef,
}: Props) {
  const [menu, setMenu] = useState<MenuState>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<MenuState>(null);
  const mentionItemsRef = useRef(mentionItems);
  const onKindCommandRef = useRef(onKindCommand);
  const onPlainChangeRef = useRef(onPlainChange);
  const onPayloadChangeRef = useRef(onPayloadChange);

  mentionItemsRef.current = mentionItems;
  onKindCommandRef.current = onKindCommand;
  onPlainChangeRef.current = onPlainChange;
  onPayloadChangeRef.current = onPayloadChange;

  const setMenuSafe = useCallback((next: MenuState) => {
    menuRef.current = next;
    setMenu(next);
  }, []);

  const initialDoc = useMemo(
    () => (initialText ? plainTextToDoc(initialText, mentionItems) : emptyDoc()),
    // seed once on mount; later hydrates via mentionItems effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const updateMenuPosition = useCallback((ed: Editor) => {
    const { view } = ed;
    const { from } = ed.state.selection;
    const start = view.coordsAtPos(from);
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setCoords({
      top: start.bottom - rect.top + 8,
      left: Math.max(0, start.left - rect.left),
    });
  }, []);

  const replaceRange = useCallback(
    (ed: Editor, from: number, to: number, content: JSONContent | string) => {
      ed.chain().focus().deleteRange({ from, to }).insertContent(content).run();
      setMenuSafe(null);
    },
    [setMenuSafe],
  );

  const applySlash = useCallback(
    (ed: Editor, cmd: SlashCommand | undefined, state: MenuState) => {
      if (!cmd || !state || state.type !== "slash") return;
      if (cmd.kind) onKindCommandRef.current?.(cmd.kind);
      replaceRange(ed, state.from, state.to, cmd.insert ?? "");
    },
    [replaceRange],
  );

  const applyMention = useCallback(
    (ed: Editor, item: MentionCandidate | undefined, state: MenuState) => {
      if (!item || !state || state.type !== "mention") return;
      replaceRange(ed, state.from, state.to, {
        type: "mentionTag",
        attrs: {
          label: item.label.startsWith("@") ? item.label : `@${item.label}`,
          mentionId: item.id,
          expandText: expandForItem(item),
          url: item.url,
          mediaKind: item.mediaKind,
        },
      });
    },
    [replaceRange],
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Placeholder.configure({ placeholder }),
      MentionTag,
    ],
    content: initialDoc,
    editable: !disabled,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "joy-ai-prompt-editor",
        spellcheck: "false",
        autocorrect: "off",
        autocapitalize: "off",
      },
    },
    onUpdate: ({ editor: ed }) => {
      const json = ed.getJSON();
      onPlainChangeRef.current?.(serializeToPlainText(json));
      onPayloadChangeRef.current?.(serializeForGenerate(json));
      const next = getTriggerBeforeCursor(ed);
      setMenuSafe(next);
      if (next) updateMenuPosition(ed);
    },
    onSelectionUpdate: ({ editor: ed }) => {
      const next = getTriggerBeforeCursor(ed);
      setMenuSafe(next);
      if (next) updateMenuPosition(ed);
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setOptions({
      editorProps: {
        attributes: {
          class: "joy-ai-prompt-editor",
          spellcheck: "false",
          autocorrect: "off",
          autocapitalize: "off",
        },
        handleKeyDown: (_view, event) => {
          const current = menuRef.current;
          if (!current) return false;

          const items =
            current.type === "slash"
              ? filterSlashCommands(current.query)
              : filterMentionItems(mentionItemsRef.current, current.query);

          if (event.key === "Escape") {
            setMenuSafe(null);
            return true;
          }
          if (!items.length) return false;

          if (event.key === "ArrowDown") {
            event.preventDefault();
            setMenuSafe({
              ...current,
              index: (current.index + 1) % items.length,
            });
            return true;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setMenuSafe({
              ...current,
              index: (current.index - 1 + items.length) % items.length,
            });
            return true;
          }
          if (event.key === "Enter" || event.key === "Tab") {
            event.preventDefault();
            if (current.type === "slash") {
              applySlash(
                editor,
                (items as SlashCommand[])[current.index],
                current,
              );
            } else {
              applyMention(
                editor,
                (items as MentionCandidate[])[current.index],
                current,
              );
            }
            return true;
          }
          return false;
        },
      },
    });
  }, [editor, applySlash, applyMention, setMenuSafe]);

  useEffect(() => {
    if (editorRef) editorRef.current = editor;
  }, [editor, editorRef]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  // When refs become available, turn @图片N (and legacy {{Image N}}) into tags
  useEffect(() => {
    if (!editor || mentionItems.length === 0) return;
    const json = editor.getJSON();
    const wire = serializeForGenerate(json).prompt;
    if (!hasMentionWireToken(wire)) return;
    // Only rewrite if there are still raw text tokens (not already all tags)
    const hasRawToken = (() => {
      let found = false;
      const walk = (n: JSONContent) => {
        if (found) return;
        if (n.type === "text" && hasMentionWireToken(String(n.text || ""))) {
          found = true;
        }
        for (const c of n.content || []) walk(c);
      };
      walk(json);
      return found;
    })();
    if (!hasRawToken) return;
    editor.commands.setContent(plainTextToDoc(wire, mentionItems));
  }, [editor, mentionItems]);

  useEffect(() => {
    if (!editor) return;
    const prev = editor.options.editorProps;
    editor.setOptions({
      editorProps: {
        ...prev,
        handlePaste: (_view, event) => {
          const text = event.clipboardData?.getData("text/plain");
          if (!text || !hasMentionWireToken(text)) return false;
          event.preventDefault();
          const doc = plainTextToDoc(text, mentionItemsRef.current);
          const paragraphs = doc.content || [];
          if (paragraphs.length === 1 && paragraphs[0]?.content) {
            editor
              .chain()
              .focus()
              .insertContent(paragraphs[0].content)
              .run();
          } else {
            editor.chain().focus().insertContent(paragraphs).run();
          }
          return true;
        },
      },
    });
  }, [editor]);

  const slashItems =
    menu?.type === "slash" ? filterSlashCommands(menu.query) : [];
  const mentionMenuItems =
    menu?.type === "mention"
      ? filterMentionItems(mentionItems, menu.query)
      : [];

  return (
    <div ref={wrapRef} className={cn("joy-ai-prompt", className)}>
      <EditorContent editor={editor} />

      {menu?.type === "slash" && slashItems.length > 0 && coords ? (
        <div
          className="joy-prompt-menu"
          style={{ top: coords.top, left: coords.left }}
        >
          {slashItems.map((item, i) => (
            <button
              key={item.id}
              type="button"
              className={cn(
                "joy-prompt-menu-item",
                i === menu.index && "is-active",
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                if (editor) applySlash(editor, item, menu);
              }}
            >
              <div>
                <strong>{item.label}</strong>
                <span>{item.description}</span>
              </div>
            </button>
          ))}
        </div>
      ) : null}

      {menu?.type === "mention" && coords ? (
        <div
          className="joy-prompt-menu"
          style={{ top: coords.top, left: coords.left }}
        >
          {mentionMenuItems.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              暂无可引用素材，先上传参考图
            </div>
          ) : (
            mentionMenuItems.map((item, i) => (
              <button
                key={item.id}
                type="button"
                className={cn(
                  "joy-prompt-menu-item",
                  i === menu.index && "is-active",
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (editor) applyMention(editor, item, menu);
                }}
              >
                {item.mediaKind === "image" && item.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.url}
                    alt=""
                    className="joy-prompt-menu-thumb"
                  />
                ) : item.mediaKind === "video" && item.url ? (
                  <video
                    src={item.url}
                    muted
                    playsInline
                    preload="metadata"
                    className="joy-prompt-menu-thumb"
                  />
                ) : (
                  <div className="joy-prompt-menu-thumb" />
                )}
                <div>
                  <strong>{item.label}</strong>
                  <span>
                    {item.mediaKind === "video"
                      ? "视频"
                      : item.mediaKind === "audio"
                        ? "音频"
                        : "图片"}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
