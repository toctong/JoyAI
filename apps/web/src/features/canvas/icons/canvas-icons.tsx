import { cn } from "@/shared/lib/utils";

type IconProps = {
  className?: string;
  title?: string;
};

const base = {
  viewBox: "0 0 24 24",
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
};

/**
 * Canvas chrome icons — thin line art with rounded caps,
 * aligned to product-style refs (photo frame + sparkle language).
 */
export function CanvasIconImage({ className, title }: IconProps) {
  return (
    <svg {...base} className={cn("size-[18px]", className)}>
      {title ? <title>{title}</title> : null}
      {/* rounded photo frame — matches product AI-image glyph */}
      <rect x="3.75" y="5.25" width="14" height="13" rx="2.5" />
      {/* sun / moon */}
      <circle cx="8.1" cy="9.15" r="1.25" />
      {/* soft hills */}
      <path d="M5.5 15.4c1.35-1.85 2.55-2.85 3.95-2.85 1.15 0 1.95.65 3.05 1.95.85 1 1.55 1.55 2.4 1.55.5 0 1.05-.2 1.7-.7" />
      {/* AI sparkle (4-point) */}
      <path d="M19.35 3.25l.62 1.72 1.72.62-1.72.62-.62 1.72-.62-1.72-1.72-.62 1.72-.62z" />
    </svg>
  );
}

export function CanvasIconText({ className, title }: IconProps) {
  return (
    <svg {...base} className={cn("size-[18px]", className)}>
      {title ? <title>{title}</title> : null}
      <path d="M6 6.5h12" />
      <path d="M12 6.5v11" />
      <path d="M9 17.5h6" />
    </svg>
  );
}

export function CanvasIconVideo({ className, title }: IconProps) {
  return (
    <svg {...base} className={cn("size-[18px]", className)}>
      {title ? <title>{title}</title> : null}
      <rect x="3.5" y="6" width="12.5" height="12" rx="2.25" />
      <path d="M16 10.2l4.2-2.4v8.4L16 13.8" />
      <path d="M19.2 3.4l.55 1.55 1.55.55-1.55.55-.55 1.55-.55-1.55-1.55-.55 1.55-.55z" />
    </svg>
  );
}

export function CanvasIconPrompt({ className, title }: IconProps) {
  return (
    <svg {...base} className={cn("size-[18px]", className)}>
      {title ? <title>{title}</title> : null}
      <path d="M6.5 7.25h8.5c1.5 0 2.75 1.2 2.75 2.7v2.1c0 1.5-1.25 2.7-2.75 2.7H11l-3.2 2.55V14.75H6.5c-1.5 0-2.75-1.2-2.75-2.7v-2.1c0-1.5 1.25-2.7 2.75-2.7z" />
      <path d="M8.4 10.15h5.6" />
      <path d="M8.4 12.35h3.6" />
      <path d="M19.2 3.4l.55 1.55 1.55.55-1.55.55-.55 1.55-.55-1.55-1.55-.55 1.55-.55z" />
    </svg>
  );
}

export function CanvasIconUpload({ className, title }: IconProps) {
  return (
    <svg {...base} className={cn("size-[18px]", className)}>
      {title ? <title>{title}</title> : null}
      <path d="M12 14.5V5.75" />
      <path d="M8.75 8.5L12 5.25l3.25 3.25" />
      <path d="M5.5 15.5v1.25c0 1.1.9 2 2 2h9c1.1 0 2-.9 2-2V15.5" />
    </svg>
  );
}

export function CanvasIconSelect({ className, title }: IconProps) {
  return (
    <svg {...base} className={cn("size-[18px]", className)}>
      {title ? <title>{title}</title> : null}
      <path d="M5.5 4.5l4.2 14.2 2.35-5.15L17.5 11z" />
    </svg>
  );
}

export function CanvasIconHand({ className, title }: IconProps) {
  return (
    <svg {...base} className={cn("size-[18px]", className)}>
      {title ? <title>{title}</title> : null}
      <path d="M8.2 11.2V7.1a1.15 1.15 0 012.3 0v4.1" />
      <path d="M10.5 11.3V5.85a1.15 1.15 0 012.3 0V11.2" />
      <path d="M12.8 11.15V6.9a1.15 1.15 0 012.3 0v5.6" />
      <path d="M15.1 11.8v-.7a1.15 1.15 0 012.3 0v3.15c0 2.55-1.85 4.35-4.55 4.35h-.55c-2.2 0-3.55-.85-4.55-2.35L6.2 13.4a1.2 1.2 0 011.95-1.4l1.05 1.45" />
    </svg>
  );
}

export function CanvasIconFit({ className, title }: IconProps) {
  return (
    <svg {...base} className={cn("size-[18px]", className)}>
      {title ? <title>{title}</title> : null}
      <path d="M4.5 9V5.5H8" />
      <path d="M19.5 9V5.5H16" />
      <path d="M4.5 15v3.5H8" />
      <path d="M19.5 15v3.5H16" />
    </svg>
  );
}

