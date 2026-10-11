import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["benchmarks/**/*.benchmark.ts"],
    testTimeout: 3_600_000,
  },
})
