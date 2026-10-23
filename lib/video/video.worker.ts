/// <reference lib="webworker" />
/**
 * Reads and writes video files off the page. Results are written to the
 * page's folder on disk (scratch.ts) where the browser allows, opened again
 * and checked before they are handed over.
 */
import { levelProblems, writtenProblems } from "./check"
import { fastStart } from "./faststart"
import { outputInfo } from "./formats"
import { VideoProblem } from "./mediabunny-video"
import type {
  VideoLevel,
  ConvertJob,
  IndexPlace,
  ReadJob,
  VideoRequest,
  VideoResponse,
} from "./protocol"
import { removeScratch, scratchFile } from "./scratch"
import type { Plan } from "./settings"
import type { Layers, SoundGain } from "./effects"
import { captionLayout, overlayRect } from "@/lib/animation/effects"
import { renderCaption } from "@/lib/animation/caption"
import { gainFor, SAFE_CEILING } from "@/lib/audio/level"
import type { Looks } from "./looks"
import { MOST_PASSES, nextPass, passStands, willMiss } from "./target"
import { soundStart } from "./sound-start"
import { sourceTime } from "./trim"

declare const self: DedicatedWorkerGlobalScope

const UNREADABLE =
  "This file could not be read. It may be damaged, or of a kind not read here."
const UNWRITTEN =
  "This video could not be written. Try again, or choose another format or codec."

let generation = 0
let written = 0
/** The job running now, and how to stop it. */
let running: {
  id: string
  job: "read" | "convert"
  generation: number
  stop: AbortController
} | null = null

const post = (message: VideoResponse, transfer: Transferable[] = []) =>
  self.postMessage(message, transfer)

const engine = () => import("mediabunny")
const engineFiles = () => import("./mediabunny-video")
const soundFiles = () => import("@/lib/audio/mediabunny-audio")

const said = (error: unknown, fallback: string) =>
  error instanceof VideoProblem ? error.message : fallback

async function read(job: ReadJob, stop: AbortController) {
  const send = (message: VideoResponse, transfer: Transferable[] = []) => {
    if (!stop.signal.aborted) post(message, transfer)
  }
  try {
    const mediabunny = await engine()
    const { readVideo } = await engineFiles()
    const { facts, poster } = await readVideo(
      mediabunny,
      job.file,
      job.container
    )
    send(
      { type: "done", id: job.id, job: "read", facts, poster },
      poster ? [poster] : []
    )
  } catch (error) {
    send({ type: "open-error", id: job.id, message: said(error, UNREADABLE) })
  }
}

/** One pass: the file written with a bitrate, or null when it was stopped because it would miss. */
async function writePass(
  job: ConvertJob,
  plan: Plan,
  stop: AbortController,
  pass: { number: number; of: number; limit: number | null },
  send: (message: VideoResponse) => void,
  software: boolean,
  gain: SoundGain | null
): Promise<
  { missed: number } | { file: Blob; scratch: string | null; limited: number }
> {
  const mediabunny = await engine()
  const { convertVideo, joinParts } = await engineFiles()
  const name = `${job.id}-${++written}.${outputInfo[plan.container].extension}`
  const scratch = await scratchFile(job.folder, name)
  const memory = scratch ? null : new mediabunny.BufferTarget()
  const target =
    memory ?? new mediabunny.StreamTarget(scratch!.writable, { chunked: true })
  let bytes = 0
  target.on("write", ({ end }) => {
    if (end > bytes) bytes = end
  })
  // A pass that will miss its limit is stopped early; the job's Stop ends it too.
  const own = new AbortController()
  const end = () => own.abort()
  stop.signal.addEventListener("abort", end, { once: true })
  const watch: { miss: number | null } = { miss: null }
  let last = 0
  let limited = 0
  try {
    const write = plan.cut?.mode === "join" ? joinParts : convertVideo
    // With a soundtrack, the picture is written first, alone, then put
    // together with the sound made for it; the picture's pass is most of
    // the work.
    const music = plan.track && job.track ? job.track : null
    const picture = music
      ? await pictureFirst(job, plan, own.signal, software, (fraction) =>
          send({
            type: "progress",
            id: job.id,
            key: job.key,
            fraction: fraction * 0.8,
            pass: pass.number,
          })
        )
      : null
    const layers = await layersFor(plan, job.logo ?? null)
    const made = await (picture
      ? (async () => {
          try {
            const { withSoundtrack } = await engineFiles()
            return await withSoundtrack(
              mediabunny,
              picture.file,
              job.file,
              music!,
              plan,
              target,
              { signal: own.signal, gain }
            )
          } finally {
            await picture.remove()
          }
        })()
      : write(mediabunny, job.file, plan, target, {
          signal: own.signal,
          software,
          gain,
          layers,
          onProgress: (fraction) => {
            if (
              pass.limit !== null &&
              pass.number < pass.of &&
              watch.miss === null &&
              willMiss(pass.limit, bytes, fraction)
            ) {
              watch.miss = bytes / fraction
              own.abort()
              return
            }
            const now = Date.now()
            if (now - last < 250) return
            last = now
            send({
              type: "progress",
              id: job.id,
              key: job.key,
              fraction,
              pass: pass.number,
            })
          },
        }))
    limited = (made as { limited?: number } | undefined)?.limited ?? 0
  } catch (error) {
    scratch?.close()
    if (scratch) await removeScratch(job.folder, name)
    if (watch.miss !== null && !stop.signal.aborted)
      return { missed: watch.miss }
    throw error
  } finally {
    stop.signal.removeEventListener("abort", end)
  }
  const file = scratch
    ? await scratch.file()
    : new Blob([memory!.buffer!], { type: outputInfo[plan.container].mime })
  return {
    file: new Blob([file], { type: outputInfo[plan.container].mime }),
    scratch: scratch ? name : null,
    limited,
  }
}

