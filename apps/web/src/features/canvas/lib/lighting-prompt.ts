export type LightingParams = {
  azimuth: number;
  elevation: number;
  brightness: number;
  temperature: number;
  rim: boolean;
};

export const DEFAULT_LIGHTING: LightingParams = {
  azimuth: 0,
  elevation: 10,
  brightness: 50,
  temperature: 5500,
  rim: false,
};

const DIR_PRESETS: {
  id: string;
  label: string;
  azimuth: number;
  elevation: number;
}[] = [
  { id: "front", label: "前方", azimuth: 0, elevation: 10 },
  { id: "left", label: "左侧", azimuth: -60, elevation: 15 },
  { id: "right", label: "右侧", azimuth: 60, elevation: 15 },
  { id: "top", label: "上方", azimuth: 0, elevation: 70 },
  { id: "bottom", label: "下方", azimuth: 0, elevation: -25 },
  { id: "back", label: "后方", azimuth: 180, elevation: 20 },
];

export { DIR_PRESETS };

export function buildLightingPrompt(params: LightingParams) {
  const side =
    params.azimuth === 0
      ? "front key light"
      : params.azimuth > 0
        ? "key light from camera-right"
        : "key light from camera-left";
  const elev =
    params.elevation > 30
      ? "high angle"
      : params.elevation < 0
        ? "low angle uplight"
        : "eye-level";
  const warm =
    params.temperature < 4500
      ? "warm tungsten tone"
      : params.temperature > 6500
        ? "cool daylight tone"
        : "neutral white balance";
  const bright =
    params.brightness > 65
      ? "bright exposure"
      : params.brightness < 35
        ? "moody dim lighting"
        : "balanced exposure";
  const rim = params.rim
    ? "subtle rim light separating subject from background"
    : "soft fill, no strong rim";
  return `Relight the reference image. Keep subject identity, pose, clothing and composition. Apply ${side}, ${elev}, ${bright}, ${warm}, ${rim}. Photorealistic lighting consistency.`;
}

export function buildLightingLabel(params: LightingParams) {
  return `主光方位 ${params.azimuth}° · 仰角 ${params.elevation}° · 亮度 ${params.brightness}% · 色温 ${params.temperature}K${params.rim ? " · 轮廓光" : ""}`;
}
