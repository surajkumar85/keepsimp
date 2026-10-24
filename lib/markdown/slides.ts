/**
 * Slides from a document: each part between lines of `---` is a slide, as
 * in HedgeDoc and Marp. Front matter at the top is not a slide, and a
 * `---` inside a block of code stays code.
 */

/** The text of each slide, in order; empty parts are left out. */
export function slidesOf(text: string): string[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n")
  let start = 0
  // Front matter: --- on the first line and the next --- that closes it.
  if (lines[0] === "---") {
    const close = lines.indexOf("---", 1)
    if (close !== -1) start = close + 1
  }
  const slides: string[] = []
  let current: string[] = []
  let fence: string | null = null
  for (const line of lines.slice(start)) {
    const opening = /^\s{0,3}(`{3,}|~{3,})/.exec(line)
    if (opening) {
      if (fence === null) fence = opening[1][0].repeat(opening[1].length)
      else if (line.trim().startsWith(fence)) fence = null
    }
    if (fence === null && /^\s{0,3}---\s*$/.test(line)) {
      slides.push(current.join("\n"))
      current = []
    } else current.push(line)
  }
  slides.push(current.join("\n"))
  return slides.map((one) => one.trim()).filter(Boolean)
}
