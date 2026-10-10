/**
 * Records a tool tutorial from the real, built app.
 *
 * Every frame is a screenshot of the live page at 1920×1080 (a 1280×720 layout
 * at 1.5× scale). Captions, cursor and highlights are an overlay animated per
 * frame, so timing never depends on how fast the machine is. Text is never
 * scaled or placed on fractional pixels, which keeps it crisp in the encode.
 * Frames are encoded to H.264 (variable bitrate, high ceiling) with WebCodecs
 * inside Chromium and muxed to MP4 with Mediabunny; no system ffmpeg is needed.
 * Keyframes are requested while the picture is moving, so static text never
 * pulses when the encoder starts a new one.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { chromium } from "@playwright/test"
import sharp from "sharp"

const preview = process.env.KEEPSIMP_PREVIEW_URL || "http://127.0.0.1:4180"
const FPS = 30
const WIDTH = 1280
const HEIGHT = 720
const SCALE = 1.5
const BITRATE = Number(process.env.TUTORIAL_BITRATE || 12_000_000)
/** Longest gap between keyframes; most are placed during motion, where they cannot pulse. */
const KEYFRAME_SECONDS = Number(process.env.TUTORIAL_KEYFRAME || 12)
const OUT_DIR = "public/videos"

/**
 * @param {{ name: string, route: string, totalSteps: number, settledTestId: string }} options
 * @param {(tools: object) => Promise<void>} storyboard
 */
