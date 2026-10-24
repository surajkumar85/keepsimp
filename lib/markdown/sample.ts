/** A document that shows what the editor draws: opened by "Try a sample". */
export const SAMPLE_NAME = "keepsimp-sample.md"

export const SAMPLE = `---
title: Trip notes
author: KeepSimp
tags: [markdown, sample]
---

# Trip notes

A short guide to **Markdown**, written in _Markdown_. Everything here stays on your device.

## Packing list

- [x] Passport and tickets
- [x] Charger and cable
- [ ] A good book
- [ ] Sun cream

## Plan

| Day | Where | Notes |
| --- | ----- | ----- |
| Friday | Lisbon | Arrive at 14:00 |
| Saturday | Sintra | Train from Rossio |
| Sunday | Cascais | ~~Surf lesson~~ Beach day |

> [!TIP]
> Select some words and press **Ctrl+K** (**⌘K** on a Mac) to make them a link, or **Ctrl+B** (**⌘B**) for bold.

### Directions

1. Leave the station by the north exit.
2. Walk up the hill for ten minutes.
3. The hotel is on the left[^1].

\`\`\`js
// Code keeps its spacing.
const total = [12.5, 8, 21].reduce((sum, cost) => sum + cost, 0)
\`\`\`

Find more at https://keepsimp.vercel.app/blog/.

---

[^1]: Look for the blue door.
`
