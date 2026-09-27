"use client";

import { BrandOpenAiIcon, CanvasSvg, type CanvasSvgName } from "./svg-icon";

type IconProps = {
  className?: string;
  title?: string;
};

function icon(name: CanvasSvgName) {
  return function NamedIcon({ className, title }: IconProps) {
    return <CanvasSvg name={name} className={className} title={title} />;
  };
}

/** File-based Lucide canvas icons (no lucide npm dependency). */
export const CanvasIconImage = icon("image");
export const CanvasIconText = icon("text");
export const CanvasIconVideo = icon("video");
export const CanvasIconAudio = icon("audio");
export const CanvasIconPanorama = icon("panorama");
export const CanvasIconDirector = icon("director");
export const CanvasIconPrompt = icon("prompt");
export const CanvasIconUpload = icon("upload");
export const CanvasIconFolder = icon("folder");
export const CanvasIconSubject = icon("subject");
export const CanvasIconSelect = icon("select");
export const CanvasIconHand = icon("hand");
export const CanvasIconFit = icon("fit");
export const CanvasIconMinimap = icon("minimap");
export const CanvasIconSnap = icon("snap");
export const CanvasIconGrid = icon("grid");
export const CanvasIconDots = icon("dots");
export const CanvasIconBlank = icon("blank");
export const CanvasIconPalette = icon("palette");
export const CanvasIconShortcuts = icon("help");
export const CanvasIconUndo = icon("undo");
export const CanvasIconRedo = icon("redo");
export const CanvasIconTrash = icon("trash");
export const CanvasIconEraser = icon("eraser");
export const CanvasIconGroup = icon("group");
export const CanvasIconSearch = icon("search");
export const CanvasIconHistory = icon("history");
export const CanvasIconPanelClose = icon("panel-close");
export const CanvasIconLink = icon("link");
export const CanvasIconPlay = icon("play");
export const CanvasIconShare = icon("share");
export const CanvasIconCopy = icon("copy");
export const CanvasIconDownload = icon("download");
export const CanvasIconClose = icon("close");
export const CanvasIconInfo = icon("info");
export const CanvasIconPencil = icon("pencil");
export const CanvasIconScissors = icon("scissors");
export const CanvasIconMaximize = icon("maximize");
export const CanvasIconLock = icon("lock");
export const CanvasIconUnlock = icon("unlock");
export const CanvasIconRetry = icon("retry");
export const CanvasIconPlus = icon("plus");
export const CanvasIconMinus = icon("minus");
export const CanvasIconCamera = icon("camera");
export const CanvasIconBrush = icon("brush");
export const CanvasIconOutpaint = icon("outpaint");
export const CanvasIconInpaint = icon("inpaint");
export const CanvasIconFrame = icon("frame");
export const CanvasIconCheck = icon("check");
export const CanvasIconPause = icon("pause");
export const CanvasIconZoomIn = icon("zoom-in");
export const CanvasIconZoomOut = icon("zoom-out");
export const CanvasIconFile = icon("file");
export const CanvasIconPanelBottom = icon("panel-bottom");
export const CanvasIconMessage = icon("message");
export const CanvasIconSparkles = icon("prompt");
export const CanvasIconAlignLeft = icon("align-left");
export const CanvasIconAlignRight = icon("align-right");
export const CanvasIconAlignCenterH = icon("align-center-h");
export const CanvasIconAlignCenterV = icon("align-center-v");
export const CanvasIconAlignTop = icon("align-top");
export const CanvasIconAlignBottom = icon("align-bottom");
export const CanvasIconDistributeH = icon("distribute-h");
export const CanvasIconDistributeV = icon("distribute-v");
export const CanvasIconUngroup = icon("ungroup");
export const CanvasIconMenu = icon("menu");
export const CanvasIconHome = icon("home");
export const CanvasIconPanelOpen = icon("panel-open");
export const CanvasIconAlert = icon("alert");
export const CanvasIconLoader = icon("loader");
export const CanvasIconWand = icon("wand");
export const CanvasIconKeyboard = icon("keyboard");
export const CanvasIconMore = icon("more");
export const CanvasIconChevronLeft = icon("chevron-left");
export const CanvasIconMove = icon("move");
export const CanvasIconFolderPlus = icon("folder-plus");
export const CanvasIconCloudCheck = icon("cloud-check");
export const CanvasIconCloudUpload = icon("cloud-upload");

/** AI / prompt mark — real SVG from thesvg.org OpenAI brand. */
export function CanvasIconAi({ className, title }: IconProps) {
  return (
    <span title={title} className={className}>
      <BrandOpenAiIcon className="size-full" />
    </span>
  );
}