/**
 * Text and a logo as pictures the size of the result, drawn over its
 * frames: the text by the animation converter's own captions (the site's
 * Outfit, wrapped and outlined), the logo where its corner puts it, as wide
 * and as solid as asked.
 */
async function layersFor(
  plan: Plan,
  logo: Blob | null
): Promise<Layers | null> {
  const overlay = plan.overlay
  if (!overlay || plan.video.action !== "encode") return null
  const { width, height } = plan.video
  let caption: Layers["caption"] = null
  const layout =
    overlay.caption &&
    captionLayout({ width, height }, { ...overlay.caption, uppercase: false })
  if (overlay.caption && layout) {
    const pixels = await renderCaption(layout)
    const canvas = new OffscreenCanvas(width, height)
    canvas
      .getContext("2d")!
      .putImageData(
        new ImageData(
          pixels.data as ImageDataArray,
          pixels.width,
          pixels.height
        ),
        0,
        0
      )
    caption = {
      layer: canvas,
      from: overlay.caption.from,
      until: overlay.caption.until,
    }
  }
  let logoLayer: OffscreenCanvas | null = null
  if (overlay.logo && logo) {
    const bitmap = await createImageBitmap(logo).catch(() => null)
    if (!bitmap)
      throw new VideoProblem("The logo could not be read as a picture.")
    const place = overlayRect(
      { width, height },
      { width: bitmap.width, height: bitmap.height },
      overlay.logo.corner,
      overlay.logo.size
    )
    logoLayer = new OffscreenCanvas(width, height)
    const context = logoLayer.getContext("2d")!
    context.globalAlpha = overlay.logo.opacity / 100
    context.drawImage(bitmap, place.x, place.y, place.width, place.height)
    bitmap.close()
  }
  return { logo: logoLayer, caption }
}

/** The picture alone, written by the plan with no sound, into a file of its own to put together with a soundtrack. */
async function pictureFirst(
  job: ConvertJob,
  plan: Plan,
  signal: AbortSignal,
  software: boolean,
  onProgress: (fraction: number) => void
) {
  const mediabunny = await engine()
  const { convertVideo } = await engineFiles()
  const layers = await layersFor(plan, job.logo ?? null)
  const name = `${job.id}-${++written}-picture.${outputInfo[plan.container].extension}`
  const scratch = await scratchFile(job.folder, name)
  const memory = scratch ? null : new mediabunny.BufferTarget()
  const target =
    memory ?? new mediabunny.StreamTarget(scratch!.writable, { chunked: true })
  const remove = async () => {
    scratch?.close()
    if (scratch) await removeScratch(job.folder, name)
  }
  try {
    await convertVideo(
      mediabunny,
      job.file,
      { ...plan, audio: { action: "drop" }, track: null },
      target,
      { signal, software, onProgress, layers }
    )
  } catch (error) {
    await remove()
    throw error
  }
  const file = scratch
    ? await scratch.file()
    : new Blob([memory!.buffer!], { type: outputInfo[plan.container].mime })
  return { file, remove }
}

