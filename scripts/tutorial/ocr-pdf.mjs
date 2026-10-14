/** Storyboard for the OCR PDF tutorial. */
export const options = {
  name: "ocr-pdf-tutorial",
  route: "/dashboard/ocr-pdf/",
  totalSteps: 5,
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
     <h1>OCR PDF</h1>
     <p>A quick tour: make a scanned PDF searchable. Its words are read on your device and laid unseen over the pages.</p>
     <ul><li>Open a scan</li><li>Language</li><li>Recognise</li><li>Search</li><li>Download</li></ul>`
  )
  state.slate.opacity = 1
  await render()
  startCue(
    "OCR PDF: a quick tour.\nMake a scanned PDF searchable, on your device."
  )
  await poster()
  await still(3.2)
  keyframe()
  await animate(0.6, (t) => (state.slate.opacity = 1 - t))
  closeCue()

  // 1. Open a scan
  await spotlight(page.getByTestId("drop-zone"))
  await caption(
    1,
    "Open a scan",
    "A scan is a picture of a page: its words cannot be searched, selected or copied yet.",
    { side: "right", edge: "bottom", read: 3 }
  )
  await clearSpotlight()
  await click(page.getByRole("button", { name: "Try a sample" }))
  await until(
    async () => (await layer.count()) > 0 && (await layer.isVisible())
  )
  await hold(0.8)
  await hideCaption()

  // 2. Language
  const panel = page.getByTestId("editor-ocr")
  const language = panel.getByLabel("Language")
  await spotlight(language, 8)
  await caption(
    2,
    "Choose the language",
    "31 languages, from Arabic and Chinese to Hindi and Thai. The one your browser reads comes first.",
    { side: "left", edge: "bottom", read: 3.4 }
  )
  await clearSpotlight()
  await hideCaption()

  // 3. Recognise
  const start = panel.getByRole("button", { name: "Recognise text on 1 page" })
  await caption(
    3,
    "Recognise the text",
    "Each page is read on this device. Nothing is uploaded; the language is loaded once and kept for offline use.",
    { side: "left", edge: "bottom", read: 2.4 }
  )
  await click(start)
  await until(settled(1), 120_000)
  const said = panel.getByTestId("ocr-said")
  await spotlight(said, 8)
  await caption(
    null,
    "Laid unseen over the page",
    "The page looks the same. The panel says how many words were found and how sure the reading was.",
    { side: "left", edge: "bottom", read: 3.4 }
  )
  await clearSpotlight()
  await hideCaption()

  // 4. Search
  await click(page.getByRole("button", { name: "Search this file" }))
  const box = page.getByRole("searchbox")
  await box.waitFor()
  await type("deposit")
  await until(async () =>
    /of/.test(
      (await page.getByTestId("reader-search-status").textContent()) ?? ""
    )
  )
  await hold(0.6)
  await caption(
    4,
    "Search, select, copy",
    "The words are where they are seen, so search finds them on the page. Redaction can find them too.",
    { side: "left", edge: "bottom", read: 3.4 }
  )
  await page.keyboard.press("Escape")
  await hideCaption()

  // 5. Download
  const download = page.waitForEvent("download")
  await click(page.getByTestId("editor-download"))
  await download
  const check = page.getByTestId("editor-check")
  await until(() => check.isVisible())
  await scrollIntoFocus(check, 200)
  await spotlight(check, 10)
  await caption(
    5,
    "Checked, then downloaded",
    "Every word laid is read back from the file first. The result is searchable in any PDF reader.",
    { side: "left", edge: "top", read: 3.6 }
  )
  await clearSpotlight()
  await hideCaption()
  await hold(0.6)
}
