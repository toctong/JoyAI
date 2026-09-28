"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dayjs from "dayjs";
import { api } from "@/shared/lib/api";
import { cn } from "@/shared/lib/utils";
import { ProjectCover } from "@/features/canvas/project-cover";
import {
  type WorkspaceMode,
  workspaceListHref,
  writeWorkspaceMode,
} from "@/features/shell/workspace-nav";
import "@/features/canvas/project-library.css";
import "./inspire-recent-projects.css";

type RecentProject = {
  id: string;
  title: string;
  coverUrl: string | null;
  updatedAt: string;
};

const TABS: { id: WorkspaceMode; label: string }[] = [
  { id: "canvas", label: "画布" },
  { id: "manju", label: "漫剧" },
];

const PREVIEW_COUNT = 6;

function formatEditedAt(value: string) {
  return dayjs(value).format("YYYY-MM-DD");
}

function projectHref(mode: WorkspaceMode, id: string) {
  return mode === "manju" ? `/manju/${id}` : `/canvas/${id}`;
}

export function InspireRecentProjects() {
  const router = useRouter();
  const [tab, setTab] = useState<WorkspaceMode>("canvas");
  const [projects, setProjects] = useState<RecentProject[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (mode: WorkspaceMode) => {
    setLoading(true);
    try {
      const path =
        mode === "manju" ? "/manju/projects" : "/canvas/projects";
      const rows = await api<RecentProject[]>(path);
      setProjects(Array.isArray(rows) ? rows.slice(0, PREVIEW_COUNT) : []);
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(tab);
  }, [tab, load]);

  function switchTab(mode: WorkspaceMode) {
    setTab(mode);
    writeWorkspaceMode(mode);
  }

  const listHref = workspaceListHref(tab);
  const emptyLabel =
    tab === "manju" ? "还没有漫剧项目" : "还没有画布项目";

  return (
    <section className="joy-inspire-recent" aria-label="最近项目">
      <div className="joy-inspire-recent-head">
        <h2 className="joy-inspire-recent-title">最近项目</h2>
        <div
          className="joy-inspire-recent-tabs"
          role="tablist"
          aria-label="项目类型"
        >
          {TABS.map((t) => {
            const on = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={on}
                className={cn(
                  "joy-inspire-recent-tab",
                  on && "is-on",
                )}
                onClick={() => switchTab(t.id)}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <Link
          href={listHref}
          className="joy-inspire-recent-all"
          onClick={() => writeWorkspaceMode(tab)}
        >
          全部项目
        </Link>
      </div>

      {loading ? (
        <div className="joy-inspire-recent-grid" aria-busy>
          {Array.from({ length: PREVIEW_COUNT }, (_, i) => (
            <div key={i} className="joy-inspire-recent-skel" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="joy-inspire-recent-empty">
          <p>{emptyLabel}</p>
          <Link
            href={listHref}
            className="joy-inspire-recent-empty-link"
            onClick={() => writeWorkspaceMode(tab)}
          >
            去新建
          </Link>
        </div>
      ) : (
        <div className="joy-inspire-recent-grid">
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              className="joy-inspire-recent-card"
              onClick={() => {
                writeWorkspaceMode(tab);
                router.push(projectHref(tab, project.id));
              }}
            >
              <div className="joy-inspire-recent-media">
                <ProjectCover url={project.coverUrl} showVideoMark={false} />
              </div>
              <div className="joy-inspire-recent-meta">
                <p className="joy-inspire-recent-name">{project.title}</p>
                <p className="joy-inspire-recent-sub">
                  {formatEditedAt(project.updatedAt)}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
