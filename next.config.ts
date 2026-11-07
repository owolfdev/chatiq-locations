import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Mapper Process photos sends up to 8 images as FormData
  experimental: {
    serverActions: {
      bodySizeLimit: "24mb",
    },
  },
};

export default nextConfig;
