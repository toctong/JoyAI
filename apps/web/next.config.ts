import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@joyai/shared", "react-video-trim"],
  serverExternalPackages: ["fabric"],
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "**" },
      { protocol: "https", hostname: "**" },
    ],
  },
};

export default nextConfig;
