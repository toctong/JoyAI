"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  getViewPreferenceFromCookieHeader,
  isDesktopOnlyPath,
  isMobilePath,
  shouldUseMobileShell,
  toDesktopPath,
  toMobilePath,
} from "@/shared/lib/device";

/**
 * Client-side PC ↔ `/m` shell switch. Avoids Next middleware redirects, which
 * break behind Docker/Feiniu (relative Location → 500; wrong Host → localhost).
 */
export function ViewShellGate() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!pathname || isDesktopOnlyPath(pathname)) return;

    const wantMobile = shouldUseMobileShell({
      pathname,
      userAgent: navigator.userAgent,
      viewPref: getViewPreferenceFromCookieHeader(document.cookie),
    });
    const onMobile = isMobilePath(pathname);
    const search = window.location.search;

    if (wantMobile && !onMobile) {
      router.replace(`${toMobilePath(pathname)}${search}`);
      return;
    }
    if (!wantMobile && onMobile) {
      router.replace(`${toDesktopPath(pathname)}${search}`);
    }
  }, [pathname, router]);

  return null;
}
