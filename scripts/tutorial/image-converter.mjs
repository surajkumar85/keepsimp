/** Storyboard for the image converter tutorial. */
export const options = {
  name: "image-converter-tutorial",
  route: "/dashboard/image-converter/",
  totalSteps: 6,
  settledTestId: "image-converter",
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
  /** Keep recording, faster than real time, until something appears. */
  const waitUntilVisible = async (locator) => {
    while (!(await locator.isVisible())) {
      await render()
      await shoot()
      await page.waitForTimeout(100)
    }
    await render()
    await shoot()
  }

  // Title
  slate(
    "intro",
    `<img src="/brand/keepsimp-mark.svg" alt="">
     <h1>Image converter</h1>
     <p>A quick tour: convert images between ten formats, find the smallest one, and make favicons and PDFs.</p>
     <ul><li>Ten formats</li><li>Compare sizes</li><li>Several at once</li><li>Favicons</li><li>PDF</li></ul>`
  )
  state.slate.opacity = 1
  await render()
  startCue(
    "Image converter: a quick tour.\nConvert images between ten formats, find the smallest one, and make favicons and PDFs."
  )
  await poster()
  await still(3.2)
  keyframe()
  await animate(0.6, (t) => (state.slate.opacity = 1 - t))
  closeCue()

  // 1. Add images
  await spotlight(page.getByTestId("drop-zone"))
  await caption(
    1,
    "Add your images",
    "Drop one image or a batch of up to 50, choose them, paste, or try our samples. Eleven kinds of image are read.",
    { side: "right", edge: "bottom", read: 3.6 }
  )
  await clearSpotlight()
  await click(page.getByRole("button", { name: "Try a sample" }))
  await waitForResult()
  await hold(1)
  await hideCaption()

  // 2. Pick a format
  const formats = page.getByRole("radiogroup", { name: "Format", exact: true })
  await spotlight(formats, 12)
  await caption(
    2,
    "Pick a format",
    "JPEG, PNG, WebP, AVIF, JPEG XL, GIF, BMP, TIFF, ICO or PDF. The line underneath says what each one is good for.",
    { side: "left", edge: "bottom", read: 3.4 }
  )
  await clearSpotlight()
  await click(radio("Format", "AVIF"))
  await waitForResult()
  await hold(1.8)
  await hideCaption()

  // 3. Compare formats
  const compare = page.getByRole("button", { name: "Compare formats" })
  await scrollIntoFocus(compare, 260)
  await caption(
    3,
    "See which format is smallest",
    "KeepSimp encodes the selected image in five formats and lists the real sizes. Nothing is estimated.",
    { side: "left", edge: "bottom", read: 1.6 }
  )
  await click(compare)
  const table = page.getByTestId("comparison")
  await waitUntilVisible(table)
  await scrollIntoFocus(table, 300)
  await spotlight(table, 10)
  await hold(3.2)
  await clearSpotlight()
  await click(table.locator("tbody tr").first().getByRole("button"))
  await waitForResult()
  await hold(1)
  await hideCaption()

  // 4. Several formats at once
  const several = page.getByRole("switch", { name: "Several formats at once" })
  await scrollIntoFocus(several, 300)
  await caption(
    4,
    "Several formats at once",
    "Save every image as AVIF, WebP and JPEG together, with picture HTML that lets each browser choose.",
    { side: "left", edge: "bottom", read: 1.2 }
  )
  await click(several)
  await waitForResult()
  const snippet = page.getByTestId("picture-snippet")
  await scrollIntoFocus(snippet, 260)
  await spotlight(snippet, 10)
  await hold(2.8)
  await clearSpotlight()
  await hideCaption()

  // 5. Favicons and PDFs
  await scrollIntoFocus(several, 300)
  await click(several)
  await scrollTo(0)
  await caption(
    5,
    "Favicons and documents",
    "ICO packs several icon sizes into one file. PDF makes a page per image, or one document with every image.",
    { side: "left", edge: "bottom", read: 1 }
  )
  await click(radio("Format", "ICO"))
  await waitForResult()
  await click(
    page
      .getByRole("group", { name: "Icon sizes (px)" })
      .getByRole("checkbox", { name: "256", exact: true })
  )
  await waitForResult()
  await hold(1.4)
  await click(radio("Format", "PDF"))
  await waitForResult()
  const combine = page.getByRole("switch", { name: "Combine into one PDF" })
  await scrollIntoFocus(combine, 360)
  await click(combine)
  await hold(2)
  await hideCaption()

  // 6. Options and download
  const quality = page.getByRole("radiogroup", { name: "Quality", exact: true })
  await scrollIntoFocus(quality, 160)
  await caption(
    6,
    "Set the options and download",
    "Choose a quality, a background for transparency, a size limit, greyscale and file names.",
    { side: "left", edge: "bottom", read: 1.2 }
  )
  await click(radio("Quality", "High"))
  await waitForResult()
  await hold(1.2)
  const summary = page.getByTestId("summary-bar")
  await scrollIntoFocus(summary, 250)
  await spotlight(summary)
  await caption(
    null,
    "One file, or everything together",
    "Each image is converted on your device. Nothing is uploaded, and location data is removed.",
    { side: "right", edge: "top", read: 1.2 }
  )
  const downloading = page.waitForEvent("download")
  await click(page.getByRole("button", { name: "Download PDF" }))
  await downloading
  await hold(2.2)
  await clearSpotlight()
  await hideCaption()

  // Outro
  slate(
    "outro",
    `<img src="/brand/keepsimp-mark.svg" alt="">
     <h1>Any image, any format</h1>
     <p>Free. Private. No account.</p>
     <div class="url">keepsimp.vercel.app/dashboard/image-converter</div>`
  )
  state.progress = 1
  await animate(0.6, (t) => (state.slate.opacity = t))
  startCue("Any image, any format.\nFree. Private. No account.")
  await hold(3.2)
  closeCue()
}
