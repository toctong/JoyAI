import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@joyai/shared"],
  serverExternalPackages: ["fabric"],
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "**" },
      { protocol: "https", hostname: "**" },
    ],
  },
};

export default nextConfig;
