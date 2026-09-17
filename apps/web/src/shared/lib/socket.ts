"use client";

import { io, type Socket } from "socket.io-client";
import { useAuthStore } from "./auth-store";
import { resolveApiBase } from "./api";

function resolveWsBase(): string {
  const fromEnv = process.env.NEXT_PUBLIC_WS_URL?.trim();
  if (fromEnv) {
    try {
      const u = new URL(fromEnv);
      if (typeof window !== "undefined") {
        const pageHost = window.location.hostname;
        if (
          pageHost &&
          pageHost !== "localhost" &&
          pageHost !== "127.0.0.1" &&
          (u.hostname === "localhost" || u.hostname === "127.0.0.1")
        ) {
          u.hostname = pageHost;
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

export function getJobsSocket(): Socket {
  const token = useAuthStore.getState().token;
  if (socket?.connected) return socket;

  socket?.disconnect();
  socket = io(`${resolveWsBase()}/jobs`, {
    auth: { token },
    transports: ["websocket", "polling"],
    autoConnect: true,
  });

  return socket;
}

export function disconnectJobsSocket() {
  socket?.disconnect();
  socket = null;
}
