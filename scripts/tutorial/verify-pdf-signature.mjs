/** Storyboard for the Verify a PDF signature tutorial. */
export const options = {
  name: "verify-pdf-signature-tutorial",
  route: "/dashboard/verify-pdf-signature/",
  totalSteps: 4,
  settledTestId: "pdf-editor",
}

export default async function storyboard({
  page,
  still,
  state,
  hold,
  render,
  shoot,
  animate,
  click,
  caption,
  hideCaption,
  spotlight,
  clearSpotlight,
  slate,
  startCue,
  closeCue,
  keyframe,
  poster,
}) {
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

  // Title
  slate(
    "intro",
    `<img src="/brand/keepsimp-mark.svg" alt="">
     <h1>Verify a PDF signature</h1>
     <p>A quick tour: check a PDF's digital signatures on your device, and see what changed after each.</p>
     <ul><li>Open a signed PDF</li><li>Does it hold?</li><li>Who and when</li><li>What changed after</li></ul>`
  )
  state.slate.opacity = 1
  await render()
  startCue(
    "Verify a PDF signature: a quick tour.\nCheck a PDF's signatures, on your device."
  )
  await poster()
  await still(3.2)
  keyframe()
  await animate(0.6, (t) => (state.slate.opacity = 1 - t))
  closeCue()

  // 1. Open
  await spotlight(page.getByTestId("drop-zone"))
  await caption(
    1,
    "Open a signed PDF",
    "Drop it, choose it or paste it. Its signatures are read and checked as it opens.",
    { side: "right", edge: "bottom", read: 3 }
  )
  await clearSpotlight()
  await click(page.getByRole("button", { name: "Try a sample" }))
  const one = page.getByTestId("signature").first()
  await until(
    async () =>
      (await layer.count()) > 0 &&
      (await layer.isVisible()) &&
      (await one.count()) > 0
  )
  await hold(0.8)
  await hideCaption()

  // 2. Does it hold?
  await spotlight(one.getByTestId("signature-verdict"), 8)
  await caption(
    2,
    "Does it still hold?",
    "The signature is checked against the bytes it covers. Changed by even one byte, it does not hold.",
    { side: "left", edge: "bottom", read: 3.4 }
  )
  await clearSpotlight()
  await hideCaption()

  // 3. Who and when
  await spotlight(one.getByText(/Signed with the certificate of/), 8)
  await caption(
    3,
    "Who, and when",
    "Whose certificate signed, and who issued it. Whom to trust is yours to judge: no list of issuers is kept here.",
    { side: "left", edge: "bottom", read: 3.6 }
  )
  await clearSpotlight()
  await hideCaption()

  // 4. What changed after
  await spotlight(one.getByTestId("signature-changes"), 8)
  await caption(
    4,
    "What changed after",
    "This file was added to after it was signed: the witness's name was typed in. The list says so.",
    { side: "left", edge: "bottom", read: 3.6 }
  )
  await clearSpotlight()
  await click(one.getByRole("button", { name: "Show on page 1" }))
  await hold(1)
  await hideCaption()
  await hold(0.6)
}
