/**
 * Abort download + free decoder for a media element (video / audio).
 * Call on unmount, route leave, hover end, or dialog close.
 *
 * Do NOT removeChild React-managed <source> nodes — that fights React/Plyr
 * and throws NotFoundError: removeChild.
 */
export function releaseHtmlMedia(
  el: HTMLMediaElement | null | undefined,
): void {
  if (!el) return;
  try {
    el.pause();
  } catch {
    /* ignore */
  }
  try {
    el.removeAttribute("src");
    el.removeAttribute("poster");
    // Clear <source> via empty src, not removeChild (React owns those nodes).
    const sources = el.querySelectorAll("source");
    sources.forEach((s) => {
      try {
        s.removeAttribute("src");
      } catch {
        /* ignore */
      }
    });
    el.load();
  } catch {
    /* ignore */
  }
}
