"use client";

import { useLayoutEffect, type RefObject } from "react";
import { useCanvasStore } from "../store";

/** Write the measured content height back so edges and hit tests match the card. */
export function useSyncNodeHeight(
  nodeId: string,
  ref: RefObject<HTMLElement | null>,
  deps: readonly unknown[],
) {
  const updateNode = useCanvasStore((s) => s.updateNode);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const next = Math.ceil(el.offsetHeight);
    if (next < 40) return;
    const node = useCanvasStore.getState().nodes.find((item) => item.id === nodeId);
    if (!node) return;
    if (Math.abs(next - (node.height ?? 0)) <= 2) return;
    updateNode(nodeId, { height: next });
    // Caller lists the content inputs that change the card height.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId, updateNode, ...deps]);
}
