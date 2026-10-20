/**
 * RNNoise, served by the site itself (`app/rnnoise/[version]/[file]/route.ts`)
 * from the package it comes in, rather than bundled: at 4.8 MB (its model
 * and WebAssembly are inside the one file) it would add a quarter to what
 * every visitor saves for working offline, and only some take noise away.
 * The service worker keeps it the first time it is used. Its folder is
 * named for its version, so a kept copy is never out of date.
 */

/** The package's version, which names the folder. */
export const RNNOISE_PACKAGE = "@shiguredo/rnnoise-wasm"
export const RNNOISE_VERSION = "2025.1.5"

/** Where it is served from. */
export const RNNOISE_URL = `/rnnoise/${RNNOISE_VERSION}/rnnoise.js`

/** The files served, by the name they are served under. */
export const RNNOISE_FILES: Record<string, string> = {
  "rnnoise.js": `${RNNOISE_PACKAGE}/dist/rnnoise.js`,
}
