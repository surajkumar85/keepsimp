/** Markdown plugins published without types of their own. */
declare module "markdown-it-task-lists" {
  import type { MarkdownIt } from "markdown-it"
  const taskLists: (
    md: MarkdownIt,
    options?: { enabled?: boolean; label?: boolean; labelAfter?: boolean }
  ) => void
  export default taskLists
}

declare module "turndown-plugin-gfm" {
  import type TurndownService from "turndown"
  type Plugin = (service: TurndownService) => void
  export const gfm: Plugin
  export const tables: Plugin
  export const strikethrough: Plugin
  export const taskListItems: Plugin
}

declare module "markdown-it-footnote" {
  import type { MarkdownIt } from "markdown-it"
  const footnote: (md: MarkdownIt) => void
  export default footnote
}
