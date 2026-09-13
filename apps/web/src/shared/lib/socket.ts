"use client";

import { io, type Socket } from "socket.io-client";
import { useAuthStore } from "./auth-store";

const WS_BASE =
  process.env.NEXT_PUBLIC_WS_URL ||
  (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(
    /\/api\/?$/,
    "",
  );

let socket: Socket | null = null;

export function getJobsSocket(): Socket {
  const token = useAuthStore.getState().token;
  if (socket?.connected) return socket;

  socket?.disconnect();
  socket = io(`${WS_BASE}/jobs`, {
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
