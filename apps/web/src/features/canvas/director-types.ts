export type DirectorPanorama = {
  edgeId: string;
  sourceNodeId: string;
  imageUrl: string;
  fileName: string;
  projectionMode: "equirectangular" | "backdrop";
};

export type DirectorCapture = {
  dataUrl: string;
  fileName: string;
};

export type DirectorVideo = {
  blob: Blob;
  fileName: string;
  width: number;
  height: number;
  durationSeconds: number;
};
