/** Storyboard for the image resizer tutorial. */
export const options = {
  name: "image-resizer-tutorial",
  route: "/dashboard/image-resizer/",
  totalSteps: 6,
  settledTestId: "image-resizer",
}

export default async function storyboard({
  page,
  state,
  lerp,
  still,
  hold,
  render,
  shoot,
  animate,
  center,
  moveTo,
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
     <h1>Image resizer</h1>
     <p>A quick tour: resize one image or a whole batch, crop without losing the subject, and export for print or the web.</p>
     <ul><li>Batch and ZIP</li><li>Presets</li><li>Smart focus</li><li>Print sizes</li><li>Responsive sets</li></ul>`
  )
  state.slate.opacity = 1
  await render()
  startCue(
    "Image resizer: a quick tour.\nResize one image or a whole batch, crop without losing the subject, and export for print or the web."
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
    "Drop one image or a whole batch of up to 50, choose them, paste with ⌘V or Ctrl+V, or try our samples.",
    { side: "right", edge: "bottom", read: 3.8 }
  )
  await clearSpotlight()
  await click(page.getByRole("button", { name: "Try a sample" }))
  await caption(
    null,
    "Every image is resized straight away",
    "The preview shows the selected image. Change any setting and the whole batch updates.",
    { side: "right", edge: "bottom", read: 0.4 }
  )
  await waitForResult()
  await hold(1.4)
  const summary = page.getByTestId("summary-bar")
  await scrollIntoFocus(summary, 150)
  await spotlight(page.getByTestId("queue"))
  await hold(2.4)
  await clearSpotlight()
  await hideCaption()

  // 2. Choose a size
  await scrollTo(0)
  const modes = page.getByRole("radiogroup", { name: "Resize by", exact: true })
  await spotlight(modes, 12)
  await caption(
    2,
    "Choose a size",
    "Set a width and height, resize by one side, a percentage or megapixels, or pick a preset.",
    { side: "left", edge: "bottom", read: 3.4 }
  )
  await clearSpotlight()
  await click(radio("Resize by", "Presets"))
  await waitForResult()
  await caption(
    null,
    "Presets for where it is going",
    "Social posts and stories, link previews, screens, prints and app icons. Sizes are current recommendations.",
    { side: "left", edge: "bottom", read: 1.6 }
  )
  await click(radio("Preset", "Instagram portrait"))
  await waitForResult()
  await hold(1.6)
  await hideCaption()

  // 3. Fit and focus
  const fit = page.getByRole("radiogroup", {
    name: "How the image fills the frame",
    exact: true,
  })
  await scrollIntoFocus(fit, 330)
  await caption(
    3,
    "Crop without losing the subject",
    "Crop to fill trims what does not fit. Smart focus finds the interesting part of every image for you.",
    { side: "left", edge: "bottom", read: 2 }
  )
  await click(radio("Focus", "Smart focus"))
  await waitForResult()
  await hold(1.6)
  await scrollTo(0)
  await caption(
    null,
    "Or place it yourself",
    "Drag the picture inside the frame, or use the arrow keys. Dragging adjusts only the selected image.",
    { side: "right", edge: "bottom", read: 0.8 }
  )
  const frame = await center(page.getByTestId("output-frame"))
  await moveTo(frame, 0.7)
  await page.mouse.move(frame.x, frame.y)
  await page.mouse.down()
  for (const [dx, seconds] of [
    [-90, 1.2],
    [70, 1.4],
    [0, 0.9],
  ]) {
    const from = state.cursor.x
    await animate(seconds, async (t) => {
      state.cursor.x = Math.round(lerp(from, frame.x + dx, t))
      await page.mouse.move(state.cursor.x, frame.y)
    })
  }
  await page.mouse.up()
  await waitForResult()
  await hold(0.8)
  await scrollIntoFocus(fit, 330)
  await caption(
    null,
    "Keep the whole picture instead",
    "Fit with padding fills the frame with a colour, transparency or a soft blurred copy of the image.",
    { side: "left", edge: "bottom", read: 0.8 }
  )
  await click(radio("How the image fills the frame", "Fit with padding"))
  await hold(0.5)
  await click(radio("Padding", "Blurred image"))
  await waitForResult()
  await scrollTo(0)
  await hold(2.2)
  await hideCaption()

  // 4. Print sizes
  await click(radio("Resize by", "Dimensions"))
  await caption(
    4,
    "Sizes for print",
    "Switch to inches, centimetres or millimetres at a print resolution. The resolution is saved into the file.",
    { side: "left", edge: "bottom", read: 0.6 }
  )
  await click(radio("Units", "Inches"))
  const width = page.getByLabel("Width (in)")
  await click(width, { act: false })
  await width.click({ clickCount: 3 })
  await page.keyboard.type("6")
  await render()
  await shoot(12)
  await waitForResult()
  await scrollIntoFocus(page.getByTestId("size-summary"), 430)
  await spotlight(page.getByTestId("size-summary"), 10)
  await hold(2.6)
  await clearSpotlight()
  await hideCaption()

  // 5. Several sizes
  const several = page.getByRole("switch", { name: "Export a responsive set" })
  await scrollIntoFocus(several, 220)
  await caption(
    5,
    "Several sizes at once",
    "Export a set of widths from every image, with img and srcset HTML ready to paste into a page.",
    { side: "left", edge: "top", read: 1 }
  )
  await click(several)
  await waitForResult()
  await scrollIntoFocus(page.getByTestId("srcset-snippet"), 380)
  await spotlight(page.getByTestId("srcset-snippet"), 10)
  await hold(2.8)
  await clearSpotlight()
  await hideCaption()

  // 6. Output and download
  const format = page.getByRole("radiogroup", { name: "Format", exact: true })
  await scrollIntoFocus(format, 200)
  await caption(
    6,
    "Set the format and download",
    "Keep the original format or convert to WebP, AVIF, JPEG or PNG, choose a quality, and name files your way.",
    { side: "left", edge: "bottom", read: 1.4 }
  )
  await click(radio("Format", "WebP"))
  await waitForResult()
  await hold(1)
  await scrollIntoFocus(summary, 250)
  await spotlight(summary)
  await caption(
    null,
    "Download everything as a ZIP",
    "Each image is processed on your device. Nothing is uploaded, and location data is removed.",
    { side: "right", edge: "top", read: 1.2 }
  )
  const downloading = page.waitForEvent("download")
  await click(page.getByRole("button", { name: "Download all (ZIP)" }))
  await downloading
  await hold(2.2)
  await clearSpotlight()
  await hideCaption()

  // Outro
  slate(
    "outro",
    `<img src="/brand/keepsimp-mark.svg" alt="">
     <h1>Every image, the right size</h1>
     <p>Free. Private. No account.</p>
     <div class="url">keepsimp.vercel.app/dashboard/image-resizer</div>`
  )
  state.progress = 1
  await animate(0.6, (t) => (state.slate.opacity = t))
  startCue("Every image, the right size.\nFree. Private. No account.")
  await hold(3.2)
  closeCue()
}
