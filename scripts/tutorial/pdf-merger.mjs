/** Storyboard for the PDF merger tutorial. */
export const options = {
  name: "pdf-merger-tutorial",
  route: "/dashboard/pdf-merger/",
  totalSteps: 6,
  settledTestId: "pdf-merger",
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
     <h1>PDF merger</h1>
     <p>A quick tour: join PDFs in any order, arrange single pages, and keep links and bookmarks.</p>
     <ul><li>Files and pages</li><li>Locked PDFs</li><li>Pictures</li><li>Contents page</li><li>Password</li></ul>`
  )
  state.slate.opacity = 1
  await render()
  startCue(
    "PDF merger: a quick tour.\nJoin PDFs in any order, arrange single pages, and keep links and bookmarks."
  )
  await poster()
  await still(3.2)
  keyframe()
  await animate(0.6, (t) => (state.slate.opacity = 1 - t))
  closeCue()

  // 1. Add PDFs
  await spotlight(page.getByTestId("drop-zone"))
  await caption(
    1,
    "Add your PDFs",
    "Drop PDF files and pictures, or choose them from your device. Locked files ask for their password.",
    { side: "right", edge: "bottom", read: 3.6 }
  )
  await clearSpotlight()
  await click(page.getByRole("button", { name: "Try a sample" }))
  await waitForResult()
  await page.getByTestId("file-thumbnail").nth(1).waitFor()
  await caption(
    null,
    "Read on your device",
    "Each file is opened in your browser. Nothing is uploaded.",
    { side: "right", edge: "bottom", read: 2.4 }
  )
  await hideCaption()

  // 2. Order and pages
  const list = page.getByTestId("file-list")
  await spotlight(list, 12)
  await caption(
    2,
    "Put them in order",
    "Drag a file, use its arrows, or sort by name or date.",
    { side: "right", edge: "bottom", read: 1.8 }
  )
  await clearSpotlight()
  await click(
    page.getByRole("button", { name: "Move keepsimp-appendix.pdf earlier" })
  )
  await hold(1)
  await click(
    page.getByRole("button", { name: "Move keepsimp-appendix.pdf later" })
  )
  await hold(0.6)
  await caption(
    null,
    "Take only the pages you need",
    "Type pages such as 1-3, 7, or leave the field empty for the whole file.",
    { side: "right", edge: "bottom", read: 1 }
  )
  const range = page.getByLabel("Pages from keepsimp-report.pdf")
  await click(range, { act: false })
  await range.click()
  await page.keyboard.type("1, 3")
  await render()
  await hold(2.2)
  await range.fill("")
  await hideCaption()

  // 3. Pages view
  await click(page.getByRole("radio", { name: /^Pages/ }))
  await page.getByTestId("page-tile").locator("canvas").nth(4).waitFor()
  await render()
  const grid = page.getByTestId("page-grid")
  await spotlight(grid, 12)
  await caption(
    3,
    "Arrange single pages",
    "Every page of the result is here. Select pages, then drag, turn, copy or remove them.",
    { side: "right", edge: "bottom", read: 3 }
  )
  await clearSpotlight()
  const tile = (at) => page.getByTestId("page-tile").nth(at).getByRole("button")
  await click(tile(3))
  await hold(0.5)
  await click(page.getByRole("button", { name: "Move to the start" }))
  await hold(1.2)
  await click(tile(2))
  await click(page.getByRole("button", { name: "Turn clockwise" }))
  await hold(1.2)
  await caption(
    null,
    "Every change can be undone",
    "Undo and redo cover turning, moving, copying and removing.",
    { side: "right", edge: "bottom", read: 0.8 }
  )
  await click(page.getByRole("button", { name: "Undo" }))
  await hold(1.4)
  await hideCaption()

  // 4. Organise the result
  const structure = page.getByTestId("structure-options")
  await scrollIntoFocus(structure, 120)
  await spotlight(structure, 12)
  await caption(
    4,
    "Organise the result",
    "Choose how bookmarks are kept, and add a contents page with a link to every file.",
    { side: "left", edge: "bottom", read: 2.6 }
  )
  await clearSpotlight()
  await click(radio("Contents page", "File names"))
  await hold(1)
  const output = page.getByTestId("output-options")
  await scrollIntoFocus(output, 160)
  await caption(
    null,
    "Details, a password, and printing",
    "Set a title, lock the file with a password, or fit every page onto one paper size.",
    { side: "left", edge: "top", read: 3 }
  )
  await hideCaption()

  // 5. Merge
  await scrollTo(0)
  const result = page.getByTestId("result")
  await spotlight(result, 12)
  await caption(
    5,
    "Merge and check",
    "Press Merge PDF. Links, notes, fields and bookmarks are carried into the result.",
    { side: "left", edge: "bottom", read: 2.2 }
  )
  await click(page.getByRole("button", { name: "Merge PDF" }))
  await waitForResult()
  await page.getByTestId("result-facts").waitFor()
  await render()
  await hold(2.6)
  await clearSpotlight()
  await hideCaption()

  // 6. Download
  await spotlight(result, 12)
  await caption(
    6,
    "Download",
    "Open the result in a new tab to look through it, then download it. Everything ran in your browser.",
    { side: "left", edge: "bottom", read: 2 }
  )
  const downloading = page.waitForEvent("download")
  await click(page.getByRole("link", { name: "Download PDF" }))
  await downloading
  await hold(2.2)
  await clearSpotlight()
  await hideCaption()

  // Outro
  slate(
    "outro",
    `<img src="/brand/keepsimp-mark.svg" alt="">
     <h1>Bring separate documents together</h1>
     <p>Free. Private. No account.</p>
     <div class="url">keepsimp.vercel.app/dashboard/pdf-merger</div>`
  )
  state.progress = 1
  await animate(0.6, (t) => (state.slate.opacity = t))
  startCue("Bring separate documents together.\nFree. Private. No account.")
  await hold(3.2)
  closeCue()
}
