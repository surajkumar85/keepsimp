export const DEFAULT_PATTERN = "{name}-{width}x{height}"
export const nameTokens = [
  "name",
  "width",
  "height",
  "format",
  "index",
  "preset",
] as const
export type NameToken = (typeof nameTokens)[number]

export interface NameValues {
  /** Original file name, with or without its extension. */
  name: string
  width: number
  height: number
  /** Output extension without the dot, e.g. "jpg". */
  format: string
  /** 1-based position in the batch. */
  index: number
  preset: string
}

const baseName = (name: string) => name.replace(/\.[^.]*$/, "")

/** Keep letters, digits, dot, dash and underscore; everything else becomes a dash. */
export function safeSegment(value: string) {
  return value
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
}

/** Tokens in a pattern that the resizer does not know. */
export function unknownTokens(pattern: string) {
  return [...pattern.matchAll(/\{([^{}]*)\}/g)]
    .map((match) => match[1])
    .filter((token) => !(nameTokens as readonly string[]).includes(token))
}

/** Build a safe file name (with extension) from a pattern such as `{name}-{width}x{height}`. */
export function fileName(pattern: string, values: NameValues) {
  const filled = (pattern.trim() || DEFAULT_PATTERN).replace(
    /\{([^{}]*)\}/g,
    (whole, token: string) => {
      switch (token) {
        case "name":
          return baseName(values.name)
        case "width":
          return String(values.width)
        case "height":
          return String(values.height)
        case "format":
          return values.format
        case "index":
          return String(values.index).padStart(2, "0")
        case "preset":
          return values.preset
        default:
          return whole
      }
    }
  )
  const stem = safeSegment(filled).slice(0, 120) || "image"
  return `${stem}.${values.format}`
}

/** Make every name in a batch unique by adding -2, -3… before the extension. */
export function uniqueNames(names: string[]) {
  const seen = new Map<string, number>()
  return names.map((name) => {
    const key = name.toLowerCase()
    const count = (seen.get(key) ?? 0) + 1
    seen.set(key, count)
    if (count === 1) return name
    const dot = name.lastIndexOf(".")
    const unique = `${name.slice(0, dot)}-${count}${name.slice(dot)}`
    seen.set(unique.toLowerCase(), 1)
    return unique
  })
}
