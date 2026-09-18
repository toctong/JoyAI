/** Pick a video reference mode. One ref is omni; two or more is first/last. */
export function videoRefMode(
  refCount: number,
): "omni" | "first_last" | undefined {
  if (refCount >= 2) return "first_last";
  if (refCount === 1) return "omni";
  return undefined;
}
