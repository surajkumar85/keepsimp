/**
 * The document check: markdownlint's rules (David Anson's markdownlint,
 * the rules editors and CI use for Markdown) run on the device, said in
 * plain words where they are common, each with the line it is on and a
 * fix where the rule has one. Rules about style that GitHub's own writing
 * does not keep (line length, HTML in the text, bare addresses) are off.
 * Links are checked only within the document: nothing is asked of the
 * network. Loaded only when the check is opened.
 */
import { applyFixes } from "markdownlint"
import { lint } from "markdownlint/sync"
import type { LintError } from "markdownlint"

export interface Issue {
  /** The line, from 1. */
  line: number
  /** The rule, as markdownlint names it: "MD001". */
  rule: string
  /** What is wrong, in a sentence. */
  said: string
  /** The words it is about, when the rule says them. */
  detail: string | null
  fixable: boolean
  /** markdownlint's own finding, which a fix is made from. */
  found: LintError
}

const CONFIG = {
  default: true,
  MD013: false,
  MD033: false,
  MD034: false,
  MD041: false,
  MD024: { siblings_only: true },
  // A title in front matter is the page's details, not a second heading.
  MD025: { front_matter_title: "" },
  MD046: { style: "fenced" },
} as const

/** The rules people meet most, in plain words. */
const SAID: Record<string, string> = {
  MD001: "A heading skips a level: go down one level at a time.",
  MD003: "Headings are written in more than one style.",
  MD004: "Lists use more than one kind of bullet.",
  MD005: "Items of one list are indented differently.",
  MD007: "A list inside a list is indented by the wrong amount.",
  MD009: "Spaces at the end of the line.",
  MD010: "A tab where spaces are expected.",
  MD011: "A link written the wrong way round: (words)[address].",
  MD012: "More than one blank line in a row.",
  MD018: "No space after the # of a heading.",
  MD019: "More than one space after the # of a heading.",
  MD022: "A heading needs a blank line before and after it.",
  MD023: "A heading does not start at the beginning of its line.",
  MD024: "Two headings side by side have the same words.",
  MD025: "More than one top-level heading.",
  MD026: "A heading ends with punctuation.",
  MD027: "More than one space after the > of a quote.",
  MD028: "A blank line inside a quote splits it in two.",
  MD029: "A numbered list is numbered unevenly.",
  MD030: "The space after a list marker is not one space.",
  MD031: "A block of code needs a blank line before and after it.",
  MD032: "A list needs a blank line before and after it.",
  MD036: "Bold or italic used as a heading.",
  MD037: "Spaces inside the marks of bold or italic.",
  MD038: "Spaces inside the backticks of code.",
  MD039: "Spaces inside the words of a link.",
  MD040: "A block of code does not say its language.",
  MD042: "A link that leads nowhere.",
  MD045: "A picture without words for people who cannot see it.",
  MD047: "The file does not end with one line break.",
  MD049: "Italic is written in more than one style.",
  MD050: "Bold is written in more than one style.",
  MD051: "A link to a heading that is not in the document.",
  MD052: "A reference link with no address given for it.",
  MD053: "An address given for a reference link that nothing uses.",
  MD055: "Table rows start or end with pipes in different ways.",
  MD056: "A table row has more or fewer cells than the header.",
  MD058: "A table needs a blank line before and after it.",
}

/** The findings of every rule, top to bottom. */
export function checkDocument(text: string): Issue[] {
  const results = lint({ strings: { document: text }, config: CONFIG })
  return results.document
    .map((found) => ({
      line: found.lineNumber,
      rule: found.ruleNames[0],
      said: SAID[found.ruleNames[0]] ?? `${found.ruleDescription}.`,
      detail: found.errorDetail ?? found.errorContext,
      fixable: found.fixInfo !== null,
      found,
    }))
    .sort((a, b) => a.line - b.line)
}

/** The text with one finding fixed, or with every fixable one fixed. */
export function fixIssues(text: string, issues: Issue[]) {
  return applyFixes(
    text,
    issues.filter((one) => one.fixable).map((one) => one.found)
  )
}

/** Every fixable finding fixed, again while a fix uncovers another (a tab made spaces that end a line), at most five times. */
export function fixAll(text: string) {
  let out = text
  for (let round = 0; round < 5; round++) {
    const issues = checkDocument(out).filter((one) => one.fixable)
    if (!issues.length) break
    out = fixIssues(out, issues)
  }
  return out
}
