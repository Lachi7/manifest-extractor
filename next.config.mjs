import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // This folder is the app root even though stray lockfiles exist above it.
  outputFileTracingRoot: __dirname,
  webpack: (config) => {
    // pdfjs-dist optionally pulls in the node "canvas" package; we only use it
    // in the browser, so stub it out to keep the server bundle clean.
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default nextConfig;
