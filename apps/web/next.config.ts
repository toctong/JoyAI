import type { NextConfig } from "next";
import path from "node:path";

/** Nest inside the same container (Docker) or on the host (local `pnpm` / Next). */
const apiProxyTarget =
  process.env.JOYAI_API_PROXY_TARGET?.replace(/\/$/, "") ||
  "http://127.0.0.1:3001";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  transpilePackages: ["@joyai/shared", "react-video-trim"],
  serverExternalPackages: ["fabric"],
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "**" },
      { protocol: "https", hostname: "**" },
    ],
  },
  // Local / non-Docker: browser → Next → Nest. In the production image,
  // container nginx owns /api and /socket.io (WebSocket-safe); these rewrites
  // remain for `next dev` / standalone without nginx.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiProxyTarget}/api/:path*`,
      },
      {
        source: "/socket.io/:path*",
        destination: `${apiProxyTarget}/socket.io/:path*`,
      },
    ];
  },
};

export default nextConfig;
