import { cn } from "@/shared/lib/utils";

type Props = {
  className?: string;
  title?: string;
};

/** Masked SVG so fill follows currentColor. */
function SvgMaskIcon({
  src,
  className,
  title,
}: Props & { src: string }) {
  return (
    <span
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={cn("inline-block shrink-0 bg-current", className)}
      style={{
        width: "1em",
        height: "1em",
        WebkitMaskImage: `url(${src})`,
        maskImage: `url(${src})`,
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
      }}
    />
  );
}

/** Boxicons image-sparkle — /icons/image-gen.svg */
export function ImageGenIcon({ className, title }: Props) {
  return (
    <SvgMaskIcon
      src="/icons/image-gen.svg"
      className={className}
      title={title}
    />
  );
}

/** Remix Icon video-ai-line — /icons/video-gen.svg */
export function VideoGenIcon({ className, title }: Props) {
  return (
    <SvgMaskIcon
      src="/icons/video-gen.svg"
      className={className}
      title={title}
    />
  );
}
