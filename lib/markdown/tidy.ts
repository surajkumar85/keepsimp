/**
 * A document tidied by Prettier's Markdown printer: one way of writing
 * lists, emphasis, tables and spacing. It rewrites marks (`*` lists become
 * `-`), so the page always shows what changes before it is taken. Lines are
 * left as they were wrapped. Loaded only when asked for.
 */
import { format } from "prettier/standalone"
import * as markdown from "prettier/plugins/markdown"

export async function tidyMarkdown(text: string) {
  return format(text, {
    parser: "markdown",
    plugins: [markdown],
    proseWrap: "preserve",
  })
}
