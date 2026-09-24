/** Brand chrome — always local under `public/brand/`. */
export const JOYAI_BRAND = {
  /** Sidebar / compact mark (also used on login) */
  logo: "/brand/mirora-mark.png",
  /** @deprecated Prefer `logo` + text; kept for older call sites */
  logoFull: "/brand/mirora-logo.png",
  mascot: "/brand/mascot.png",
  heroBg: "/brand/hero-bg.png",
  avatar: "/brand/avatar.png",
  /** Mobile / legacy nav art (PNGs under public/brand). */
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
