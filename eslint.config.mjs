import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "**/* [2-9].*",
    // Other sessions' working copies of this repository.
    ".claude/**",
    // Whisper's engine and models, copied in before each build.
    "public/whisper/**",
    // The bridge's built files; its sources are linted.
    "bridge/dist/**",
  ]),
])

export default eslintConfig