/** Encoders that failed in this worker are not asked again. */
const safe = { sound: false, picture: false }

async function convert(job: ConvertJob, stop: AbortController) {
  const send = (message: VideoResponse) => {
    if (!stop.signal.aborted) post(message)
  }
  try {
    await writeJob(job, stop, send)
  } catch (first) {
    let error = first
    // An encoder can fail when another program holds the device's own
    // (a video call, a screen recorder) or many run at once: once, the job
    // is written again with ours for the sound and software for the picture.
    const encoding =
      error instanceof DOMException && !(error instanceof VideoProblem)
    if (!stop.signal.aborted && encoding && !(safe.sound && safe.picture)) {
      console.error(
        "An encoder failed; writing again with the safe ones:",
        `${(error as DOMException).name}: ${(error as DOMException).message}`
      )
      safe.sound = true
      safe.picture = true
      try {
        await writeJob(job, stop, send)
        return
      } catch (again) {
        error = again
      }
    }
    // The page shows a plain sentence; what the browser said is kept for whoever looks.
    if (!(error instanceof VideoProblem) && !stop.signal.aborted)
      console.error(
        "The video could not be written:",
        error instanceof Error
          ? `${error.name}: ${error.message}\n${error.stack}`
          : error
      )
    if (stop.signal.aborted) send({ type: "abandoned", id: job.id })
    else
      send({
        type: "error",
        id: job.id,
        key: job.key,
        message: said(error, UNWRITTEN),
      })
  }
}

