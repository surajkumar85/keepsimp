/** Storyboard for the Redact PDF tutorial. */
export const options = {
  name: "redact-pdf-tutorial",
  route: "/dashboard/redact-pdf/",
  totalSteps: 4,
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
     <h1>Redact PDF</h1>
     <p>A quick tour: take words out of a PDF for good, not just cover them, and check before you send it.</p>
     <ul><li>Mark</li><li>Look over</li><li>Apply</li><li>Download</li></ul>`
  )
  state.slate.opacity = 1
  await render()
  startCue(
    "Redact PDF: a quick tour.\nTake words out of a PDF for good, not just cover them."
  )
  await poster()
  await still(3.2)
  keyframe()
  await animate(0.6, (t) => (state.slate.opacity = 1 - t))
  closeCue()

  await click(page.getByRole("button", { name: "Try a sample" }))
  await until(
    async () => (await layer.count()) > 0 && (await layer.isVisible())
  )
  await hold(0.6)

  // 1. Mark everywhere
  const words = page.getByLabel("Words to mark everywhere", { exact: true })
  await spotlight(words, 8)
  await caption(
    1,
    "Mark what has to go",
    "Drag over an area or words, or type a name and mark it on every page at once.",
    { side: "right", edge: "bottom", read: 2.6 }
  )
  await clearSpotlight()
  await click(words)
  await type("Team handbook")
  await click(page.getByRole("button", { name: "Mark all", exact: true }))
  await until(settled(1))
  await hideCaption()

  // 2. Look them over
  const mark = layer.getByTestId("redact-mark").first()
  await mark.scrollIntoViewIfNeeded()
  await hold(0.4)
  await spotlight(mark, 14)
  await caption(
    2,
    "Look the marks over",
    "A mark is a red frame and takes nothing out yet. Press one to take it away again.",
    { side: "left", edge: "bottom", read: 3.2 }
  )
  await clearSpotlight()
  await hideCaption()

  // 3. Apply
  const apply = page.getByTestId("redact-apply")
  await caption(
    3,
    "Apply",
    "The letters, the pixels and the drawings under each mark leave the file. A black box shows where.",
    { side: "left", edge: "bottom", read: 2.6 }
  )
  await click(apply)
  await until(settled(2))
  await hold(1.2)
  await hideCaption()

  // 4. Download
  const download = page.waitForEvent("download")
  await click(page.getByTestId("editor-download"))
  await download
  const check = page.getByTestId("editor-check")
  await until(() => check.isVisible())
  await scrollIntoFocus(check, 200)
  await spotlight(check, 10)
  await caption(
    4,
    "Checked before you send it",
    "Each place is read back. The download warns you if a mark was never applied.",
    { side: "left", edge: "top", read: 3.6 }
  )
  await clearSpotlight()
  await hideCaption()
  await hold(0.6)
}
