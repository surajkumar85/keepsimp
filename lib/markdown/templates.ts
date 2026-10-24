/** Documents to start from: what people most often write in Markdown. */

export interface Template {
  id: string
  name: string
  description: string
  /** The name the new document is given. */
  file: string
  text: string
}

const today = () => new Date().toISOString().slice(0, 10)

export function templates(date = today()): Template[] {
  return [
    {
      id: "readme",
      name: "README",
      description: "What a project is, how to install and use it.",
      file: "README.md",
      text: `# Project name

One sentence on what this does and who it is for.

## Install

\`\`\`sh
npm install project-name
\`\`\`

## Use

\`\`\`js
import { thing } from "project-name"

thing()
\`\`\`

## Contributing

Issues and pull requests are welcome.

## Licence

MIT
`,
    },
    {
      id: "meeting",
      name: "Meeting notes",
      description: "Who came, what was decided, who does what.",
      file: `meeting-${date}.md`,
      text: `# Meeting: topic

**Date:** ${date}
**People:**

## Agenda

1.

## Decisions

-

## Actions

- [ ] Who: what, by when
`,
    },
    {
      id: "post",
      name: "Blog post",
      description: "Front matter for a site builder, then the article.",
      file: "post.md",
      text: `---
title: Title of the post
date: ${date}
tags: []
draft: true
---

An opening paragraph that says why this is worth reading.

## The first point

Text.

## The second point

Text.
`,
    },
    {
      id: "changelog",
      name: "Changelog",
      description: "Changes by version, as Keep a Changelog sets them out.",
      file: "CHANGELOG.md",
      text: `# Changelog

All notable changes to this project are written here.

## [Unreleased]

### Added

-

### Changed

-

### Fixed

-
`,
    },
    {
      id: "todo",
      name: "To-do list",
      description: "Tasks to tick off, grouped.",
      file: "to-do.md",
      text: `# To do

## Today

- [ ]

## This week

- [ ]

## Some day

- [ ]
`,
    },
    {
      id: "slides",
      name: "Slides",
      description: "A short talk, one slide between each ---.",
      file: "slides.md",
      text: `# Title of the talk

Your name

---

## The problem

- One point
- Another

---

## The answer

> A line worth remembering.

---

## Thank you

Questions?
`,
    },
  ]
}
