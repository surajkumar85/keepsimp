/** Storyboard for the image compressor tutorial. */
export const options = {
  name: "image-compressor-tutorial",
  route: "/dashboard/image-compressor/",
  totalSteps: 6,
  settledTestId: "image-compressor",
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
     <h1>Image compressor</h1>
     <p>A one-minute tour: make images lighter, resize, crop and convert them, all on your own device.</p>
     <ul><li>Smart compression</li><li>Before and after slider</li><li>WebP, AVIF, JPEG, PNG</li><li>Target file size</li><li>Resize, crop, rotate</li></ul>`
  )
  state.slate.opacity = 1
  await render()
  startCue(
    "Image compressor: a quick tour.\nMake images lighter, resize, crop and convert them, all on your own device."
  )
  await poster()
  await still(3.2)
  keyframe()
  await animate(0.6, (t) => (state.slate.opacity = 1 - t))
  closeCue()

  // 1. Add an image
  await spotlight(page.getByTestId("drop-zone"))
  await caption(
    1,
    "Add an image",
    "Drop a file here, choose one, paste with ⌘V or Ctrl+V, or try our sample. JPEG, PNG, WebP, AVIF, HEIC, GIF, TIFF, SVG and more.",
    { side: "right", edge: "bottom", read: 4.2 }
  )
  await clearSpotlight()
  await click(page.getByRole("button", { name: "Try a sample" }))
  await caption(
    null,
    "Smart compression starts straight away",
    "KeepSimp tries several quality levels and keeps the smallest file that still measures close to your original.",
    { side: "right", edge: "bottom", read: 0.4 }
  )
  await waitForResult()
  await hold(2.6)
  await hideCaption()

  // 2. Compare
  const stage = page.getByTestId("compare-stage")
  await scrollIntoFocus(stage, 24)
  await caption(
    2,
    "Compare before you download",
    "Original on the left, compressed on the right. Drag the divider to check every detail.",
    { side: "right", edge: "bottom", read: 1.6 }
  )
  const handle = await center(page.getByTestId("compare-handle"))
  const frameBox = await page.getByTestId("compare-frame").boundingBox()
  await moveTo(handle, 0.7)
  await page.mouse.move(handle.x, handle.y)
  await page.mouse.down()
  for (const [fraction, seconds] of [
    [0.18, 1.4],
    [0.84, 1.8],
    [0.5, 1.1],
  ]) {
    const from = state.cursor.x
    const to = frameBox.x + frameBox.width * fraction
    await animate(seconds, async (t) => {
      state.cursor.x = Math.round(lerp(from, to, t))
      await page.mouse.move(state.cursor.x, handle.y)
    })
  }
  await page.mouse.up()
  await hold(0.4)
  await caption(
    null,
    "Zoom in on fine detail",
    "Switch to 100% or 200% to see edges and texture pixel for pixel.",
    { side: "right", edge: "bottom", read: 0.6 }
  )
  await click(radio("Zoom", "200%"))
  await hold(2.4)
  await click(radio("Zoom", "Fit"))
  await hold(0.6)
  await hideCaption()

  // Results
  const result = page.locator("[aria-busy]")
  await scrollIntoFocus(result, 300)
  await spotlight(result)
  await caption(
    null,
    "See exactly what you saved",
    "File size, dimensions and “Detail kept” are measured from the real output, never estimated.",
    { side: "right", edge: "top", read: 3.4 }
  )
  await clearSpotlight()
  await hideCaption()

  // 3. Format
  const formatGroup = page.getByRole("radiogroup", {
    name: "Output format",
    exact: true,
  })
  await scrollIntoFocus(formatGroup, 120)
  await spotlight(formatGroup, 12)
  await caption(
    3,
    "Choose a format",
    "Same as original keeps your file type. WebP and AVIF are usually much smaller. Auto tries several and keeps the smallest.",
    { side: "left", edge: "bottom", read: 3.4 }
  )
  await clearSpotlight()
  await click(radio("Output format", "AVIF"))
  await waitForResult()
  await hold(1.6)
  await click(radio("Output format", "WebP"))
  await waitForResult()
  await hold(1.4)
  await hideCaption()

  // Compression level and target size
  const levelGroup = page.getByRole("radiogroup", {
    name: "Compression level",
    exact: true,
  })
  await scrollIntoFocus(levelGroup, 160)
  await spotlight(levelGroup, 12)
  await caption(
    null,
    "Decide how hard to compress",
    "Smart, Smallest or High quality do the work for you. Custom sets quality yourself, Lossless keeps every pixel.",
    { side: "left", edge: "bottom", read: 3.4 }
  )
  await clearSpotlight()
  await click(radio("Compression level", "Target size"))
  await caption(
    null,
    "Need a size limit?",
    "Target size finds the best quality that fits, and can shrink dimensions if it has to.",
    { side: "left", edge: "bottom", read: 0.3 }
  )
  const target = page.getByLabel("Maximum file size")
  await click(target, { act: false })
  await target.click({ clickCount: 3 })
  for (const character of "150") {
    await page.keyboard.type(character)
    await render()
    await shoot(5)
  }
  await waitForResult()
  await hold(2.4)
  await hideCaption()

  // 4. Resize
  const sizeGroup = page.getByRole("radiogroup", {
    name: "Output size",
    exact: true,
  })
  await scrollIntoFocus(sizeGroup, 140)
  await caption(
    4,
    "Resize to fit",
    "Pick a percentage, a long edge like 1280 px, or exact width and height in pixels or percent.",
    { side: "left", edge: "bottom", read: 1.4 }
  )
  await click(radio("Output size", "Long edge"))
  await hold(0.5)
  await click(radio("Long edge in pixels", "1280"))
  await waitForResult()
  await hold(1.2)
  await click(radio("Output size", "Custom"))
  await hold(1.6)
  await click(radio("Output size", "50%"))
  await waitForResult()
  await hold(1.2)
  await hideCaption()

  // 5. Crop and rotate
  const cropGroup = page.getByRole("radiogroup", {
    name: "Crop shape",
    exact: true,
  })
  await scrollIntoFocus(cropGroup, 260)
  await caption(
    5,
    "Crop and rotate",
    "Choose a shape, then drag the box or its handles. Exact pixel fields and rotate or flip are one click away.",
    { side: "left", edge: "bottom", read: 1.2 }
  )
  await click(radio("Crop shape", "1:1"))
  await hold(0.4)
  await click(page.getByRole("button", { name: "Crop on image" }))
  await scrollIntoFocus(page.getByRole("img", { name: "Image to crop" }), 40)
  const cropBox = page.getByTestId("crop-box")
  const box = await cropBox.boundingBox()
  const start = {
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height / 2),
  }
  await moveTo(start, 0.6)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  for (const [dx, seconds] of [
    [-120, 1.1],
    [90, 1.2],
  ]) {
    const from = state.cursor.x
    await animate(seconds, async (t) => {
      state.cursor.x = Math.round(lerp(from, start.x + dx, t))
      await page.mouse.move(state.cursor.x, start.y)
    })
  }
  await page.mouse.up()
  await hold(0.8)
  await click(page.getByRole("button", { name: "Done cropping" }))
  await waitForResult()
  await hold(0.8)
  await click(page.getByRole("button", { name: "Rotate right" }))
  await waitForResult()
  await hold(1.4)
  await hideCaption()

  // Advanced
  const advanced = page.getByRole("button", { name: "Advanced options" })
  await scrollIntoFocus(advanced, 200)
  await click(advanced)
  await scrollIntoFocus(advanced, 40, 1.2)
  await caption(
    null,
    "Fine-tune when you need to",
    "Encoder effort, resampling, a background for transparency, colour detail, progressive JPEG and PNG palette size.",
    { side: "left", edge: "bottom", read: 4 }
  )
  await click(advanced)
  await hideCaption()

  // 6. Download
  await scrollIntoFocus(result, 260)
  await spotlight(result)
  await caption(
    6,
    "Download your image",
    "Everything happens on your device. Your photo is never uploaded, and location data is removed.",
    { side: "right", edge: "top", read: 1.4 }
  )
  const downloadLink = page.getByRole("link", {
    name: /^Download (JPEG|PNG|WebP|AVIF)/,
  })
  const downloading = page.waitForEvent("download")
  await click(downloadLink)
  await downloading
  await hold(2.2)
  await clearSpotlight()
  await hideCaption()

  // Outro
  slate(
    "outro",
    `<img src="/brand/keepsimp-mark.svg" alt="">
     <h1>Lighter images, in a minute</h1>
     <p>Free. Private. No account.</p>
     <div class="url">keepsimp.vercel.app/dashboard/image-compressor</div>`
  )
  state.progress = 1
  await animate(0.6, (t) => (state.slate.opacity = t))
  startCue("Lighter images, in a minute.\nFree. Private. No account.")
  await hold(3.2)
  closeCue()
}
