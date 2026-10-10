/** Storyboard for the animation converter tutorial. */
export const options = {
  name: "animation-converter-tutorial",
  route: "/dashboard/animation-converter/",
  totalSteps: 6,
  settledTestId: "animation-converter",
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
     <h1>Animation converter</h1>
     <p>A quick tour: convert GIFs, clips and animations, trim them, and fit them where they are going.</p>
     <ul><li>GIF, WebP, APNG</li><li>MP4 and WebM</li><li>Trim and speed</li><li>Size limits</li><li>Frames</li></ul>`
  )
  state.slate.opacity = 1
  await render()
  startCue(
    "Animation converter: a quick tour.\nConvert GIFs, clips and animations, trim them, and fit them where they are going."
  )
  await poster()
  await still(3.2)
  keyframe()
  await animate(0.6, (t) => (state.slate.opacity = 1 - t))
  closeCue()

  // 1. Add animations
  await spotlight(page.getByTestId("drop-zone"))
  await caption(
    1,
    "Add your animations",
    "Drop animated GIF, APNG or WebP files, a short video, or several still images to build an animation.",
    { side: "right", edge: "bottom", read: 3.8 }
  )
  await clearSpotlight()
  await click(page.getByRole("button", { name: "Try a sample" }))
  await caption(
    null,
    "Converted straight away",
    "Each file is converted on your device. The line under the preview shows the size before and after.",
    { side: "right", edge: "bottom", read: 0.4 }
  )
  await waitForResult()
  await spotlight(page.getByTestId("facts"), 10)
  await hold(2.6)
  await clearSpotlight()
  await hideCaption()

  // 2. Pick a format
  const formats = page.getByRole("radiogroup", { name: "Format", exact: true })
  await scrollIntoFocus(formats, 330)
  await spotlight(formats, 12)
  await caption(
    2,
    "Pick a format",
    "WebP for small files on the web, GIF to play everywhere, APNG for exact colour, or the frames themselves.",
    { side: "left", edge: "bottom", read: 3.4 }
  )
  await clearSpotlight()
  const video = radio("Format", "MP4")
  if (await video.isEnabled()) {
    await click(video)
    await waitForResult()
    await caption(
      null,
      "Video is smaller still",
      "An MP4 is often a twentieth of the GIF. It has no transparency, and needs a video player.",
      { side: "left", edge: "bottom", read: 2.2 }
    )
  }
  await click(radio("Format", "GIF"))
  await waitForResult()
  await hold(0.8)
  await hideCaption()

  // 3. Trim and timing
  const trim = page.getByTestId("trim-bar")
  await scrollIntoFocus(trim, 260)
  await spotlight(trim, 12)
  await caption(
    3,
    "Keep the part you want",
    "Drag the two handles over the strip of frames, or type a start and an end.",
    { side: "left", edge: "top", read: 1.6 }
  )
  const end = page.getByLabel("End (s)")
  await click(end, { act: false })
  await end.click({ clickCount: 3 })
  await page.keyboard.type("1.2")
  await page.keyboard.press("Enter")
  await render()
  await shoot(12)
  await waitForResult()
  await clearSpotlight()
  const speed = page.getByRole("radiogroup", { name: "Speed", exact: true })
  await scrollIntoFocus(speed, 300)
  await caption(
    null,
    "Speed, frame rate and direction",
    "Speed it up or slow it down, drop frames for a smaller file, reverse it or make a boomerang.",
    { side: "left", edge: "top", read: 1 }
  )
  await click(radio("Speed", "1.5×"))
  await waitForResult()
  const boomerang = page.getByRole("switch", { name: "Boomerang" })
  await scrollIntoFocus(boomerang, 360)
  await click(boomerang)
  await waitForResult()
  await hold(1.2)
  await hideCaption()

  // 4. Check a frame
  await scrollTo(0)
  await caption(
    4,
    "Check a frame",
    "Step to any frame, then drag the handle across the original and the result.",
    { side: "right", edge: "bottom", read: 1.4 }
  )
  const next = page.getByRole("button", { name: "Next frame" })
  for (let step = 0; step < 3; step++) {
    await click(next)
    await hold(0.5)
  }
  const handle = await center(page.getByTestId("compare-handle"))
  await moveTo(handle, 0.7)
  await page.mouse.move(handle.x, handle.y)
  await page.mouse.down()
  for (const [dx, seconds] of [
    [-150, 1.3],
    [130, 1.5],
    [0, 0.9],
  ]) {
    const from = state.cursor.x
    await animate(seconds, async (t) => {
      state.cursor.x = Math.round(lerp(from, handle.x + dx, t))
      await page.mouse.move(state.cursor.x, handle.y)
    })
  }
  await page.mouse.up()
  await hold(0.8)
  await hideCaption()

  // 5. Fit a destination
  const destinations = page.getByRole("radiogroup", {
    name: "Destination",
    exact: true,
  })
  await scrollIntoFocus(destinations, 200)
  await spotlight(destinations, 12)
  await caption(
    5,
    "Fit where it is going",
    "A destination sets the format, the size and the largest file it accepts, with the source for each limit.",
    { side: "left", edge: "bottom", read: 3 }
  )
  await clearSpotlight()
  await click(radio("Destination", "Discord emoji"))
  await waitForResult()
  await caption(
    null,
    "Measured, not estimated",
    "The tool lowers quality, then frame rate, then size until the real file fits, and says what it changed.",
    { side: "left", edge: "bottom", read: 0.6 }
  )
  await scrollTo(0)
  await spotlight(page.getByTestId("facts"), 10)
  await hold(3)
  await clearSpotlight()
  await hideCaption()

  // 6. Download
  const summary = page.getByTestId("summary-bar")
  await scrollIntoFocus(summary, 250)
  await spotlight(summary)
  await caption(
    6,
    "Download",
    "Download one file or the whole batch as a ZIP. Nothing is uploaded: everything runs in your browser.",
    { side: "right", edge: "top", read: 1.4 }
  )
  const downloading = page.waitForEvent("download")
  await click(page.getByRole("button", { name: "Download all (ZIP)" }))
  await downloading
  await hold(2.4)
  await clearSpotlight()
  await hideCaption()

  // Outro
  slate(
    "outro",
    `<img src="/brand/keepsimp-mark.svg" alt="">
     <h1>Keep your animations moving</h1>
     <p>Free. Private. No account.</p>
     <div class="url">keepsimp.vercel.app/dashboard/animation-converter</div>`
  )
  state.progress = 1
  await animate(0.6, (t) => (state.slate.opacity = t))
  startCue("Keep your animations moving.\nFree. Private. No account.")
  await hold(3.2)
  closeCue()
}