export async function record(
  { name, route, totalSteps, settledTestId },
  storyboard
) {
  const browser = await chromium.launch()

  /* ------------------------------------------------------------------ encoder */

  const encoderContext = await browser.newContext()
  const encoder = await encoderContext.newPage()
  const mediabunny = await readFile(
    "node_modules/mediabunny/dist/bundles/mediabunny.mjs"
  )
  await encoder.route("https://encoder.test/**", (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === "/mediabunny.mjs")
      return route.fulfill({ body: mediabunny, contentType: "text/javascript" })
    return route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><script type="module">
  import { Output, Mp4OutputFormat, BufferTarget, EncodedVideoPacketSource, EncodedPacket } from "/mediabunny.mjs"
  let output, source, videoEncoder, last, chain = Promise.resolve(), index = 0, lastKey = -Infinity, fps = 30, keyframe = 360, failure = null
  window.start = async (options) => {
    fps = options.fps
    keyframe = Math.round(options.keyframeSeconds * fps)
    output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() })
    source = new EncodedVideoPacketSource("avc")
    output.addVideoTrack(source, { frameRate: fps })
    await output.start()
    videoEncoder = new VideoEncoder({
      output: (chunk, meta) => { chain = chain.then(() => source.add(EncodedPacket.fromEncodedChunk(chunk), meta)) },
      error: (error) => { failure = error },
    })
    const config = {
      codec: "avc1.640028", width: options.width, height: options.height, framerate: fps,
      bitrate: options.bitrate, bitrateMode: "variable", latencyMode: "quality", avc: { format: "avc" },
      hardwareAcceleration: "prefer-software", contentHint: "text",
    }
    const support = await VideoEncoder.isConfigSupported(config)
    if (!support.supported) throw new Error("H.264 encoding is not supported in this browser.")
    videoEncoder.configure(config)
  }
  window.frame = async (png, repeat, forceKey) => {
    if (failure) throw failure
    if (png) {
      last?.close()
      last = await createImageBitmap(await (await fetch("data:image/png;base64," + png)).blob())
    }
    for (let r = 0; r < repeat; r++) {
      const frame = new VideoFrame(last, { timestamp: Math.round(index * 1e6 / fps), duration: Math.round(1e6 / fps) })
      const keyFrame = (forceKey && r === 0) || index - lastKey >= keyframe
      if (keyFrame) lastKey = index
      videoEncoder.encode(frame, { keyFrame })
      frame.close()
      index++
      while (videoEncoder.encodeQueueSize > 6) await new Promise((resolve) => setTimeout(resolve, 2))
    }
  }
  window.finish = async () => {
    await videoEncoder.flush()
    await chain
    await output.finalize()
    if (failure) throw failure
    const bytes = new Uint8Array(output.target.buffer)
    let binary = ""
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return btoa(binary)
  }
  window.ready = true
  </script>`,
    })
  })
  await encoder.goto("https://encoder.test/")
  await encoder.waitForFunction(() => window.ready)
  await encoder.evaluate((options) => window.start(options), {
    width: WIDTH * SCALE,
    height: HEIGHT * SCALE,
    fps: FPS,
    bitrate: BITRATE,
    keyframeSeconds: KEYFRAME_SECONDS,
  })

  /* ---------------------------------------------------------------------- app */

  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: SCALE,
    reducedMotion: "reduce",
    colorScheme: "light",
    acceptDownloads: true,
  })
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  let frames = 0
  let posterPng = null
  /** Set while the picture is moving, so the next keyframe lands where it is invisible. */
  let wantKey = false

  async function capture() {
    const { data } = await cdp.send("Page.captureScreenshot", {
      format: "png",
      optimizeForSpeed: true,
    })
    return data
  }

  /** Capture one frame of the current page and hold it for `repeat` frames. */
  async function shoot(repeat = 1) {
    const png = await capture()
    const key = wantKey
    wantKey = false
    await encoder.evaluate(
      ([data, count, force]) => window.frame(data, count, force),
      [png, repeat, key]
    )
    frames += repeat
    return png
  }

  /** Hold the current picture without re-capturing (nothing on screen changes). */
  async function still(seconds) {
    const count = Math.round(seconds * FPS)
    if (count > 0) {
      await encoder.evaluate((n) => window.frame(null, n), count)
      frames += count
    }
  }

  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
  const lerp = (a, b, t) => a + (b - a) * t

  const overlayCss = `
  #tour { position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; font-family: var(--font-sans), sans-serif; }
  #tour * { box-sizing: border-box; }
  #tour .cursor { position: absolute; left: 0; top: 0; width: 28px; height: 28px; will-change: transform; filter: drop-shadow(0 2px 3px rgb(0 0 0 / 0.35)); }
  #tour .ripple { position: absolute; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 9999px; border: 3px solid var(--primary); opacity: 0; }
  #tour .spot { position: absolute; border-radius: 18px; opacity: 0; box-shadow: 0 0 0 4000px rgb(10 10 10 / 0.42), 0 0 0 3px var(--primary) inset; }
  #tour .card { position: absolute; width: 470px; padding: 18px 22px 20px; border-radius: 18px; background: oklch(0.2 0.02 186); color: oklch(0.985 0 0); box-shadow: 0 18px 40px rgb(0 0 0 / 0.28); opacity: 0; }
  #tour .card .step { display: inline-block; margin-bottom: 8px; padding: 3px 10px; border-radius: 9999px; background: oklch(0.704 0.14 182.503); color: oklch(0.2 0.02 186); font-size: 12px; line-height: 16px; font-weight: 600; letter-spacing: 0.02em; }
  #tour .card h2 { margin: 0; font-family: var(--font-heading), sans-serif; font-size: 23px; line-height: 29px; font-weight: 500; letter-spacing: -0.01em; }
  #tour .card p { margin: 7px 0 0; font-size: 15px; line-height: 22px; color: oklch(0.86 0.01 186); }
  #tour .progress { position: absolute; left: 0; bottom: 0; height: 4px; background: var(--primary); }
  #tour .slate { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; background: var(--marketing-surface); color: var(--foreground); opacity: 0; }
  #tour .slate img { width: 72px; height: 72px; margin-bottom: 26px; }
  #tour .slate h1 { margin: 0; font-family: var(--font-heading), sans-serif; font-size: 56px; line-height: 62px; font-weight: 500; letter-spacing: -0.04em; }
  #tour .slate p { margin: 14px 0 0; max-width: 640px; font-size: 20px; line-height: 30px; color: var(--muted-foreground); }
  #tour .slate ul { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; max-width: 760px; margin: 30px 0 0; padding: 0; list-style: none; }
  #tour .slate li { padding: 7px 16px; border: 1px solid var(--border); border-radius: 9999px; background: var(--background); font-size: 15px; line-height: 20px; font-weight: 500; }
  #tour .slate .url { margin-top: 30px; font-family: var(--font-mono), monospace; font-size: 16px; color: var(--primary); }
  `

  async function installOverlay() {
    await page.evaluate((css) => {
      document.getElementById("tour")?.remove()
      const style = document.createElement("style")
      style.textContent = css
      const root = document.createElement("div")
      root.id = "tour"
      root.innerHTML = `
        <div class="spot"></div>
        <div class="slate"></div>
        <div class="card"><span class="step"></span><h2></h2><p></p></div>
        <div class="ripple"></div>
        <svg class="cursor" viewBox="0 0 28 28" aria-hidden="true"><path d="M5 3 L5 23 L10.5 18 L14 26 L17.5 24.5 L14 16.8 L21.5 16.8 Z" fill="white" stroke="black" stroke-width="1.6" stroke-linejoin="round"/></svg>
        <div class="progress"></div>`
      root.prepend(style)
      document.body.append(root)
      const q = (selector) => root.querySelector(selector)
      window.__tour = (state) => {
        const cursor = q(".cursor")
        cursor.style.transform = `translate(${state.cursor.x}px, ${state.cursor.y}px)`
        cursor.style.opacity = state.cursor.visible ? "1" : "0"
        const ripple = q(".ripple")
        ripple.style.left = `${state.ripple.x}px`
        ripple.style.top = `${state.ripple.y}px`
        ripple.style.opacity = String(state.ripple.opacity)
        ripple.style.transform = `scale(${state.ripple.scale})`
        const spot = q(".spot")
        spot.style.opacity = String(state.spot.opacity)
        if (state.spot.rect) {
          const { x, y, width, height } = state.spot.rect
          Object.assign(spot.style, {
            left: `${x}px`,
            top: `${y}px`,
            width: `${width}px`,
            height: `${height}px`,
          })
        }
        const card = q(".card")
        card.style.opacity = String(state.card.opacity)
        card.style.left = state.card.side === "left" ? "24px" : "auto"
        card.style.right = state.card.side === "right" ? "24px" : "auto"
        card.style.top = state.card.edge === "top" ? "76px" : "auto"
        card.style.bottom = state.card.edge === "bottom" ? "24px" : "auto"
        q(".card .step").textContent = state.card.step
        q(".card .step").style.display = state.card.step
          ? "inline-block"
          : "none"
        q(".card h2").textContent = state.card.title
        q(".card p").textContent = state.card.body
        const slate = q(".slate")
        slate.style.opacity = String(state.slate.opacity)
        if (slate.dataset.key !== state.slate.key) {
          slate.dataset.key = state.slate.key
          slate.innerHTML = state.slate.html
        }
        q(".progress").style.width = `${state.progress * 100}%`
      }
    }, overlayCss)
    await render()
  }

  const state = {
    cursor: { x: 1000, y: 620, visible: false },
    ripple: { x: 0, y: 0, opacity: 0, scale: 0.4 },
    spot: { opacity: 0, rect: null },
    card: {
      opacity: 0,
      side: "left",
      edge: "bottom",
      step: "",
      title: "",
      body: "",
    },
    slate: { opacity: 0, key: "", html: "" },
    progress: 0,
  }

  async function render() {
    await page.evaluate((s) => window.__tour?.(s), state)
  }

  /** Animate over `seconds`, calling `update(t)` with eased progress per frame. */
  async function animate(seconds, update) {
    const count = Math.max(1, Math.round(seconds * FPS))
    for (let i = 1; i <= count; i++) {
      await update(ease(i / count), i / count)
      await render()
      await shoot()
    }
  }

  async function center(locator) {
    await locator.scrollIntoViewIfNeeded()
    const box = await locator.boundingBox()
    return {
      x: Math.round(box.x + box.width / 2),
      y: Math.round(box.y + box.height / 2),
      box,
    }
  }

  async function moveTo(point, seconds = 0.7) {
    state.cursor.visible = true
    const from = { ...state.cursor }
    await animate(seconds, (t) => {
      state.cursor.x = lerp(from.x, point.x, t)
      state.cursor.y = lerp(from.y, point.y, t)
    })
  }

  async function click(locator, { seconds = 0.7, act = true } = {}) {
    const point = await center(locator)
    await moveTo(point, seconds)
    await page.mouse.move(point.x, point.y)
    if (act) await locator.click()
    state.ripple = { x: point.x, y: point.y, opacity: 0, scale: 0.4 }
    await animate(0.4, (t, raw) => {
      state.ripple.scale = 0.4 + raw * 0.9
      state.ripple.opacity = 1 - raw
    })
    state.ripple.opacity = 0
  }

  /** Caption cues for the WebVTT track, timed from the frames actually written. */
  const cues = []
  let openCue = null
  function closeCue() {
    if (openCue) cues.push({ ...openCue, end: frames / FPS })
    openCue = null
  }
  function startCue(text) {
    closeCue()
    openCue = { start: frames / FPS, text }
  }

  async function caption(
    step,
    title,
    body,
    { side = "left", edge = "bottom", read = 3 } = {}
  ) {
    if (state.card.opacity > 0)
      await animate(0.25, (t) => (state.card.opacity = 1 - t))
    startCue(
      `${step ? `Step ${step} of ${totalSteps}: ` : ""}${title}\n${body}`
    )
    Object.assign(state.card, {
      side,
      edge,
      step: step ? `Step ${step} of ${totalSteps}` : "",
      title,
      body,
    })
    if (step) state.progress = step / totalSteps
    await animate(0.35, (t) => (state.card.opacity = t))
    await hold(read)
  }

  async function hideCaption() {
    if (state.card.opacity > 0)
      await animate(0.25, (t) => (state.card.opacity = 1 - t))
    closeCue()
  }

  async function spotlight(locator, pad = 10) {
    const box = await locator.boundingBox()
    const rect = {
      x: Math.round(box.x - pad),
      y: Math.round(box.y - pad),
      width: Math.round(box.width + pad * 2),
      height: Math.round(box.height + pad * 2),
    }
    if (state.spot.opacity > 0)
      await animate(0.2, (t) => (state.spot.opacity = 1 - t))
    state.spot.rect = rect
    await animate(0.35, (t) => (state.spot.opacity = t))
  }

  async function clearSpotlight() {
    if (state.spot.opacity > 0)
      await animate(0.3, (t) => (state.spot.opacity = 1 - t))
  }

  /** Keep the picture still for `seconds` (cheap: no new screenshots). */
  async function hold(seconds) {
    await render()
    await shoot()
    await still(seconds - 1 / FPS)
  }

  /** Scroll the window to `y` in whole device pixels so text never lands between pixels. */
  async function scrollTo(y, seconds = 0.8) {
    const from = await page.evaluate(() => scrollY)
    const max = await page.evaluate(
      () => document.documentElement.scrollHeight - innerHeight
    )
    const target = Math.max(0, Math.min(max, y))
    if (Math.abs(target - from) > 40) wantKey = true
    await animate(seconds, async (t) => {
      const position = Math.round(lerp(from, target, t) / 2) * 2
      await page.evaluate((top) => scrollTo(0, top), position)
    })
  }

  async function scrollIntoFocus(locator, offset = 90, seconds = 0.8) {
    const top = await locator.evaluate(
      (element) => element.getBoundingClientRect().top + scrollY
    )
    await scrollTo(top - offset, seconds)
  }

  /** Keep recording while the compressor works, until the result matches the settings. */
  async function waitForResult(timeout = 120_000) {
    const root = page.getByTestId(settledTestId)
    const started = Date.now()
    await page.waitForTimeout(450)
    // Waiting plays back faster than real time: one frame per ~150 ms of work.
    while ((await root.getAttribute("data-settled")) !== "true") {
      if (Date.now() - started > timeout)
        throw new Error("Compression did not finish in time.")
      await render()
      await shoot()
      await page.waitForTimeout(100)
    }
    await render()
    await shoot()
  }

  const radio = (group, name) =>
    page
      .getByRole("radiogroup", { name: group, exact: true })
      .getByRole("radio", { name, exact: true })

  function slate(key, html) {
    state.slate.key = key
    state.slate.html = html
  }

  await page.goto(`${preview}${route}`)
  await page.waitForLoadState("networkidle")
  await page.getByRole("button", { name: "Toggle Sidebar" }).first().click()
  await page.mouse.move(1200, 700)
  await installOverlay()

  await storyboard({
    page,
    state,
    FPS,
    lerp,
    shoot,
    still,
    hold,
    render,
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
    /** Ask for a keyframe on the next captured frame (call when motion starts). */
    keyframe: () => {
      wantKey = true
    },
    /** Capture the current frame as the video's poster image. */
    poster: async () => {
      posterPng = await shoot()
    },
  })

  /* ------------------------------------------------------------------ output */

  const base64 = await encoder.evaluate(() => window.finish())
  await mkdir(OUT_DIR, { recursive: true })
  const video = Buffer.from(base64, "base64")
  await writeFile(`${OUT_DIR}/${name}.mp4`, video)
  const stamp = (seconds) => {
    const ms = Math.round(seconds * 1000)
    const pad = (value, size = 2) => String(value).padStart(size, "0")
    return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}.${pad(ms % 1000, 3)}`
  }
  await writeFile(
    `${OUT_DIR}/${name}.vtt`,
    `WEBVTT\n\n${cues.map((cue, i) => `${i + 1}\n${stamp(cue.start)} --> ${stamp(cue.end)}\n${cue.text}\n`).join("\n")}`
  )
  await sharp(Buffer.from(posterPng, "base64"))
    .resize(1280, 720)
    .webp({ quality: 90 })
    .toFile(`${OUT_DIR}/${name}-poster.webp`)
  await browser.close()
  console.log(
    `Wrote ${OUT_DIR}/${name}.mp4 (${(video.length / 1024 / 1024).toFixed(1)} MB, ${frames} frames, ${(frames / FPS).toFixed(1)} s), captions and poster`
  )
}
