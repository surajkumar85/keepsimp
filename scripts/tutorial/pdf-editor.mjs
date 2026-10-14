/** Storyboard for the PDF editor tutorial. */
export const options = {
  name: "pdf-editor-tutorial",
  route: "/dashboard/pdf-editor/",
  totalSteps: 6,
  settledTestId: "pdf-editor",
}

export default async function storyboard({
  page,
  state,
  still,
  hold,
  render,
  shoot,
  animate,
  click,
  moveTo,
  caption,
  hideCaption,
  spotlight,
  clearSpotlight,
  scrollIntoFocus,
  slate,
  startCue,
  closeCue,
  keyframe,
  poster,
}) {
  const editor = page.getByTestId("pdf-editor")
  const tool = (name) =>
    page.getByRole("toolbar", { name: "Tools" }).getByRole("button", {
      name,
      exact: true,
    })
  const layer = page.locator('[data-testid=editor-layer][data-page="1"]')

  /** Keep filming while the editor works, until a check holds. */
  async function until(check, timeout = 60_000) {
    const started = Date.now()
    while (!(await check())) {
      if (Date.now() - started > timeout)
        throw new Error("The editor did not finish in time.")
      await render()
      await shoot()
      await page.waitForTimeout(100)
    }
    await render()
    await shoot()
  }
  const settled = (changes) => async () =>
    (await editor.getAttribute("data-changes")) === String(changes) &&
    (await editor.getAttribute("data-busy")) === null

  /** Type as a person does, a few letters to a frame. */
  async function type(text) {
    for (let at = 0; at < text.length; at++) {
      await page.keyboard.type(text[at])
      if (at % 2) {
        await render()
        await shoot()
      }
    }
    await render()
    await shoot()
  }

  // Title
  slate(
    "intro",
    `<img src="/brand/keepsimp-mark.svg" alt="">
     <h1>PDF editor</h1>
     <p>A quick tour: change the words that are there, add your own, and download a file that has been checked.</p>
     <ul><li>Open</li><li>Change words</li><li>Add text</li><li>Pages</li><li>Download</li></ul>`
  )
  state.slate.opacity = 1
  await render()
  startCue(
    "PDF editor: a quick tour.\nChange the words that are there, add your own, and download a checked file."
  )
  await poster()
  await still(3.2)
  keyframe()
  await animate(0.6, (t) => (state.slate.opacity = 1 - t))
  closeCue()

  // 1. Open a PDF
  await spotlight(page.getByTestId("drop-zone"))
  await caption(
    1,
    "Open a PDF",
    "Drop it, choose it or paste it. It is opened on your device and never uploaded.",
    { side: "right", edge: "bottom", read: 3 }
  )
  await clearSpotlight()
  await click(page.getByRole("button", { name: "Try a sample" }))
  await until(
    async () => (await layer.count()) > 0 && (await layer.isVisible())
  )
  await hold(0.8)
  await hideCaption()

  // 2. Change the words that are there
  await click(tool("Change text"))
  await hold(0.6)
  const line = layer.getByRole("button", {
    name: "Change the line: A sample document for the KeepSimp PDF splitter.",
    exact: true,
  })
  await spotlight(line, 8)
  await caption(
    2,
    "Change the words that are there",
    "Choose Change text and click a line. The old words are taken out of the file.",
    { side: "right", edge: "bottom", read: 2.6 }
  )
  await clearSpotlight()
  await click(line)
  const field = page.getByTestId("editor-retext")
  await field.waitFor()
  await page.keyboard.press("End")
  for (let i = 0; i < "splitter.".length; i++)
    await page.keyboard.press("Backspace")
  await type("editor.")
  await page.keyboard.press("Enter")
  await until(settled(1))
  await caption(
    null,
    "In the file's own font",
    "The new words are written with the very font the line had, at its size and colour.",
    { side: "right", edge: "bottom", read: 3 }
  )
  await hideCaption()
  await page.keyboard.press("Escape")

  // 3. Add text of your own
  await click(tool("Text"))
  const box = await layer.boundingBox()
  // Low on the page, but on the screen: the page is taller than the window.
  const spot = {
    x: box.x + box.width * 0.45,
    y: Math.min(box.y + box.height * 0.8, 600),
  }
  await moveTo(spot)
  await page.mouse.click(spot.x, spot.y)
  await page.getByTestId("editor-typing").waitFor()
  await hold(0.4)
  await type("Checked by Sam, 14 October")
  await page.keyboard.press("Control+Enter")
  await until(settled(2))
  await caption(
    3,
    "Add your own",
    "Text, pictures, shapes, drawings, stamps, highlights and notes. Each can be moved, turned and undone.",
    { side: "left", edge: "bottom", read: 3.4 }
  )
  await hideCaption()

  // 4. Pages
  await click(page.getByTestId("pages-toggle"))
  await hold(0.6)
  await caption(
    4,
    "Pages, forms, redaction, OCR",
    "Move, turn and add pages; make forms; take things out for good; make scans searchable.",
    { side: "left", edge: "bottom", read: 3.4 }
  )
  await click(page.getByTestId("pages-toggle"))
  await hideCaption()

  // 5. Keys
  await page.keyboard.press("Shift+?")
  await page.getByTestId("editor-shortcuts").waitFor()
  await hold(0.4)
  await caption(
    5,
    "Every tool has a key",
    "Press ? for the sheet of keys. Everything works without a mouse too.",
    { side: "left", edge: "bottom", read: 2.8 }
  )
  await page.keyboard.press("Escape")
  await hideCaption()

  // 6. Download
  const download = page.waitForEvent("download")
  await click(page.getByTestId("editor-download"))
  await download
  const check = page.getByTestId("editor-check")
  await until(() => check.isVisible())
  await scrollIntoFocus(check, 200)
  await spotlight(check, 10)
  await caption(
    6,
    "Checked, then downloaded",
    "Pages you did not touch are compared with the original, and the words you wrote are read back.",
    { side: "left", edge: "top", read: 3.6 }
  )
  await clearSpotlight()
  await hideCaption()
  await hold(0.6)
}
