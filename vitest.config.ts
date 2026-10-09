import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: [
        "lib/catalogue.ts",
        "lib/json-tools.ts",
        "lib/image-tools.ts",
        "lib/site.ts",
        "lib/image-compressor/formats.ts",
        "lib/image-compressor/geometry.ts",
        "lib/image-compressor/pixels.ts",
        "lib/image-compressor/pipeline.ts",
        "lib/image-compressor/quality.ts",
        "lib/image-compressor/settings.ts",
        "lib/image-compressor/ssim.ts",
      ],
      reporter: ["text", "html", "lcov"],
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100,
      },
    },
  },
})
