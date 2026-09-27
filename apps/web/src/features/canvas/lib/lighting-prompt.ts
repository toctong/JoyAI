export type LightingParams = {
  azimuth: number;
  elevation: number;
  brightness: number;
  temperature: number;
  rim: boolean;
};

export const DEFAULT_LIGHTING: LightingParams = {
  azimuth: 35,
  elevation: 15,
  brightness: 50,
  temperature: 5600,
  rim: false,
};

/** Sphere radius used by the Three.js light gizmo (world units). */
export const LIGHTING_SPHERE_RADIUS = 1.35;

const DIR_PRESETS: {
  id: string;
  label: string;
  azimuth: number;
  elevation: number;
}[] = [
  { id: "left", label: "左侧", azimuth: -90, elevation: 10 },
  { id: "top", label: "顶部", azimuth: 0, elevation: 80 },
  { id: "right", label: "右侧", azimuth: 90, elevation: 10 },
  { id: "front", label: "前方", azimuth: 0, elevation: 10 },
  { id: "bottom", label: "底部", azimuth: 0, elevation: -70 },
  { id: "back", label: "后方", azimuth: 180, elevation: 15 },
];

export { DIR_PRESETS };

export function clampAzimuth(value: number) {
  let next = value;
  while (next > 180) next -= 360;
  while (next < -180) next += 360;
  return Math.round(next);
}

export function clampElevation(value: number) {
  return Math.max(-90, Math.min(90, Math.round(value)));
}

/** World position on the lighting sphere from azimuth / elevation degrees. */
export function lightingPosition(
  azimuth: number,
  elevation: number,
  radius = LIGHTING_SPHERE_RADIUS,
) {
  const az = (azimuth * Math.PI) / 180;
  const el = (elevation * Math.PI) / 180;
  return {
    x: Math.sin(az) * Math.cos(el) * radius,
    y: Math.sin(el) * radius,
    z: Math.cos(az) * Math.cos(el) * radius,
  };
}

/** Inverse of lightingPosition — point on/near sphere → degrees. */
export function lightingAnglesFromPoint(
  x: number,
  y: number,
  z: number,
): Pick<LightingParams, "azimuth" | "elevation"> {
  const len = Math.hypot(x, y, z) || 1;
  const nx = x / len;
  const ny = y / len;
  const nz = z / len;
  return {
    azimuth: clampAzimuth((Math.atan2(nx, nz) * 180) / Math.PI),
    elevation: clampElevation((Math.asin(Math.max(-1, Math.min(1, ny))) * 180) / Math.PI),
  };
}

export function temperatureToneLabel(kelvin: number) {
  if (kelvin < 4000) return "暖色";
  if (kelvin < 5000) return "偏暖";
  if (kelvin <= 6200) return "中性";
  if (kelvin < 7200) return "偏冷";
  return "冷色";
}

export function buildLightingPrompt(params: LightingParams) {
  const side =
    Math.abs(params.azimuth) >= 150
      ? "strong backlight from behind the subject"
      : params.azimuth === 0
        ? "front key light"
        : params.azimuth > 0
          ? "key light from camera-right"
          : "key light from camera-left";
  const elev =
    params.elevation > 45
      ? "high angle top light"
      : params.elevation < -20
        ? "low angle uplight from below"
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
  return `主光方位 ${params.azimuth}° · 仰角 ${params.elevation}° · 亮度 ${params.brightness}% · ${params.temperature}K ${temperatureToneLabel(params.temperature)}${params.rim ? " · 轮廓光" : ""}`;
}
