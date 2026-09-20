declare module "react-video-trim" {
  import type { CSSProperties, ReactElement } from "react";

  export type TrimRange = {
    startTime: number;
    endTime: number;
  };

  export type VideoTrimLabelsProp = {
    actions?: { trim?: string; cancel?: string };
    playback?: { play?: string; pause?: string };
    video?: { ariaLabel?: string };
    toolbar?: { ariaLabel?: string };
    filmstrip?: {
      loadingFrames?: (info: { loaded: number; total: number }) => string;
    };
    errors?: {
      decode?: string;
      sourceNotSupported?: string;
      load?: string;
    };
  };

  export function VideoTrim(props: {
    src: string | File | Blob;
    onTrim: (range: TrimRange) => void;
    onCancel?: () => void;
    labels?: VideoTrimLabelsProp;
    className?: string;
    style?: CSSProperties;
  }): ReactElement;

  export const defaultVideoTrimLabels: VideoTrimLabelsProp;
}

declare module "react-video-trim/style.css";
