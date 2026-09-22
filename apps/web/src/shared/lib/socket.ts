"use client";

import { io, type Socket } from "socket.io-client";
import { useAuthStore } from "./auth-store";
import { isLoopbackHost, resolveApiBase } from "./api";

function resolveWsBase(): string {
  const fromEnv = process.env.NEXT_PUBLIC_WS_URL?.trim();
  if (fromEnv) {
    if (fromEnv.startsWith("/")) {
      return typeof window !== "undefined" ? window.location.origin : "";
    }
    try {
      const u = new URL(fromEnv);
      if (typeof window !== "undefined") {
        const pageHost = window.location.hostname;
        if (
          pageHost &&
          !isLoopbackHost(pageHost) &&
          isLoopbackHost(u.hostname)
        ) {
          // Same origin → Next `/socket.io` rewrite (domain / HTTPS proxy).
          return window.location.origin;
        }
      }
      return u.toString().replace(/\/$/, "");
    } catch {
      return fromEnv.replace(/\/$/, "");
    }
  }
  return resolveApiBase().replace(/\/api\/?$/, "");
}

let socket: Socket | null = null;

/**
 * Singleton jobs socket. Never recreate while an instance exists — recreating
 * while `connected === false` (handshake / brief drop) used to drop all
 * listeners and leave canvas nodes stuck in "生成中".
 */
export function getJobsSocket(): Socket {
  const token = useAuthStore.getState().token;

  if (socket) {
    const auth = socket.auth as { token?: string } | undefined;
    if (auth?.token !== token) {
      socket.auth = { token };
    }
    if (!socket.connected) {
      socket.connect();
    }
    return socket;
  }

  socket = io(`${resolveWsBase()}/jobs`, {
    auth: { token },
    transports: ["websocket", "polling"],
    autoConnect: true,
    reconnection: true,
  });

  return socket;
}

export function disconnectJobsSocket() {
  socket?.disconnect();
  socket = null;
}
