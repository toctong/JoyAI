/** Mobile / desktop view detection (client shell gate + login home). */

export const VIEW_PREF_COOKIE = "joyai-view";

export type ViewPreference = "desktop" | "mobile" | "auto";

const MOBILE_UA =
  /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS|FxiOS|HarmonyOS|MicroMessenger/i;

/** Tablets (iPad) stay on desktop shell by default — canvas/manju need space. */
const TABLET_UA = /iPad|Tablet|PlayBook|Silk/i;

export function isMobileUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return false;
  if (TABLET_UA.test(ua)) return false;
  return MOBILE_UA.test(ua);
}

export function parseViewPreference(
  raw: string | null | undefined,
): ViewPreference {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "desktop" || v === "mobile") return v;
  return "auto";
}

export function getViewPreferenceFromCookieHeader(
  cookieHeader: string | null | undefined,
): ViewPreference {
  if (!cookieHeader) return "auto";
  const match = cookieHeader
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${VIEW_PREF_COOKIE}=`));
  if (!match) return "auto";
  return parseViewPreference(match.slice(VIEW_PREF_COOKIE.length + 1));
}

/** Paths that never enter the mobile shell. */
export function isDesktopOnlyPath(pathname: string): boolean {
  if (pathname === "/frame-rally" || pathname.startsWith("/frame-rally/"))
    return true;
  if (pathname === "/login" || pathname.startsWith("/login/")) return true;
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return true;
  // Full editors stay on desktop for now (mobile shows a guide page instead).
  if (/^\/canvas\/[^/]+/.test(pathname)) return true;
  if (/^\/manju\/[^/]+/.test(pathname)) return true;
  return false;
}

export function isMobilePath(pathname: string): boolean {
  return pathname === "/m" || pathname.startsWith("/m/");
}

/** `/inspire` → `/m/inspire`; `/` → `/m/inspire`; already `/m/...` unchanged. */
export function toMobilePath(pathname: string): string {
  if (isMobilePath(pathname)) return pathname === "/m" ? "/m/inspire" : pathname;
  if (pathname === "/" || pathname === "") return "/m/inspire";
  return `/m${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

/** `/m/inspire` → `/inspire`; `/m` → `/inspire`. */
export function toDesktopPath(pathname: string): string {
  if (!isMobilePath(pathname)) return pathname || "/inspire";
  const rest = pathname.replace(/^\/m/, "") || "/inspire";
  return rest.startsWith("/") ? rest : `/${rest}`;
}

/**
 * Decide whether this request should live under `/m`.
 * Preference cookie wins over UA when set to desktop|mobile.
 */
export function shouldUseMobileShell(input: {
  pathname: string;
  userAgent: string | null | undefined;
  viewPref: ViewPreference;
}): boolean {
  if (isDesktopOnlyPath(input.pathname)) return false;
  if (input.viewPref === "desktop") return false;
  if (input.viewPref === "mobile") return true;
  return isMobileUserAgent(input.userAgent);
}

export function homePathForDevice(input: {
  userAgent: string | null | undefined;
  viewPref?: ViewPreference;
}): string {
  const pref = input.viewPref ?? "auto";
  if (shouldUseMobileShell({ pathname: "/inspire", userAgent: input.userAgent, viewPref: pref })) {
    return "/m/inspire";
  }
  return "/inspire";
}
