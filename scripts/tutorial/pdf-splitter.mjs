/** Storyboard for the PDF splitter tutorial. */
export const options = {
  name: "pdf-splitter-tutorial",
  route: "/dashboard/pdf-splitter/",
  totalSteps: 6,
  settledTestId: "pdf-splitter",
}

export default async function storyboard({
  page,
  state,
  still,
  hold,
  render,
  animate,
  click,
  caption,
  hideCaption,
  spotlight,
  clearSpotlight,
  scrollTo,
  scrollIntoFocus,
  waitForResult,
  radio,
  slate,
  startCue,
  closeCue,
  keyframe,
  poster,
}) {
  // Title
  slate(
    "intro",
    `<img src="/brand/keepsimp-mark.svg" alt="">
     <h1>PDF splitter</h1>
     <p>A quick tour: cut a PDF where you can see, at its bookmarks, by size or at blank pages.</p>
     <ul><li>Cut by hand</li><li>Bookmarks</li><li>Size</li><li>Scans</li><li>Small parts</li></ul>`
  )
  state.slate.opacity = 1
  await render()
  startCue(
    "PDF splitter: a quick tour.\nCut a PDF where you can see, at its bookmarks, by size or at blank pages."
  )
  await poster()
  await still(3.2)
  keyframe()
  await animate(0.6, (t) => (state.slate.opacity = 1 - t))
  closeCue()

  // 1. Add a PDF
  await spotlight(page.getByTestId("drop-zone"))
  await caption(
    1,
    "Add your PDFs",
    "Drop one PDF or several, or choose them from your device. Locked files ask for their password.",
    { side: "right", edge: "bottom", read: 3.4 }
  )
  await clearSpotlight()
  await click(page.getByRole("button", { name: "Try a sample" }))
  await waitForResult()
  await page.locator("[data-testid=board-page] canvas").nth(5).waitFor()
  await caption(
    null,
    "Read on your device",
    "The file is opened in your browser. Nothing is uploaded.",
    { side: "right", edge: "bottom", read: 2.2 }
  )
  await hideCaption()

  // 2. Cut by hand
  const board = page.getByTestId("page-board")
  await scrollIntoFocus(board, 140)
  await spotlight(board, 12)
  await caption(
    2,
    "Cut where you can see",
    "Every page is shown. Press the scissors between two pages to cut there.",
    { side: "right", edge: "bottom", read: 2.4 }
  )
  await clearSpotlight()
  const cut = (number) =>
    page.getByRole("button", {
      name: `Cut after page ${number}`,
      exact: true,
    })
  await click(cut(2))
  await hold(0.7)
  await click(cut(5))
  await hold(1.4)
  await hideCaption()
  const rules = page.getByTestId("split-rules")
  await scrollIntoFocus(rules, 160)
  await caption(
    null,
    "Or let a rule place the cuts",
    "Cut after every few pages, into equal parts, or every page on its own. Every change can be undone.",
    { side: "right", edge: "bottom", read: 3 }
  )
  await hideCaption()

  // 3. Read to find the place
  await scrollTo(0)
  await caption(
    3,
    "Read to find the place",
    "Open the file in the reader to scroll, zoom and search.",
    { side: "right", edge: "bottom", read: 1.6 }
  )
  await click(
    page.getByRole("button", {
      name: "Read keepsimp-handbook.pdf",
      exact: true,
    })
  )
  await page
    .locator("[data-testid=reader-page][data-state=drawn]")
    .first()
    .waitFor()
  await render()
  await hold(1.2)
  const field = page.getByLabel("Page", { exact: true })
  await click(field, { act: false })
  await field.fill("8")
  await field.press("Enter")
  await page
    .locator('[data-testid=reader-page][data-page="8"][data-state=drawn]')
    .waitFor()
  await render()
  await caption(
    null,
    "Cut while you read",
    "The scissors cut after the page you are on.",
    { side: "left", edge: "bottom", read: 1.2 }
  )
  await click(page.getByTestId("reader-action"))
  await hold(1.6)
  await hideCaption()
  await click(page.getByRole("button", { name: "Close the reader" }))
  await hold(0.8)

  // 4. Other ways
  const modes = page.getByRole("radiogroup", {
    name: "How to split",
    exact: true,
  })
  await scrollIntoFocus(modes, 160)
  await spotlight(modes, 12)
  await caption(
    4,
    "Let the document say where",
    "Split at bookmarks, by size, at blank pages in a stack of scans, or where a number on the page changes.",
    { side: "right", edge: "bottom", read: 3.4 }
  )
  await clearSpotlight()
  await click(radio("How to split", "By bookmarks"))
  await page.getByTestId("bookmark-list").waitFor()
  await render()
  await hold(1.2)
  await caption(
    null,
    "A part for every chapter",
    "Each bookmark starts a part, and the part is named after it.",
    { side: "right", edge: "bottom", read: 2.6 }
  )
  await hideCaption()

  // 5. Names and what parts keep
  await scrollTo(0)
  const result = page.getByTestId("result")
  await spotlight(result, 12)
  await caption(
    5,
    "Name the parts",
    "Parts are listed before anything is written. Type a name, change the pattern, or leave a part out.",
    { side: "left", edge: "bottom", read: 3 }
  )
  await clearSpotlight()
  const kept = page.getByTestId("split-options")
  await scrollIntoFocus(kept, 160)
  await caption(
    null,
    "Small parts, nothing lost",
    "Each part carries only its own fonts and pictures, and keeps its links and bookmarks. A password is optional.",
    { side: "left", edge: "top", read: 3.2 }
  )
  await hideCaption()

  // 6. Split and download
  await scrollTo(0)
  await spotlight(result, 12)
  await caption(
    6,
    "Split and download",
    "Press Split PDF. Read any part to check it, then download the parts one at a time or as one ZIP.",
    { side: "left", edge: "bottom", read: 2.2 }
  )
  await click(page.getByRole("button", { name: "Split PDF" }))
  await waitForResult()
  await page.getByTestId("result-facts").waitFor()
  await render()
  await hold(2)
  const downloading = page.waitForEvent("download")
  await click(page.getByRole("button", { name: "Download all (.zip)" }))
  await downloading
  await hold(2.2)
  await clearSpotlight()
  await hideCaption()

  // Outro
  slate(
    "outro",
    `<img src="/brand/keepsimp-mark.svg" alt="">
     <h1>Take just the pages you need</h1>
     <p>Free. Private. No account.</p>
     <div class="url">keepsimp.vercel.app/dashboard/pdf-splitter</div>`
  )
  state.progress = 1
  await animate(0.6, (t) => (state.slate.opacity = t))
  startCue("Take just the pages you need.\nFree. Private. No account.")
  await hold(3.2)
  closeCue()
}
