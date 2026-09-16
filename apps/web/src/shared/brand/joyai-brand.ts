/** Brand chrome — all assets served from `public/brand/` (no remote URLs). */
export const JOYAI_BRAND = {
  /** Sidebar / compact mark */
  logo: "/brand/mirora-mark.png",
  /** Full wordmark for login etc. */
  logoFull: "/brand/mirora-logo.png",
  mascot: "/brand/mascot.png",
  heroBg: "/brand/hero-bg.png",
  nav: {
    inspire: "/brand/nav-inspire.png",
    studio: "/brand/nav-studio.png",
    canvas: "/brand/nav-canvas.png",
    assets: "/brand/nav-assets.png",
  },
  /** @deprecated prefer top-level keys; kept for older call sites */
  remote: {
    logo: "/brand/mirora-mark.png",
    logoFull: "/brand/mirora-logo.png",
    mascot: "/brand/mascot.png",
    heroBg: "/brand/hero-bg.png",
    navInspire: "/brand/nav-inspire.png",
    navStudio: "/brand/nav-studio.png",
    navCanvas: "/brand/nav-canvas.png",
    navAssets: "/brand/nav-assets.png",
    avatar: "/brand/avatar.png",
  },
} as const;
