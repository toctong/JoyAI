/** Compact camera / lens prompt helpers for canvas generation (JoyAI rewrite). */

export type CameraControlOptions = {
  enabled: boolean;
  camera: string;
  lens: string;
  focalLength: number;
  aperture: number;
};

export type CameraProfile = {
  id: string;
  label: string;
  zhName: string;
  shortTag: string;
  profilePrompt: string;
  bodyColor: string;
  accentColor: string;
  description: string;
  useCase: string;
};

export type LensProfile = {
  id: string;
  label: string;
  zhName: string;
  shortTag: string;
  profilePrompt: string;
  lensColor: string;
  ringColor: string;
  description: string;
  useCase: string;
  anamorphic?: boolean;
};

export const CAMERA_PROFILES: CameraProfile[] = [
  {
    id: "arri_alexa_mini_lf",
    label: "ARRI Mini LF",
    zhName: "阿莱 Mini LF",
    shortTag: "ARRI Alexa Mini LF",
    profilePrompt:
      "shot on ARRI Alexa Mini LF with ARRI Wide Gamut color science, large-format sensor, natural skin tones, buttery highlight rolloff, feature-film look",
    bodyColor: "#3a3a3a",
    accentColor: "#d4d4d4",
    description: "行业基准院线电影机，肤色渲染公认最佳。",
    useCase: "剧情片、人像叙事、品牌广告",
  },
  {
    id: "red_komodo_6k",
    label: "RED Komodo",
    zhName: "RED 科莫多 6K",
    shortTag: "RED Komodo 6K",
    profilePrompt:
      "shot on RED Komodo 6K with RED IPP2 pipeline, Super35 global-shutter sensor, crisp modern detail, clean shadows, action-ready digital cinema look",
    bodyColor: "#8b2b2b",
    accentColor: "#ff3b3b",
    description: "紧凑全局快门 6K，无果冻效应，动作片首选。",
    useCase: "动作片、FPV、穿越机、无人机",
  },
  {
    id: "sony_venice_2",
    label: "Sony Venice 2",
    zhName: "索尼 Venice 2",
    shortTag: "Sony Venice 2",
    profilePrompt:
      "shot on Sony Venice 2 with dual-base ISO latitude, refined cinematic color, clean shadows and controlled highlights, premium commercial look",
    bodyColor: "#2f343a",
    accentColor: "#7eb8ff",
    description: "双原生 ISO，高动态范围，商业片常用。",
    useCase: "商业广告、剧情、纪录片",
  },
  {
    id: "canon_c500_mk2",
    label: "Canon C500 Mk II",
    zhName: "佳能 C500 Mk II",
    shortTag: "Canon C500 Mark II",
    profilePrompt:
      "shot on Canon C500 Mark II with Canon Log cinema color, full-frame sensor latitude, familiar Canon skin-tone rendering, clean broadcast-ready look",
    bodyColor: "#2c2c2c",
    accentColor: "#e85d4c",
    description: "全画幅佳能电影机，肤色讨喜、易上手。",
    useCase: "剧情、婚礼、直播与纪录片",
  },
  {
    id: "iphone_pro_cinema",
    label: "iPhone Cinema",
    zhName: "iPhone 电影模式",
    shortTag: "iPhone Pro cinema",
    profilePrompt:
      "shot on iPhone Pro cinematic mode, contemporary mobile cinema look, natural handheld intimacy, clean smartphone dynamic range",
    bodyColor: "#1a1a1a",
    accentColor: "#a8a8a8",
    description: "移动端电影感，亲近自然的手持气质。",
    useCase: "Vlog、社交媒体、生活纪实",
  },
];

export const LENS_PROFILES: LensProfile[] = [
  {
    id: "arri_signature_prime",
    label: "ARRI Signature Prime",
    zhName: "阿莱大师定焦",
    shortTag: "ARRI Signature Prime",
    profilePrompt:
      "ARRI Signature Prime lens, large-format coverage, creamy organic bokeh, gentle contrast, smooth highlight rolloff, soft flattering flares",
    lensColor: "#4a4a4a",
    ringColor: "#c8c8c8",
    description: "院线级定焦，焦外柔和、肤色友好。",
    useCase: "剧情人像、品牌广告",
  },
  {
    id: "spherical_prime",
    label: "球形定焦",
    zhName: "现代球形定焦",
    shortTag: "spherical prime",
    profilePrompt:
      "modern spherical cinema prime lens, clean sharpness, neutral contrast, round bokeh, minimal flare",
    lensColor: "#3d3d3d",
    ringColor: "#9a9a9a",
    description: "干净锐利，中性对比，圆形焦外。",
    useCase: "通用叙事、商业产品",
  },
  {
    id: "anamorphic_classic",
    label: "变形宽银幕",
    zhName: "经典变形宽银幕",
    shortTag: "classic anamorphic",
    profilePrompt:
      "classic anamorphic cinema lens, oval bokeh, horizontal lens flares, widescreen cinematic character",
    lensColor: "#454545",
    ringColor: "#d0b070",
    anamorphic: true,
    description: "椭圆焦外与水平光斑，强烈宽银幕感。",
    useCase: "院线剧情、科幻、音乐 MV",
  },
  {
    id: "vintage_soft",
    label: "复古柔焦",
    zhName: "复古柔焦",
    shortTag: "vintage soft",
    profilePrompt:
      "vintage prime lens, slight highlight glow, softer edges, nostalgic filmic texture",
    lensColor: "#5a4838",
    ringColor: "#c4a882",
    description: "轻微光晕与软边，怀旧胶片质感。",
    useCase: "文艺片、回忆段落、肖像",
  },
  {
    id: "macro_closeup",
    label: "微距特写",
    zhName: "微距特写",
    shortTag: "macro close-up",
    profilePrompt:
      "macro prime lens, extremely shallow focus plane, creamy close-up bokeh, detail-rich rendering",
    lensColor: "#3a3a3a",
    ringColor: "#8ec5ff",
    description: "极浅景深，细节放大。",
    useCase: "产品特写、食物、微观",
  },
];

