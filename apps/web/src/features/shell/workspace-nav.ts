/** Shared canvas + manju list entry (one rail item, tabs inside). */

export type WorkspaceMode = "canvas" | "manju";

const STORAGE_KEY = "joyai.workspace.mode";

export function isWorkspacePath(pathname: string) {
  return (
    pathname === "/canvas" ||
    pathname.startsWith("/canvas/") ||
    pathname === "/manju" ||
    pathname.startsWith("/manju/")
  );
}

export function workspaceModeFromPath(pathname: string): WorkspaceMode | null {
  if (pathname === "/manju" || pathname.startsWith("/manju/")) return "manju";
  if (pathname === "/canvas" || pathname.startsWith("/canvas/")) return "canvas";
  return null;
}

export function readWorkspaceMode(): WorkspaceMode {
  if (typeof window === "undefined") return "canvas";
  try {
    return localStorage.getItem(STORAGE_KEY) === "manju" ? "manju" : "canvas";
  } catch {
    return "canvas";
  }
}

export function writeWorkspaceMode(mode: WorkspaceMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function workspaceListHref(mode: WorkspaceMode) {
  return mode === "manju" ? "/manju" : "/canvas";
}
