import { NextResponse, type NextRequest } from "next/server";
import {
  getViewPreferenceFromCookieHeader,
  isDesktopOnlyPath,
  isMobilePath,
  shouldUseMobileShell,
  toDesktopPath,
  toMobilePath,
} from "@/shared/lib/device";

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
    const url = request.nextUrl.clone();
    url.pathname = toMobilePath(pathname);
    return NextResponse.redirect(url);
  }

  if (!wantMobile && onMobile) {
    const url = request.nextUrl.clone();
    url.pathname = toDesktopPath(pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