export const FOCAL_LENGTHS = [24, 35, 50, 85, 135] as const;
export const APERTURES = [1.4, 2, 2.8, 4, 5.6, 8] as const;

export const FOCAL_LENGTH_META: Record<
  number,
  { zhName: string; description: string; useCase: string }
> = {
  24: {
    zhName: "广角",
    description: "24mm 广角，环境感强烈",
    useCase: "风光、大场面、纪实",
  },
  35: {
    zhName: "小广角",
    description: "35mm 经典叙事焦段，接近人眼",
    useCase: "纪实、人物环境叙事",
  },
  50: {
    zhName: "标准",
    description: "50mm 标准，空间感自然",
    useCase: "人像、日常、街拍",
  },
  85: {
    zhName: "中长焦",
    description: "85mm 经典人像焦段",
    useCase: "特写人像、婚礼",
  },
  135: {
    zhName: "长焦",
    description: "135mm 电影专用长焦",
    useCase: "剧情特写、舞台",
  },
};

export const APERTURE_META: Record<
  number,
  { zhName: string; description: string; useCase: string }
> = {
  1.4: {
    zhName: "大光圈",
    description: "f/1.4 强烈虚化，电影感十足",
    useCase: "夜景人像、暗光",
  },
  2: {
    zhName: "大光圈",
    description: "f/2 柔和虚化与充足锐度",
    useCase: "人像、文艺日常",
  },
  2.8: {
    zhName: "大光圈",
    description: "f/2.8 景深适中、虚化柔和",
    useCase: "群像、叙事",
  },
  4: {
    zhName: "中光圈",
    description: "f/4 主体清晰，背景有轻微虚化",
    useCase: "群像、婚礼、电视剧",
  },
  5.6: {
    zhName: "中光圈",
    description: "f/5.6 背景可辨，环境感强",
    useCase: "纪实、日常、小品",
  },
  8: {
    zhName: "小光圈",
    description: "f/8 画质最佳区，前后皆清晰",
    useCase: "风光、建筑、全景",
  },
};

export const DEFAULT_CAMERA_CONTROL: CameraControlOptions = {
  enabled: false,
  camera: CAMERA_PROFILES[0]!.id,
  lens: LENS_PROFILES[0]!.id,
  focalLength: 50,
  aperture: 2.8,
};

/** Common online cinematography / photography look packs. */
export type CameraPreset = {
  id: string;
  label: string;
  hint: string;
  control: Omit<CameraControlOptions, "enabled">;
};

export const CAMERA_PRESETS: CameraPreset[] = [
  {
    id: "portrait",
    label: "人像特写",
    hint: "85mm · f/1.4 浅景深",
    control: {
      camera: "arri_alexa_mini_lf",
      lens: "arri_signature_prime",
      focalLength: 85,
      aperture: 1.4,
    },
  },
  {
    id: "narrative",
    label: "电影叙事",
    hint: "35mm · f/2.8 环境叙事",
    control: {
      camera: "arri_alexa_mini_lf",
      lens: "spherical_prime",
      focalLength: 35,
      aperture: 2.8,
    },
  },
  {
    id: "anamorphic",
    label: "宽银幕",
    hint: "50mm 变形镜头",
    control: {
      camera: "sony_venice_2",
      lens: "anamorphic_classic",
      focalLength: 50,
      aperture: 2.8,
    },
  },
  {
    id: "landscape",
    label: "风光全景",
    hint: "24mm · f/8 大景深",
    control: {
      camera: "sony_venice_2",
      lens: "spherical_prime",
      focalLength: 24,
      aperture: 8,
    },
  },
  {
    id: "action",
    label: "动作跟拍",
    hint: "24mm 全局快门",
    control: {
      camera: "red_komodo_6k",
      lens: "spherical_prime",
      focalLength: 24,
      aperture: 2.8,
    },
  },
  {
    id: "macro",
    label: "产品微距",
    hint: "135mm 微距",
    control: {
      camera: "canon_c500_mk2",
      lens: "macro_closeup",
      focalLength: 135,
      aperture: 4,
    },
  },
  {
    id: "vintage",
    label: "复古柔焦",
    hint: "50mm 怀旧光晕",
    control: {
      camera: "canon_c500_mk2",
      lens: "vintage_soft",
      focalLength: 50,
      aperture: 2,
    },
  },
  {
    id: "vlog",
    label: "生活纪实",
    hint: "手机电影模式",
    control: {
      camera: "iphone_pro_cinema",
      lens: "spherical_prime",
      focalLength: 35,
      aperture: 2.8,
    },
  },
];

