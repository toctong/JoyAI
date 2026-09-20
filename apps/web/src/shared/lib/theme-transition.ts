/** Visible circular theme reveal — Telegram / Chrome VT style. */

type StartViewTransition = (update: () => void) => {
  ready: Promise<void>;
  finished: Promise<void>;
};

const DURATION = 580;
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function maxRadius(x: number, y: number) {
  return Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  );
}

/**
 * Sharp circular wipe from the toggle. Clear, not cartoon-soft.
 */
export async function runThemeReveal(opts: {
  next: "light" | "dark";
  origin: { x: number; y: number };
  apply: () => void;
}) {
  const doc = document as Document & {
    startViewTransition?: StartViewTransition;
  };
  const root = document.documentElement;

  if (!doc.startViewTransition || prefersReducedMotion()) {
    opts.apply();
    return;
  }

  const { x, y } = opts.origin;
  const radius = maxRadius(x, y);
  root.dataset.themeTransition =
    opts.next === "dark" ? "to-dark" : "to-light";

  try {
    const transition = doc.startViewTransition(opts.apply);
    await transition.ready;

    root.animate(
      {
        clipPath: [
          `circle(0px at ${x}px ${y}px)`,
          `circle(${radius}px at ${x}px ${y}px)`,
        ],
      },
      {
        duration: DURATION,
        easing: EASE,
        fill: "both",
        pseudoElement: "::view-transition-new(root)",
      },
    );

    await transition.finished;
  } catch {
    opts.apply();
  } finally {
    delete root.dataset.themeTransition;
  }
}