/** Write a job's file, in passes for a size limit, and say what was made. Throws what it cannot. */
async function writeJob(
  job: ConvertJob,
  stop: AbortController,
  send: (message: VideoResponse) => void
) {
  const { plan } = job
  const made: {
    file: Blob
    scratch: string | null
    index: IndexPlace | null
    plan: Plan
    limited: number
  }[] = []
  try {
    const mediabunny = await engine()
    const { readBack, looksAlike } = await engineFiles()
    // Seconds the sound encoder puts before the sound, skipped by an edit list.
    let priming = 0
    if (plan.audio.action === "encode" && plan.audio.codec === "aac") {
      // The sound as written: the soundtrack's, or the video's own.
      const written = plan.track ?? job.facts.audio!
      const { aacEncoding, readyEncoder } = await soundFiles()
      if (safe.sound) await readyEncoder(mediabunny, "aac")
      // An encoder that keeps all of the sound (the browser's, or ours), and its priming.
      const samples = await aacEncoding(
        mediabunny,
        written.sampleRate,
        written.channels,
        plan.audio.bitrate
      )
      priming = samples / written.sampleRate
    }
    // The sound measured as it will be written, for the gain that reaches its loudness.
    let gain: SoundGain | null = null
    let level: Omit<VideoLevel, "after" | "limited"> | null = null
    if (plan.audio.action === "encode" && plan.audio.loudness !== null) {
      const { measureSound, measureSoundtrack } = await engineFiles()
      const before =
        plan.track && job.track
          ? await measureSoundtrack(
              mediabunny,
              job.file,
              job.track,
              plan,
              stop.signal
            )
          : await measureSound(mediabunny, job.file, plan, stop.signal)
      if (stop.signal.aborted) return
      const chosen = gainFor(
        {
          mode: "loudness",
          target: plan.audio.loudness,
          ceiling: SAFE_CEILING,
          louder: 0,
        },
        before
      )
      gain = { db: chosen.db, ceiling: chosen.ceiling }
      level = {
        target: plan.audio.loudness,
        before,
        db: chosen.db,
        notes: chosen.notes,
      }
    }
    const limit = plan.video.action === "encode" ? plan.video.target : null
    const passes = limit === null ? 1 : MOST_PASSES
    let next =
      plan.video.action === "encode"
        ? {
            bitrate: plan.video.bitrate,
            width: plan.video.width,
            height: plan.video.height,
          }
        : null
    let chosen: (typeof made)[number] | null = null
    // The pass before at the same size, to tell an encoder that will not come down.
    let before: { bitrate: number; written: number } | undefined
    const advance = (written: number, expected: number) => {
      const was = next!
      const step = nextPass(was, limit!, written, expected, before)
      next = { bitrate: step.bitrate, width: step.width, height: step.height }
      before = step.smaller ? undefined : { bitrate: was.bitrate, written }
    }
    for (let number = 1; number <= passes && !chosen; number++) {
      const passPlan: Plan =
        plan.video.action === "encode" && next
          ? {
              ...plan,
              width: next.width,
              height: next.height,
              video: { ...plan.video, ...next },
            }
          : plan
      // What the pass comes to if the encoder keeps to its bitrate.
      const expected =
        plan.video.action === "encode" && next && limit !== null
          ? limit + ((next.bitrate - plan.video.bitrate) * plan.length) / 8
          : 0
      const pass = await writePass(
        job,
        passPlan,
        stop,
        { number, of: passes, limit },
        send,
        safe.picture,
        gain
      )
      if (stop.signal.aborted) return
      if ("missed" in pass) {
        advance(pass.missed, expected)
        continue
      }
      let file = pass.file
      let index: IndexPlace | null = null
      if (plan.container === "mp4" || plan.container === "mov") {
        const moved = await fastStart(file, {
          edit: priming ? (held) => soundStart(held, priming) : undefined,
        })
        file = moved.file
        index = moved.moved ? "front" : moved.reason
      }
      const result = {
        file,
        scratch: pass.scratch,
        index,
        plan: passPlan,
        limited: pass.limited,
      }
      made.push(result)
      if (limit === null || passStands(limit, file.size, number === passes))
        chosen = result
      else advance(file.size, expected)
    }
    // The last pass, unless an earlier one kept under the limit and it did not.
    const under = made.filter((one) => limit === null || one.file.size <= limit)
    chosen ??= under.at(-1) ?? made.at(-1)!
    for (const other of made)
      if (other !== chosen && other.scratch)
        await removeScratch(job.folder, other.scratch)
    const back = await readBack(mediabunny, chosen.file, plan.container)
    // The result's sound measured as it was written.
    const heard: VideoLevel | null = level && {
      ...level,
      after: await (
        await engineFiles()
      ).measureSound(mediabunny, chosen.file, null),
      limited: chosen.limited,
    }
    const problems = [
      ...(heard ? levelProblems(heard) : []),
      ...writtenProblems(
        chosen.plan,
        back.facts,
        {
          duration: plan.length,
          frameRate: job.facts.video?.frameRate ?? null,
        },
        back.decoded
      ),
    ]
    // How close it looks, for a picture encoded again and not turned,
    // cropped or faded (they are meant to look different).
    let looks: Looks | null = null
    if (
      plan.video.action === "encode" &&
      !plan.rotate &&
      !plan.flip &&
      !plan.crop &&
      !plan.overlay &&
      !plan.fade.in &&
      !plan.fade.out
    )
      try {
        const parts = plan.cut?.parts
        looks = await looksAlike(
          mediabunny,
          job.file,
          chosen.file,
          {
            width: chosen.plan.width,
            height: chosen.plan.height,
            duration: plan.length,
          },
          // A moment of the result is the speed times further into what is kept.
          (time) =>
            parts ? sourceTime(time * plan.speed, parts) : time * plan.speed
        )
      } catch {
        looks = null
      }
    if (stop.signal.aborted) return
    send({
      type: "done",
      id: job.id,
      job: "convert",
      key: job.key,
      file: chosen.file,
      looks,
      scratch: chosen.scratch,
      written: back.facts,
      problems,
      index: chosen.index,
      passes: made.length,
      level: heard,
      resized:
        chosen.plan.width !== plan.width
          ? { width: chosen.plan.width, height: chosen.plan.height }
          : null,
    })
  } catch (error) {
    for (const one of made)
      if (one.scratch) await removeScratch(job.folder, one.scratch)
    throw error
  }
}

/**
 * Stop a job and ask to be replaced. Cancelling can wait for ever on an
 * encoder, so the job is not waited for: the page ends this worker.
 */
function retire(job: NonNullable<typeof running>) {
  job.stop.abort()
  running = null
  post({ type: "retired", id: job.id })
}

self.onmessage = (event: MessageEvent<VideoRequest>) => {
  const message = event.data
  if (message.type === "supersede") {
    generation = message.generation
    if (running?.job === "convert" && running.generation < generation)
      retire(running)
    return
  }
  if (message.type === "forget") {
    if (running?.id === message.id) retire(running)
    return
  }
  const stop = new AbortController()
  running = {
    id: message.id,
    job: message.job,
    generation: message.generation,
    stop,
  }
  const done = () => {
    if (running?.stop === stop) running = null
  }
  if (message.job === "read") void read(message, stop).finally(done)
  else if (message.generation < generation) {
    post({ type: "abandoned", id: message.id })
    done()
  } else void convert(message, stop).finally(done)
}