export function matchCameraPreset(
  control: CameraControlOptions,
): string | null {
  const hit = CAMERA_PRESETS.find(
    (preset) =>
      preset.control.camera === control.camera &&
      preset.control.lens === control.lens &&
      preset.control.focalLength === control.focalLength &&
      preset.control.aperture === control.aperture,
  );
  return hit?.id ?? null;
}

export function applyCameraPreset(presetId: string): CameraControlOptions {
  const preset =
    CAMERA_PRESETS.find((item) => item.id === presetId) ?? CAMERA_PRESETS[0]!;
  return {
    enabled: true,
    ...preset.control,
  };
}

export function cycleValue<T>(
  values: readonly T[],
  value: T,
  direction: -1 | 1,
): T {
  const index = values.indexOf(value);
  const next = Math.min(Math.max(index + direction, 0), values.length - 1);
  return values[next]!;
}

function describeFocalLength(mm: number): string {
  if (mm <= 28) {
    return `${mm}mm wide-angle perspective, strong environment context, exaggerated depth`;
  }
  if (mm <= 40) {
    return `${mm}mm slight-wide cinematic perspective, natural storytelling framing`;
  }
  if (mm <= 60) {
    return `${mm}mm standard perspective, close to human eye, neutral compression`;
  }
  if (mm <= 100) {
    return `${mm}mm short-telephoto portrait perspective, mild background compression, subject isolation`;
  }
  return `${mm}mm telephoto perspective, strong compression, dramatic subject isolation`;
}

function describeAperture(f: number): string {
  if (f <= 1.8) {
    return `shot at f/${f}, very shallow depth of field, smooth cinematic bokeh`;
  }
  if (f <= 2.8) {
    return `shot at f/${f}, shallow depth of field, soft background separation`;
  }
  if (f <= 5.6) {
    return `shot at f/${f}, balanced depth of field, background retains context`;
  }
  return `shot at f/${f}, wide depth of field, environment and subject both sharp`;
}

export function parseCameraControl(raw: unknown): CameraControlOptions {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_CAMERA_CONTROL };
  const obj = raw as Record<string, unknown>;
  const camera = String(obj.camera ?? DEFAULT_CAMERA_CONTROL.camera);
  const lens = String(obj.lens ?? DEFAULT_CAMERA_CONTROL.lens);
  const focal = Number(obj.focalLength);
  const aperture = Number(obj.aperture);
  return {
    enabled: Boolean(obj.enabled),
    camera: CAMERA_PROFILES.some((item) => item.id === camera)
      ? camera
      : DEFAULT_CAMERA_CONTROL.camera,
    lens: LENS_PROFILES.some((item) => item.id === lens)
      ? lens
      : DEFAULT_CAMERA_CONTROL.lens,
    focalLength: FOCAL_LENGTHS.includes(focal as (typeof FOCAL_LENGTHS)[number])
      ? focal
      : DEFAULT_CAMERA_CONTROL.focalLength,
    aperture: APERTURES.includes(aperture as (typeof APERTURES)[number])
      ? aperture
      : DEFAULT_CAMERA_CONTROL.aperture,
  };
}

/** Append optical direction when camera control is enabled. */
export function applyCameraPrompt(
  prompt: string,
  control?: CameraControlOptions | null,
): string {
  if (!control?.enabled) return prompt;
  const camera =
    CAMERA_PROFILES.find((item) => item.id === control.camera) ??
    CAMERA_PROFILES[0]!;
  const lens =
    LENS_PROFILES.find((item) => item.id === control.lens) ?? LENS_PROFILES[0]!;
  const cameraPrompt = [
    "the following parameters describe the virtual camera, lens, and exposure used to render this image — they are camera direction, NOT objects to add inside the frame; do not render any physical camera, lens, tripod, or photography equipment",
    camera.profilePrompt,
    lens.profilePrompt,
    describeFocalLength(control.focalLength),
    describeAperture(control.aperture),
    "keep subjects, scene, and action unchanged — apply these as optical and sensor characteristics only",
    `[camera: ${camera.shortTag} · lens: ${lens.shortTag} · ${control.focalLength}mm · f/${control.aperture}]`,
  ].join(", ");
  return prompt ? `${prompt}, ${cameraPrompt}` : cameraPrompt;
}