export function CanvasIconMinimap({ className, title }: IconProps) {
  return (
    <svg {...base} className={cn("size-[18px]", className)}>
      {title ? <title>{title}</title> : null}
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.25" />
      <rect x="12.5" y="11" width="5.5" height="5" rx="0.75" />
      <path d="M6 14.5l2.4-3 1.8 2.1 2.2-2.9" />
    </svg>
  );
}

export function CanvasIconSnap({ className, title }: IconProps) {
  return (
    <svg {...base} className={cn("size-[18px]", className)}>
      {title ? <title>{title}</title> : null}
      <path d="M8 5.5h8v4.2c0 2.35-1.7 4.15-4 4.15S8 12.05 8 9.7V5.5z" />
      <path d="M12 13.85V18.5" />
      <path d="M9.5 18.5h5" />
      <path d="M8 8.25H5.75" />
      <path d="M18.25 8.25H16" />
    </svg>
  );
}

export function CanvasIconGrid({ className, title }: IconProps) {
  return (
    <svg {...base} className={cn("size-[18px]", className)}>
      {title ? <title>{title}</title> : null}
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M4 10h16" />
      <path d="M4 16h16" />
      <path d="M10 4v16" />
      <path d="M16 4v16" />
    </svg>
  );
}

export function CanvasIconShortcuts({ className, title }: IconProps) {
  return (
    <svg {...base} className={cn("size-[18px]", className)}>
      {title ? <title>{title}</title> : null}
      <rect x="3.5" y="6.5" width="17" height="11" rx="2.25" />
      <path d="M7 11h1.2" />
      <path d="M10.2 11h1.2" />
      <path d="M13.4 11h1.2" />
      <path d="M16.6 11H17.5" />
      <path d="M8.5 14h7" />
    </svg>
  );
}

export function CanvasIconUndo({ className, title }: IconProps) {
  return (
    <svg {...base} className={cn("size-[18px]", className)}>
      {title ? <title>{title}</title> : null}
      <path d="M8.5 8.25H5.75V5.5" />
      <path d="M5.9 8.25A7 7 0 1112 19.25" />
    </svg>
  );
}

export function CanvasIconRedo({ className, title }: IconProps) {
  return (
    <svg {...base} className={cn("size-[18px]", className)}>
      {title ? <title>{title}</title> : null}
      <path d="M15.5 8.25h2.75V5.5" />
      <path d="M18.1 8.25A7 7 0 1012 19.25" />
    </svg>
  );
}

export function CanvasIconZoomIn({ className, title }: IconProps) {
  return (
    <svg {...base} className={cn("size-[18px]", className)}>
      {title ? <title>{title}</title> : null}
      <circle cx="10.5" cy="10.5" r="5.75" />
      <path d="M10.5 8v5" />
      <path d="M8 10.5h5" />
      <path d="M15 15l3.5 3.5" />
    </svg>
  );
}

export function CanvasIconZoomOut({ className, title }: IconProps) {
  return (
    <svg {...base} className={cn("size-[18px]", className)}>
      {title ? <title>{title}</title> : null}
      <circle cx="10.5" cy="10.5" r="5.75" />
      <path d="M8 10.5h5" />
      <path d="M15 15l3.5 3.5" />
    </svg>
  );
}

export function CanvasIconSparkles({ className, title }: IconProps) {
  return (
    <svg {...base} className={cn("size-[18px]", className)}>
      {title ? <title>{title}</title> : null}
      <path d="M12 3.5l1.15 3.25L16.4 7.9l-3.25 1.15L12 12.3l-1.15-3.25L7.6 7.9l3.25-1.15z" />
      <path d="M18.2 12.4l.55 1.55 1.55.55-1.55.55-.55 1.55-.55-1.55-1.55-.55 1.55-.55z" />
      <path d="M6.2 13.6l.45 1.25 1.25.45-1.25.45-.45 1.25-.45-1.25-1.25-.45 1.25-.45z" />
    </svg>
  );
}

export function CanvasIconOutpaint({ className, title }: IconProps) {
  return (
    <svg {...base} className={cn("size-[18px]", className)}>
      {title ? <title>{title}</title> : null}
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
      <path d="M4.5 9.5V4.5H9.5" />
      <path d="M19.5 9.5V4.5H14.5" />
      <path d="M4.5 14.5v5H9.5" />
      <path d="M19.5 14.5v5H14.5" />
    </svg>
  );
}

export function CanvasIconInpaint({ className, title }: IconProps) {
  return (
    <svg {...base} className={cn("size-[18px]", className)}>
      {title ? <title>{title}</title> : null}
      <rect x="4" y="5" width="16" height="14" rx="2.25" />
      <rect x="8.5" y="9" width="7" height="6" rx="1" strokeDasharray="2 1.5" />
      <path d="M18.5 3.6l.4 1.15 1.15.4-1.15.4-.4 1.15-.4-1.15-1.15-.4 1.15-.4z" />
    </svg>
  );
}
