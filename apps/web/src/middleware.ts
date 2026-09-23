import { NextResponse, type NextRequest } from "next/server";
import {
  getViewPreferenceFromCookieHeader,
  isDesktopOnlyPath,
  isMobilePath,
  shouldUseMobileShell,
  toDesktopPath,
  toMobilePath,
} from "@/shared/lib/device";

/**
 * Rebuild origin from proxy headers. Behind Docker nginx, Next listens on
 * 127.0.0.1:3002 — cloning `request.nextUrl` alone can redirect phones to
 * http://localhost:3002/m/... instead of the public host.
 */
function publicUrl(request: NextRequest, pathname: string): URL {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host =
    forwardedHost?.split(",")[0]?.trim() ||
    request.headers.get("host")?.trim() ||
    request.nextUrl.host;
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const proto = (
    forwardedProto?.split(",")[0]?.trim() ||
    request.nextUrl.protocol.replace(":", "") ||
    "http"
  ).replace(/:$/, "");
  const url = new URL(pathname, `${proto}://${host}`);
  url.search = request.nextUrl.search;
  return url;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/socket.io")
  ) {
    return NextResponse.next();
  }

  // Public static files (brand, inspire media, icons, …)
  if (
    /\.(?:png|jpg|jpeg|gif|webp|svg|ico|mp4|webm|woff2?|ttf|css|js|map|txt|xml|json)$/i.test(
      pathname,
    )
  ) {
    return NextResponse.next();
  }

  if (isDesktopOnlyPath(pathname)) {
    return NextResponse.next();
  }

  const ua = request.headers.get("user-agent");
  const viewPref = getViewPreferenceFromCookieHeader(
    request.headers.get("cookie"),
  );
  const wantMobile = shouldUseMobileShell({
    pathname,
    userAgent: ua,
    viewPref,
  });
  const onMobile = isMobilePath(pathname);

  if (wantMobile && !onMobile) {
    return NextResponse.redirect(publicUrl(request, toMobilePath(pathname)));
  }

  if (!wantMobile && onMobile) {
    return NextResponse.redirect(publicUrl(request, toDesktopPath(pathname)));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
