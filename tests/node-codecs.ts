import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

/** Make the browser codec modules usable in Node for tests and benchmarks. */
export function installNodeCodecShims() {
  // As in a browser, the fields are getters on the prototype, so spreading an
  // ImageData copies nothing. Code that relies on a spread fails here too.
  globalThis.ImageData ??= class ImageData {
    #data: Uint8ClampedArray
    #width: number
    #height: number
    constructor(data: Uint8ClampedArray, width: number, height: number) {
      this.#data = data
      this.#width = width
      this.#height = height
    }
    get data() {
      return this.#data
    }
    get width() {
      return this.#width
    }
    get height() {
      return this.#height
    }
    get colorSpace() {
      return "srgb" as const
    }
  } as unknown as typeof globalThis.ImageData
  const original = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      input instanceof URL ? input : new URL(String(input), "file:///")
    if (url.protocol === "file:")
      return new Response(await readFile(fileURLToPath(url)), {
        headers: { "Content-Type": "application/wasm" },
      })
    return original(input, init)
  }) as typeof fetch
}
