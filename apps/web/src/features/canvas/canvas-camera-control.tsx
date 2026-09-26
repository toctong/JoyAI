"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { Camera, ChevronDown, ChevronUp, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/shared/lib/utils";
import { staticAssetUrl } from "@/shared/lib/static-asset";
import {
  APERTURE_META,
  APERTURES,
  applyCameraPreset,
  CAMERA_PRESETS,
  CAMERA_PROFILES,
  cycleValue,
  DEFAULT_CAMERA_CONTROL,
  FOCAL_LENGTH_META,
  FOCAL_LENGTHS,
  LENS_PROFILES,
  matchCameraPreset,
  type CameraControlOptions,
  type CameraProfile,
  type LensProfile,
} from "./lib/camera-control";
import "./canvas-camera-control.css";

type Props = {
  value?: CameraControlOptions | null;
  onChange: (value: CameraControlOptions) => void;
  className?: string;
  /** Render panel body in-place (no popover chip). */
  embedded?: boolean;
  /** Controlled open state when not embedded. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Custom trigger; defaults to the chip button. */
  children?: ReactNode;
  title?: string;
};

const CAMERA_IDS = CAMERA_PROFILES.map((item) => item.id);
const LENS_IDS = LENS_PROFILES.map((item) => item.id);

export function CanvasCameraControl({
  value,
  onChange,
  className,
  embedded = false,
  open: openProp,
  onOpenChange,
  children,
  title = "运镜",
}: Props) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = openProp ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const control = value ?? DEFAULT_CAMERA_CONTROL;
  const camera =
    CAMERA_PROFILES.find((item) => item.id === control.camera) ??
    CAMERA_PROFILES[0]!;
  const lens =
    LENS_PROFILES.find((item) => item.id === control.lens) ?? LENS_PROFILES[0]!;
  const focalMeta = FOCAL_LENGTH_META[control.focalLength];
  const apertureMeta = APERTURE_META[control.aperture];
  const activePresetId = matchCameraPreset(control);

  function patch(next: Partial<CameraControlOptions>) {
    onChange({ ...control, ...next });
  }

  const body = (
    <div className="joy-camera-panel-body">
      <div className="joy-camera-presets">
        {CAMERA_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={cn(
              "joy-camera-preset",
              activePresetId === preset.id && control.enabled && "is-on",
            )}
            title={preset.hint}
            onClick={() => onChange(applyCameraPreset(preset.id))}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <TooltipProvider delayDuration={500}>
        <div className="joy-camera-columns">
          <SettingColumn
            label="相机"
            tooltipTitle={`${camera.zhName} · ${camera.label}`}
            tooltipDesc={camera.description}
            tooltipUseCase={camera.useCase}
            visual={<CameraVisual profile={camera} />}
            caption={camera.label}
            onPrevious={
              control.camera === CAMERA_IDS[0]
                ? undefined
                : () =>
                    patch({
                      camera: cycleValue(CAMERA_IDS, control.camera, -1),
                    })
            }
            onNext={
              control.camera === CAMERA_IDS[CAMERA_IDS.length - 1]
                ? undefined
                : () =>
                    patch({
                      camera: cycleValue(CAMERA_IDS, control.camera, 1),
                    })
            }
          />
          <SettingColumn
            separator
            label="镜头"
            tooltipTitle={`${lens.zhName} · ${lens.label}`}
            tooltipDesc={lens.description}
            tooltipUseCase={lens.useCase}
            visual={<LensVisual profile={lens} />}
            caption={lens.label}
            onPrevious={
              control.lens === LENS_IDS[0]
                ? undefined
                : () =>
                    patch({
                      lens: cycleValue(LENS_IDS, control.lens, -1),
                    })
            }
            onNext={
              control.lens === LENS_IDS[LENS_IDS.length - 1]
                ? undefined
                : () =>
                    patch({
                      lens: cycleValue(LENS_IDS, control.lens, 1),
                    })
            }
          />
          <SettingColumn
            separator
            label="焦距"
            tooltipTitle={`${control.focalLength}mm · ${focalMeta?.zhName ?? ""}`}
            tooltipDesc={focalMeta?.description}
            tooltipUseCase={focalMeta?.useCase}
            badge={focalMeta?.zhName}
            visual={
              <div className="joy-camera-number">
                <span className="joy-camera-number-value">
                  {control.focalLength}
                </span>
                <span className="joy-camera-number-unit">mm</span>
              </div>
            }
            caption="mm"
            onPrevious={
              control.focalLength === FOCAL_LENGTHS[0]
                ? undefined
                : () =>
                    patch({
                      focalLength: cycleValue(
                        FOCAL_LENGTHS,
                        control.focalLength as (typeof FOCAL_LENGTHS)[number],
                        -1,
                      ),
                    })
            }
            onNext={
              control.focalLength === FOCAL_LENGTHS[FOCAL_LENGTHS.length - 1]
                ? undefined
                : () =>
                    patch({
                      focalLength: cycleValue(
                        FOCAL_LENGTHS,
                        control.focalLength as (typeof FOCAL_LENGTHS)[number],
                        1,
                      ),
                    })
            }
          />
          <SettingColumn
            separator
            label="光圈"
            tooltipTitle={`f/${control.aperture} · ${apertureMeta?.zhName ?? ""}`}
            tooltipDesc={apertureMeta?.description}
            tooltipUseCase={apertureMeta?.useCase}
            badge={apertureMeta?.zhName}
            visual={
              <div className="joy-camera-aperture">
                <span className="joy-camera-aperture-prefix">f/</span>
                <span className="joy-camera-number-value">
                  {control.aperture}
                </span>
              </div>
            }
            caption={`f/${control.aperture}`}
            onPrevious={
              control.aperture === APERTURES[0]
                ? undefined
                : () =>
                    patch({
                      aperture: cycleValue(
                        APERTURES,
                        control.aperture as (typeof APERTURES)[number],
                        -1,
                      ),
                    })
            }
            onNext={
              control.aperture === APERTURES[APERTURES.length - 1]
                ? undefined
                : () =>
                    patch({
                      aperture: cycleValue(
                        APERTURES,
                        control.aperture as (typeof APERTURES)[number],
                        1,
                      ),
                    })
            }
          />
        </div>
      </TooltipProvider>

      <div className="joy-camera-panel-foot">
        <span
          className={cn(
            "joy-camera-panel-foot-label",
            control.enabled && "is-on",
          )}
        >
          {control.enabled ? "开启" : "关闭"}
        </span>
        <Switch
          checked={control.enabled}
          onCheckedChange={(enabled) => patch({ enabled })}
          aria-label="启用摄像机提示词"
        />
      </div>
    </div>
  );

  if (embedded) {
    return (
      <div
        className={cn("joy-camera-panel joy-camera-panel-embedded", className)}
        data-canvas-shortcuts-ignore
      >
        {body}
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children ?? (
          <button
            type="button"
            className={cn(
              "joy-chip-params-pill joy-camera-trigger",
              control.enabled && "is-on",
              className,
            )}
            aria-label="运镜控制"
            title="运镜控制"
          >
            <span className="joy-chip-params-seg">
              <Camera className="size-3.5 opacity-80" />
              {control.enabled
                ? `${control.focalLength}mm · f/${control.aperture}`
                : "运镜"}
            </span>
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={10}
        className="joy-camera-panel p-0"
        data-canvas-shortcuts-ignore
      >
        <div className="joy-camera-panel-head">
          <h2 className="joy-camera-panel-title">{title}</h2>
          <button
            type="button"
            className="joy-camera-panel-close"
            aria-label="关闭"
            onClick={() => setOpen(false)}
          >
            <X className="size-4" />
          </button>
        </div>
        {body}
      </PopoverContent>
    </Popover>
  );
}

type SettingColumnProps = {
  separator?: boolean;
  label: string;
  tooltipTitle: string;
  tooltipDesc?: string;
  tooltipUseCase?: string;
  badge?: ReactNode;
  visual: ReactNode;
  caption: string;
  onPrevious?: () => void;
  onNext?: () => void;
};

function SettingColumn({
  separator,
  label,
  tooltipTitle,
  tooltipDesc,
  tooltipUseCase,
  badge,
  visual,
  caption,
  onPrevious,
  onNext,
}: SettingColumnProps) {
  return (
    <div className={cn("joy-camera-col", separator && "has-sep")}>
      <button
        type="button"
        className="joy-camera-step"
        disabled={!onPrevious}
        aria-label={`上一项${label}`}
        onClick={onPrevious}
      >
            <ChevronUp className="size-4" />
      </button>

      <Tooltip>
        <TooltipTrigger asChild>
          <div className="joy-camera-card">
            <span className="joy-camera-card-label">{label}</span>
            <div className="joy-camera-card-visual">{visual}</div>
            {badge ? <span className="joy-camera-card-badge">{badge}</span> : null}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-64 space-y-1">
          <div className="font-medium">{tooltipTitle}</div>
          {tooltipDesc ? (
            <div className="text-xs opacity-80">{tooltipDesc}</div>
          ) : null}
          {tooltipUseCase ? (
            <div className="text-xs opacity-70">使用场景：{tooltipUseCase}</div>
          ) : null}
        </TooltipContent>
      </Tooltip>

      <button
        type="button"
        className="joy-camera-step"
        disabled={!onNext}
        aria-label={`下一项${label}`}
        onClick={onNext}
      >
        <ChevronDown className="size-4" />
      </button>
      <span className="joy-camera-caption">{caption}</span>
    </div>
  );
}

function CameraVisual({ profile }: { profile: CameraProfile }) {
  const src = staticAssetUrl(
    CAMERA_IMAGE[profile.id] ?? "/canvas/camera/arri.png",
  );
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className="joy-camera-photo"
      draggable={false}
    />
  );
}

function LensVisual({ profile }: { profile: LensProfile }) {
  const src = staticAssetUrl(
    LENS_IMAGE[profile.id] ?? "/canvas/camera/lens-signature.png",
  );
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className="joy-camera-photo"
      draggable={false}
    />
  );
}

const CAMERA_IMAGE: Record<string, string> = {
  arri_alexa_mini_lf: "/canvas/camera/arri.png",
  red_komodo_6k: "/canvas/camera/red.png",
  sony_venice_2: "/canvas/camera/sony.png",
  canon_c500_mk2: "/canvas/camera/canon.png",
  iphone_pro_cinema: "/canvas/camera/iphone.png",
};

const LENS_IMAGE: Record<string, string> = {
  arri_signature_prime: "/canvas/camera/lens-signature.png",
  spherical_prime: "/canvas/camera/lens-spherical.png",
  anamorphic_classic: "/canvas/camera/lens-anamorphic.png",
  vintage_soft: "/canvas/camera/lens-vintage.png",
  macro_closeup: "/canvas/camera/lens-macro.png",
};
