import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  poweredByHeader: false,
  reactStrictMode: true,
  turbopack: {
    resolveAlias: {
      // MuPDF asks for these only in Node; the browser build gets an empty stand-in.
      module: { browser: "./lib/pdf-merger/node-stub.ts" },
      "node:fs": { browser: "./lib/pdf-merger/node-stub.ts" },
    },
  },
}

export default nextConfig
