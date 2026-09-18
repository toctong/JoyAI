from pathlib import Path
import re

p = Path("apps/web/src/features/canvas/canvas-context-menu.tsx")
t = p.read_text(encoding="utf-8")

# 1) Drop stack API + UI first (while lucide names still present).
t = t.replace("  onStack?: (mode: StackOrder) => void;\n", "")
t = t.replace("  onStack,\n", "")
t = t.replace('import type { StackOrder } from "./lib/stack-order";\n', "")

start = t.find("      {onStack ? (")
if start < 0:
    raise SystemExit("onStack block not found")
end = t.find("      {onInfo ? (", start)
if end < 0:
    raise SystemExit("onInfo marker not found")
t = t[:start] + t[end:]

# 2) Swap lucide import block for canvas icons.
old_import = """import {
  AudioLines,
  Clapperboard,
  Copy,
  FileText,
  Brush,
  BringToFront,
  Frame,
  Globe,
  Grid2x2,
  Info,
  Group,
  Image as ImageIcon,
  Lock,
  LockOpen,
  Maximize2,
  Scissors,
  SendToBack,
  Sparkles,
  Trash2,
  Type,
  Ungroup,
  Upload,
  Video,
  X,
  ZoomIn,
} from "lucide-react";"""

new_import = """import {
  CanvasIconAudio,
  CanvasIconBrush,
  CanvasIconClose,
  CanvasIconCopy,
  CanvasIconDirector,
  CanvasIconFile,
  CanvasIconFrame,
  CanvasIconGrid,
  CanvasIconGroup,
  CanvasIconImage,
  CanvasIconInfo,
  CanvasIconLock,
  CanvasIconMaximize,
  CanvasIconPanorama,
  CanvasIconScissors,
  CanvasIconSparkles,
  CanvasIconText,
  CanvasIconTrash,
  CanvasIconUngroup,
  CanvasIconUnlock,
  CanvasIconUpload,
  CanvasIconVideo,
  CanvasIconZoomIn,
} from "./icons/canvas-icons";"""

if old_import not in t:
    raise SystemExit("lucide import block not found")
t = t.replace(old_import, new_import)

t = t.replace(
    """const ICONS: Record<CanvasNodeType, typeof Type> = {
  text: Type,
  image: ImageIcon,
  video: Video,
  prompt: Sparkles,
  panorama: Globe,
  audio: AudioLines,
  director: Clapperboard,
};""",
    """const ICONS: Record<CanvasNodeType, typeof CanvasIconText> = {
  text: CanvasIconText,
  image: CanvasIconImage,
  video: CanvasIconVideo,
  prompt: CanvasIconSparkles,
  panorama: CanvasIconPanorama,
  audio: CanvasIconAudio,
  director: CanvasIconDirector,
};""",
)

# 3) Replace JSX icon tags only (avoid onInfo / props).
tag_map = {
    "FileText": "CanvasIconFile",
    "Brush": "CanvasIconBrush",
    "Frame": "CanvasIconFrame",
    "Grid2x2": "CanvasIconGrid",
    "Info": "CanvasIconInfo",
    "Group": "CanvasIconGroup",
    "ImageIcon": "CanvasIconImage",
    "LockOpen": "CanvasIconUnlock",
    "Lock": "CanvasIconLock",
    "Maximize2": "CanvasIconMaximize",
    "Scissors": "CanvasIconScissors",
    "Sparkles": "CanvasIconSparkles",
    "Trash2": "CanvasIconTrash",
    "Type": "CanvasIconText",
    "Ungroup": "CanvasIconUngroup",
    "Upload": "CanvasIconUpload",
    "Video": "CanvasIconVideo",
    "AudioLines": "CanvasIconAudio",
    "Globe": "CanvasIconPanorama",
    "ZoomIn": "CanvasIconZoomIn",
    "Copy": "CanvasIconCopy",
    "X": "CanvasIconClose",
    "BringToFront": "CanvasIconBringFront",
    "SendToBack": "CanvasIconSendBack",
}

for old, new in tag_map.items():
    t = re.sub(rf"<(/?){old}(\s|/|>)", rf"<\1{new}\2", t)

leftovers = [
    x
    for x in (
        "lucide-react",
        "BringToFront",
        "SendToBack",
        "StackOrder",
        "onStack",
        "ImageIcon",
        "FileText",
        "Trash2",
        "Maximize2",
        "LockOpen",
        "Grid2x2",
        "AudioLines",
        "Clapperboard",
    )
    if x in t
]
if leftovers:
    raise SystemExit(f"leftover refs: {leftovers}")

p.write_text(t, encoding="utf-8", newline="\n")
print("ok")
print("has_info_label", "节点信息" in t)
print("has_stack_label", "置于顶层" in t)
