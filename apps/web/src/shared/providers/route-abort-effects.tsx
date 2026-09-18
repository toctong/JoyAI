"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { abortPendingGets } from "@/shared/lib/api";

/** 路由变化时取消可取消的进行中 GET，避免切页后堆满 Axios 等待。 */
export function RouteAbortEffects() {
  const pathname = usePathname();
  const ready = useRef(false);

  useEffect(() => {
    if (!ready.current) {
      ready.current = true;
      return;
    }
    abortPendingGets("route-change");
  }, [pathname]);

  return null;
}
