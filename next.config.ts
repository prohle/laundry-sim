import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server for the container image (task 5.5).
  output: "standalone",
};

export default nextConfig;
