/** Wrap user text so image models emit an equirectangular 2:1 panorama. */
import { CANVAS_NODE_SIZE } from "@/shared/theme";

export function wrapPanoramaPrompt(
  userText: string,
  opts?: { hasReference?: boolean },
) {
  const body = userText.trim() || "开阔自然场景";
  const hasReference = Boolean(opts?.hasReference);
  const geometry =
    "最终必须是等距柱状投影的完整球形全景（720度球形环境），比例严格 2:1，宽度是高度的两倍，只输出一张连续画面；水平覆盖完整 360 度，垂直覆盖天空到地面约 180 度，观看者位于场景中心，可向上向下左右完整环视，地平线靠近画面垂直中线，左右边缘必须自然无缝衔接。";
  const common =
    "适合作为 3D 环视或导演台环境球内壁贴图；不要摄影师、相机、镜头、三脚架或任何拍摄设备入镜；不要分屏拼贴、多宫格、画中画或插入小图；除非用户另有说明，保持真实摄影质感、自然空间纵深与电影级光影。";
  const ban =
    "不要普通横幅照片、不要 21:9 电影宽银幕截图、不要鱼眼圆形边框、不要多图拼贴、不要文字水印边框或明显接缝。";
  if (hasReference) {
    return [
      "这是图生全景任务。参考图只提供主体、材质、色彩与风格；若参考图已是全景环境则保留场景并修正为可环视几何，若不是全景比例则补全四周环境，禁止简单拉伸。",
      geometry,
      common,
      ban,
      `用户描述：${body}`,
    ].join(" ");
  }
  return [
    "这是文字生成全景任务，输出一张连续环境画面。",
    geometry,
    common,
    ban,
    `画面：${body}`,
  ].join(" ");
}

export const PANORAMA_NODE_SIZE = CANVAS_NODE_SIZE.panorama;

/** ~2:1 aspect used for upload / convert heuristics. */
export function isPanoramaAspect(width: number, height: number) {
  if (width <= 0 || height <= 0) return false;
  return Math.abs(width / height - 2) < 0.08;
}

/** Probe remote image and write `aspectHint` on the panorama node. */
export function flagPanoramaAspect(
  url: string,
  onResult: (hint: "ok" | "non-2:1") => void,
) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    onResult(
      isPanoramaAspect(img.naturalWidth, img.naturalHeight) ? "ok" : "non-2:1",
    );
  };
  img.src = url;
}
