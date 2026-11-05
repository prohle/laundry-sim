import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Turbopack (default in Next.js 16) — alias away Node-only packages so they
  // are not bundled for the browser. The segmentation worker uses the WASM /
  // WebGPU backends; onnxruntime-node is only needed server-side.
  turbopack: {
    resolveAlias: {
      // These Node-specific modules must not be bundled for the browser.
      "onnxruntime-node": { browser: false },
      sharp: { browser: false },
    },
  },
};

export default nextConfig;
