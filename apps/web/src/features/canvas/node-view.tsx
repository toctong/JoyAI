"use client";

import type { CanvasNode } from "@joyai/shared";
import { TextNode } from "./nodes/text-node";
import { ImageNode } from "./nodes/image-node";
import { VideoNode } from "./nodes/video-node";
import { PromptNode } from "./nodes/prompt-node";

type Props = {
  node: CanvasNode;
  onPointerDown: (e: React.PointerEvent, node: CanvasNode) => void;
  editingImage: boolean;
  onEditingImageChange: (open: boolean) => void;
};

export function NodeView({
  node,
  onPointerDown,
  editingImage,
  onEditingImageChange,
}: Props) {
  const handler = (e: React.PointerEvent) => onPointerDown(e, node);
  switch (node.type) {
    case "text":
      return <TextNode node={node} onPointerDown={handler} />;
    case "image":
      return (
        <ImageNode
          node={node}
          onPointerDown={handler}
          editing={editingImage}
          onEditingChange={onEditingImageChange}
        />
      );
    case "video":
      return <VideoNode node={node} onPointerDown={handler} />;
    case "prompt":
      return <PromptNode node={node} onPointerDown={handler} />;
    default:
      return null;
  }
}
