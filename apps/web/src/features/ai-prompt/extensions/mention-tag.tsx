import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "@/features/canvas/canvas-ref-preview.css";

export type MentionTagAttrs = {
  label: string;
  mentionId: string;
  expandText: string;
  url: string;
  mediaKind: "" | "image" | "video" | "audio" | "text";
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    mentionTag: {
      insertMentionTag: (attrs: Partial<MentionTagAttrs>) => ReturnType;
    };
  }
}

function MentionTagView({ node, selected, deleteNode }: NodeViewProps) {
  const label = String(node.attrs.label || "@参考");
  const url = String(node.attrs.url || "");
  const kind = String(node.attrs.mediaKind || "");
  const showThumb =
    Boolean(url) &&
    !url.startsWith("data:") &&
    (kind === "image" || kind === "video" || kind === "");
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<{ left: number; top: number } | null>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearLeave() {
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  }

  function show() {
    if (!showThumb) return;
    clearLeave();
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setBox({ left: rect.left + rect.width / 2, top: rect.top });
    setOpen(true);
  }

  function hide() {
    clearLeave();
    leaveTimer.current = setTimeout(() => setOpen(false), 80);
  }

  useEffect(() => () => clearLeave(), []);

  return (
    <NodeViewWrapper
      as="span"
      className={`mention-tag${selected ? " is-selected" : ""}${kind ? ` media-${kind}` : ""}`}
      contentEditable={false}
    >
      <span
        ref={anchorRef}
        className="mention-preview-anchor"
        onPointerEnter={show}
        onPointerLeave={hide}
      >
        {showThumb ? (
          kind === "video" ? (
            <video
              src={url}
              muted
              playsInline
              preload="metadata"
              className="mention-thumb"
              draggable={false}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="mention-thumb" draggable={false} />
          )
        ) : null}
        <span className="mention-label">{label}</span>
      </span>
      <button
        type="button"
        className="mention-remove"
        aria-label="移除引用"
        tabIndex={-1}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          deleteNode();
        }}
      >
        ×
      </button>
      {open && box && typeof document !== "undefined"
        ? createPortal(
            <div
              className="joy-ref-hover-portal"
              style={{ left: box.left, top: box.top }}
              onPointerEnter={show}
              onPointerLeave={hide}
            >
              <div className="joy-ref-hover-card">
                {kind === "video" ? (
                  <video
                    src={url}
                    muted
                    playsInline
                    preload="metadata"
                    autoPlay
                    loop
                    className="joy-ref-hover-media"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt="" className="joy-ref-hover-media" />
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </NodeViewWrapper>
  );
}

export const MentionTag = Node.create({
  name: "mentionTag",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      label: { default: "@参考" },
      mentionId: { default: "" },
      expandText: { default: "" },
      url: { default: "" },
      mediaKind: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-mention-tag]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes({ "data-mention-tag": "" }, HTMLAttributes),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MentionTagView);
  },

  addCommands() {
    return {
      insertMentionTag:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              label: attrs.label || "@参考",
              mentionId: attrs.mentionId || "",
              expandText: attrs.expandText || "",
              url: attrs.url || "",
              mediaKind: attrs.mediaKind || "",
            },
          }),
    };
  },
});
