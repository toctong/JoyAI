import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";

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
  const showThumb = Boolean(url) && (kind === "image" || kind === "");

  return (
    <NodeViewWrapper
      as="span"
      className={`mention-tag${selected ? " is-selected" : ""}${kind ? ` media-${kind}` : ""}`}
      contentEditable={false}
    >
      {showThumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="mention-thumb" draggable={false} />
      ) : null}
      <span className="mention-label">{label}</span>
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
