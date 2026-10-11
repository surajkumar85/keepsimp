/** Storyboard for the PDF compressor tutorial. */
export const options = {
  name: "pdf-compressor-tutorial",
  route: "/dashboard/pdf-compressor/",
  totalSteps: 6,
  settledTestId: "pdf-compressor",
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
     <h1>PDF compressor</h1>
     <p>A quick tour: see what makes a PDF big, make it smaller, and check the result before you download.</p>
     <ul><li>What makes it big</li><li>Levels</li><li>A size limit</li><li>Scans</li><li>Before and after</li></ul>`
  )
  state.slate.opacity = 1
  await render()
  startCue(
    "PDF compressor: a quick tour.\nSee what makes a PDF big, make it smaller, and check the result."
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
    { side: "right", edge: "bottom", read: 3.2 }
  )
  await clearSpotlight()
  await click(page.getByRole("button", { name: "Try a sample" }))
  await waitForResult()
  const before = page.getByTestId("audit-before")
  await before.getByTestId("audit-part").first().waitFor()
  await render()
  await caption(
    null,
    "Read on your device",
    "The file is opened in your browser. Nothing is uploaded.",
    { side: "right", edge: "bottom", read: 2.2 }
  )
  await hideCaption()

  // 2. What makes it big
  await scrollIntoFocus(before, 140)
  await spotlight(before, 12)
  await caption(
    2,
    "See what makes it big",
    "The file's size, part by part. Here it is mostly pictures, and data left behind by the app that made it.",
    { side: "right", edge: "bottom", read: 3.6 }
  )
  await clearSpotlight()
  await hideCaption()

  // 3. How much to compress
  await scrollTo(0)
  const levels = page.getByTestId("level-panel")
  await spotlight(levels, 12)
  await caption(
    3,
    "Choose how much to compress",
    "Lossless changes nothing you can see. Balanced makes pictures smaller so they still look the same. Strong goes further.",
    { side: "left", edge: "bottom", read: 3.8 }
  )
  await click(radio("How much to compress", "To a size"))
  await page.getByRole("radiogroup", { name: "Come out under" }).waitFor()
  await render()
  await caption(
    null,
    "Or name a size",
    "For a form or an inbox with a limit, such as 200 KB. You get the best quality that fits.",
    { side: "left", edge: "bottom", read: 3 }
  )
  await click(radio("How much to compress", "Balanced"))
  await render()
  await caption(
    null,
    "Scans get special care",
    "A scanned page can be rebuilt as sharp letters over soft paper, far smaller than a picture of it.",
    { side: "left", edge: "bottom", read: 3.2 }
  )
  await clearSpotlight()
  await hideCaption()

  // 4. Compress
  const result = page.getByTestId("result-card")
  await scrollIntoFocus(result, 160)
  await spotlight(result, 12)
  await caption(
    4,
    "Compress",
    "Pictures are taken one at a time. Each is only swapped for a smaller one that has been checked.",
    { side: "left", edge: "bottom", read: 2.4 }
  )
  await click(page.getByRole("button", { name: "Compress PDF" }))
  await waitForResult()
  await page.getByTestId("saving").waitFor()
  // The card has grown with its result: the light follows it.
  await scrollIntoFocus(result, 160)
  await spotlight(result, 12)
  await hold(1.6)
  await caption(
    null,
    "Smaller, and still text",
    "Pages stay pages: words can be selected and searched, and links and bookmarks keep working.",
    { side: "left", edge: "bottom", read: 3.2 }
  )
  await clearSpotlight()
  await hideCaption()

  // 5. Before and after
  const compare = page.getByTestId("compare")
  await page.locator('[data-testid=compare][data-drawn="true"]').waitFor()
  await scrollIntoFocus(compare, 120)
  await spotlight(compare, 12)
  await caption(
    5,
    "Compare before and after",
    "Pages are drawn both ways and compared for you. Drag the divider to look yourself.",
    { side: "right", edge: "bottom", read: 2 }
  )
  const slider = compare.getByRole("slider", { name: "Comparison position" })
  await slider.focus()
  for (let step = 0; step < 14; step++) {
    await page.keyboard.press("ArrowLeft")
    await render()
    await hold(0.06)
  }
  for (let step = 0; step < 24; step++) {
    await page.keyboard.press("ArrowRight")
    await render()
    await hold(0.06)
  }
  await hold(1)
  await clearSpotlight()
  await hideCaption()

  // 6. Download
  await scrollTo(0)
  await scrollIntoFocus(result, 160)
  await spotlight(result, 12)
  await caption(
    6,
    "Download",
    "Read the result in the reader if you like, then download it. Several files come as one ZIP.",
    { side: "left", edge: "bottom", read: 2.4 }
  )
  const downloading = page.waitForEvent("download")
  await click(page.getByRole("link", { name: "Download PDF" }))
  await downloading
  await hold(2)
  await clearSpotlight()
  await hideCaption()

  // Outro
  slate(
    "outro",
    `<img src="/brand/keepsimp-mark.svg" alt="">
     <h1>A smaller PDF, with its words still sharp</h1>
     <p>Free. Private. No account.</p>
     <div class="url">keepsimp.vercel.app/dashboard/pdf-compressor</div>`
  )
  state.progress = 1
  await animate(0.6, (t) => (state.slate.opacity = t))
  startCue(
    "A smaller PDF, with its words still sharp.\nFree. Private. No account."
  )
  await hold(3.2)
  closeCue()
}
