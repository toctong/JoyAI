"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ManjuHeaderSlotsProvider,
} from "../manju-header-slots";
import { useManjuStore } from "../manju-store";
import { ManjuAssetSidebar } from "./manju-asset-sidebar";
import { ManjuStudioHeader } from "./manju-studio-header";
import {
  ManjuStudioProvider,
  useManjuStudio,
} from "./manju-studio-provider";
import {
  legacyQueryToStudioPath,
  type ManjuStudioSection,
} from "./manju-studio-routes";
import "../manju-chrome.css";
import "./studio-chrome.css";

const SIDEBAR_KEY = "manju-studio-sidebar-collapsed";

function sectionFromPathname(
  pathname: string,
  projectId: string,
): { section: ManjuStudioSection; epId: string | null } {
  const base = `/manju/${projectId}`;
  if (pathname === base || pathname === `${base}/`) {
    return { section: "overview", epId: null };
  }
  if (pathname.startsWith(`${base}/source`)) {
    return { section: "source", epId: null };
  }
  if (pathname.startsWith(`${base}/characters`)) {
    return { section: "characters", epId: null };
  }
  if (pathname.startsWith(`${base}/scenes`)) {
    return { section: "scenes", epId: null };
  }
  if (pathname.startsWith(`${base}/props`)) {
    return { section: "props", epId: null };
  }
  if (pathname.startsWith(`${base}/settings`)) {
    return { section: "settings", epId: null };
  }
  if (pathname.startsWith(`${base}/preview`)) {
    return { section: "preview", epId: null };
  }
  const epMatch = pathname.match(
    new RegExp(`^/manju/${escapeRegExp(projectId)}/episodes/([^/]+)`),
  );
  if (epMatch?.[1]) {
    return { section: "episode", epId: epMatch[1] };
  }
  if (pathname.startsWith(`${base}/episodes`)) {
    return { section: "episode", epId: null };
  }
  return { section: "overview", epId: null };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function ManjuStudioLayout({
  projectId,
  children,
}: {
  projectId: string;
  children: React.ReactNode;
}) {
  return (
    <ManjuHeaderSlotsProvider>
      <ManjuStudioProvider projectId={projectId}>
        <ManjuStudioShell projectId={projectId}>{children}</ManjuStudioShell>
      </ManjuStudioProvider>
    </ManjuHeaderSlotsProvider>
  );
}

function ManjuStudioShell({
  projectId,
  children,
}: {
  projectId: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { project, saving, analyzing } = useManjuStudio();
  const updateProject = useManjuStore((s) => s.updateProject);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.manjuChrome = "";
    return () => {
      delete document.documentElement.dataset.manjuChrome;
    };
  }, []);

  useEffect(() => {
    try {
      setSidebarCollapsed(localStorage.getItem(SIDEBAR_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const next = legacyQueryToStudioPath(projectId, searchParams);
    if (!next) return;
    const current = `${pathname}${searchParams.toString() ? `?${searchParams}` : ""}`;
    if (current === next || pathname === next) {
      // Still strip legacy query if path already matches target without query
      if (searchParams.get("step") || searchParams.get("panel")) {
        router.replace(next);
      }
      return;
    }
    router.replace(next);
  }, [pathname, projectId, router, searchParams]);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const { section, epId } = useMemo(
    () => sectionFromPathname(pathname, projectId),
    [pathname, projectId],
  );

  return (
    <div
      className={
        sidebarCollapsed
          ? "manju-studio manju-workbench manju-studio--sidebar-collapsed"
          : "manju-studio manju-workbench"
      }
    >
      <ManjuStudioHeader
        project={project}
        saving={saving}
        analyzing={analyzing}
        onTitleChange={(title) => updateProject(projectId, { title })}
      />

      <div className="manju-studio__body">
        <div className="manju-studio__sidebar">
          <ManjuAssetSidebar
            projectId={projectId}
            project={project}
            collapsed={sidebarCollapsed}
            onToggleCollapse={toggleSidebar}
            section={section}
            activeEpId={epId}
          />
        </div>

        <section className="manju-studio__main">
          <div className="manju-studio__main-scroll">{children}</div>
        </section>
      </div>
    </div>
  );
}
