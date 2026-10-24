"use client"

import {
  IconBlockquote,
  IconBold,
  IconChevronDown,
  IconCode,
  IconHeading,
  IconItalic,
  IconLink,
  IconList,
  IconListCheck,
  IconListNumbers,
  IconSearch,
  IconSeparatorHorizontal,
  IconSourceCode,
  IconStrikethrough,
  IconTable,
  IconPhoto,
} from "@tabler/icons-react"
import { Fragment, useSyncExternalStore } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  ariaKeys,
  keyLabel,
  keyOf,
  type MarkdownCommand,
} from "@/lib/markdown/shortcuts"

/** What the toolbar asks the editor to do: the editor's commands and headings of every level. */
export type ToolbarCommand =
  | MarkdownCommand
  | "h4"
  | "h5"
  | "h6"
  | "rule"
  | "picture"
  | "table"
  | "table-tidy"
  | "table-row"
  | "table-column"
  | "table-delete-row"
  | "table-delete-column"

const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform)

/** Whether this is a Mac, read once on the device and assumed not while the page is made. */
export function useMac() {
  return useSyncExternalStore(
    () => () => {},
    isMac,
    () => false
  )
}

const BUTTONS: {
  command: ToolbarCommand
  label: string
  icon: typeof IconBold
  /** A divider goes before it. */
  group?: boolean
}[] = [
  { command: "bold", label: "Bold", icon: IconBold },
  { command: "italic", label: "Italic", icon: IconItalic },
  { command: "strike", label: "Strikethrough", icon: IconStrikethrough },
  { command: "code", label: "Code in a line", icon: IconCode },
  { command: "link", label: "Link", icon: IconLink, group: true },
  { command: "quote", label: "Quote", icon: IconBlockquote },
  { command: "bullet", label: "Bulleted list", icon: IconList, group: true },
  { command: "number", label: "Numbered list", icon: IconListNumbers },
  { command: "task", label: "Task list", icon: IconListCheck },
  {
    command: "codeBlock",
    label: "Block of code",
    icon: IconSourceCode,
    group: true,
  },
  { command: "picture", label: "Picture", icon: IconPhoto },
  { command: "rule", label: "Line across", icon: IconSeparatorHorizontal },
]

const TABLE_ITEMS: { command: ToolbarCommand; label: string }[] = [
  { command: "table", label: "Make a table…" },
  { command: "table-tidy", label: "Line up the table's pipes" },
  { command: "table-row", label: "Add a row below" },
  { command: "table-column", label: "Add a column to the right" },
  { command: "table-delete-row", label: "Delete this row" },
  { command: "table-delete-column", label: "Delete this column" },
]

/**
 * Buttons that write Markdown into the text, as GitHub's editor has: each
 * names its key in its title and `aria-keyshortcuts`. One row that scrolls
 * sideways on a narrow screen.
 */
export function MarkdownToolbar({
  onCommand,
}: {
  onCommand: (command: ToolbarCommand) => void
}) {
  const mac = useMac()
  const named = (command: ToolbarCommand, label: string) => {
    const key = keyOf(command as MarkdownCommand)
    return {
      "aria-label": label,
      title: key ? `${label} (${keyLabel(key, mac)})` : label,
      "aria-keyshortcuts": key ? ariaKeys(key, mac) : undefined,
    }
  }
  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      aria-orientation="horizontal"
      className="flex items-center gap-0.5 overflow-x-auto border-b px-2 py-1"
      data-testid="markdown-toolbar"
    >
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              className="shrink-0 gap-1 px-2"
              {...named("h2", "Heading")}
            />
          }
        >
          <IconHeading aria-hidden="true" />
          <IconChevronDown className="size-3.5" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {([1, 2, 3, 4, 5, 6] as const).map((level) => {
            const command = `h${level}` as ToolbarCommand
            const key = keyOf(command as MarkdownCommand)
            return (
              <DropdownMenuItem key={level} onClick={() => onCommand(command)}>
                <span className="flex-1">Heading {level}</span>
                {key && (
                  <span className="ml-6 text-xs text-muted-foreground">
                    {keyLabel(key, mac)}
                  </span>
                )}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      {BUTTONS.map(({ command, label, icon: Icon, group }) => (
        <span key={command} className="flex shrink-0 items-center gap-0.5">
          {group && (
            <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onCommand(command)}
            {...named(command, label)}
          >
            <Icon aria-hidden="true" />
          </Button>
        </span>
      ))}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              className="shrink-0 gap-1 px-2"
              aria-label="Table"
              title="Table"
            />
          }
        >
          <IconTable aria-hidden="true" />
          <IconChevronDown className="size-3.5" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {TABLE_ITEMS.map((item, index) => (
            <Fragment key={item.command}>
              {index === 1 && <DropdownMenuSeparator />}
              <DropdownMenuItem onClick={() => onCommand(item.command)}>
                {item.label}
              </DropdownMenuItem>
            </Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden="true" />
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0"
        onClick={() => onCommand("find")}
        {...named("find", "Find and replace")}
      >
        <IconSearch aria-hidden="true" />
      </Button>
    </div>
  )
}
