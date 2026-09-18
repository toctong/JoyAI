"use client";

import type { CanvasNode } from "@joyai/shared";
import { TextNode } from "./nodes/text-node";
import { ImageNode } from "./nodes/image-node";
import { VideoNode } from "./nodes/video-node";
import { PromptNode } from "./nodes/prompt-node";
import { PanoramaNode } from "./nodes/panorama-node";
import { AudioNode } from "./nodes/audio-node";
import { DirectorNode } from "./nodes/director-node";

type Props = {
  node: CanvasNode;
  onPointerDown: (e: React.PointerEvent, node: CanvasNode) => void;
  editingImage: boolean;
  onEditingImageChange: (open: boolean) => void;
  onOpenDirector?: (nodeId: string) => void;
};

export function NodeView({
  node,
  onPointerDown,
  editingImage,
  onEditingImageChange,
  onOpenDirector,
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
    case "panorama":
      return <PanoramaNode node={node} onPointerDown={handler} />;
    case "audio":
      return <AudioNode node={node} onPointerDown={handler} />;
    case "director":
      return (
        <DirectorNode
          node={node}
          onPointerDown={handler}
          onOpenDirector={onOpenDirector}
        />
      );
    default:
      return null;
  }
}
