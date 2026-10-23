/**
 * Starting the agent tools on the agent page: the engines they use, the
 * interface the bridge calls, and the tools registered with WebMCP where the
 * browser offers it. Everything stops when the page goes.
 */
import { JsonClient } from "@/lib/json-workspace/client"
import { PdfClient } from "@/lib/pdf-merger/client"
import { PdfEngine } from "./pdf-engine"
import { fontUrls, screenFamily } from "@/lib/pdf-editor/fonts"
import { laidOut } from "@/lib/pdf-editor/laid-out"
import type { EditText, StartOcr } from "./pdf-edit"
import { CompressorClient, rasteriseSvg } from "@/lib/image-compressor/client"
import { ResizerPool } from "@/lib/image-resizer/client"
import { ConverterPool } from "@/lib/image-converter/client"
import { AnimationPool } from "@/lib/animation/client"
import { AudioPool, decodeOnPage } from "@/lib/audio/client"
import type { AudioJob, AudioResponse } from "@/lib/audio/protocol"
import { startTranscription } from "@/lib/audio/transcribe-client"
import { startVideo } from "@/lib/audio/video-client"
import { VideoPool } from "@/lib/video/client"
import type {
  VideoJob as VideoFileJob,
  VideoResponse,
} from "@/lib/video/protocol"
import { browserAsker } from "@/lib/video/probe"
import { clearScratch } from "@/lib/video/scratch"
import { themeColours } from "@/lib/audio/theme-colours"
import { CompressorEngine } from "./image-engines"
import { PoolJobs } from "./pool-jobs"
import type { ConvertJob, ResizeJob } from "./image"
import type { AnimationJob } from "./animation"
import type { ResizerResponse } from "@/lib/image-resizer/protocol"
import type { ConverterResponse } from "@/lib/image-converter/protocol"
import type { AnimationResponse } from "@/lib/animation/protocol"
import { recognise, startTesseract } from "@/lib/pdf-editor/tesseract"
import { sampleSize } from "@/lib/color/sample"
import { drawStrip, stripSize } from "@/lib/color/strip"
import { Agent } from "./agent"
import { bridgeApi, type BridgeApi } from "./bridge-api"
import { agentTools } from "./tools"
import { modelContextOf, registerTools } from "./webmcp"

declare global {
  interface Window {
    keepsimp?: BridgeApi
    /** Set by the bridge, to be told how far a call is. */
    keepsimpBridgeProgress?: (
      id: string,
      fraction: number,
      note: string
    ) => void
  }
}

async function sampleImage(file: Blob) {
  const bitmap = await createImageBitmap(file)
  try {
    const { width, height } = sampleSize(bitmap.width, bitmap.height)
    const canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext("2d", { willReadFrequently: true })!
    context.drawImage(bitmap, 0, 0, width, height)
    return context.getImageData(0, 0, width, height)
  } finally {
    bitmap.close()
  }
}

/** The palette page's PNG strip, drawn the same way. */
function paletteStrip(colors: string[]) {
  const { width, height } = stripSize(colors.length)
  const canvas = new OffscreenCanvas(width, height)
  drawStrip(canvas.getContext("2d")!, colors)
  return canvas.convertToBlob({ type: "image/png" })
}

/** Saves a file as a download, as the tools' pages do: an untyped link to the bytes. */
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(
    new Blob([blob], { type: "application/octet-stream" })
  )
  const link = document.createElement("a")
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

const fonts = new Map<string, Promise<ArrayBuffer>>()
/** The editor's fonts, read from the site once and made ready for measuring, as the editor does. */
const editText: EditText = {
  font(key) {
    let loading = fonts.get(key)
    if (!loading) {
      loading = (async () => {
        const response = await fetch(fontUrls[key])
        if (!response.ok) throw new Error("The font could not be loaded.")
        const bytes = await response.arrayBuffer()
        const face = new FontFace(screenFamily(key), bytes.slice(0))
        await face.load()
        document.fonts.add(face)
        return bytes
      })()
      loading.catch(() => fonts.delete(key))
      fonts.set(key, loading)
    }
    // Each file is given its own copy: the worker takes what it is handed.
    return loading.then((bytes) => bytes.slice(0))
  },
  async own(key, bytes) {
    if (fonts.has(key)) return
    const face = new FontFace(screenFamily(key), bytes.slice(0))
    await face.load()
    document.fonts.add(face)
    fonts.set(key, Promise.resolve(bytes))
  },
  layOut: (object) => laidOut(object),
}

/** Tesseract from the site's own files, as the editor's OCR panel starts it. */
const startOcr: StartOcr = async (languages, onShare) => {
  const worker = await startTesseract(languages, onShare)
  return {
    read: (png) => recognise(worker, png),
    stop: () => void worker.terminate().catch(() => undefined),
  }
}

export interface Started {
  agent: Agent
  /** Resolves with how many tools WebMCP took, or null when the browser has none. */
  webMcp: Promise<number | null>
  stop: () => void
}

export function startAgent(): Started {
  const json = new JsonClient()
  let pdfClient: PdfClient | null = null
  const pdf = new PdfEngine((onFile) => (pdfClient = new PdfClient(onFile)))
  // The agent's own workers, one of each: a job stopped ends only its worker.
  let compressor: CompressorClient | null = null
  const images = {
    compressor: new CompressorEngine(
      (listener) => (compressor = new CompressorClient(listener))
    ),
    resizer: new PoolJobs<ResizeJob, ResizerResponse>(
      (listener, next) => new ResizerPool(1, listener, next),
      "resize"
    ),
    converter: new PoolJobs<ConvertJob, ConverterResponse>(
      (listener, next) => new ConverterPool(1, listener, next),
      "convert"
    ),
    rasterise: rasteriseSvg,
  }
  const animation = new PoolJobs<AnimationJob, AnimationResponse>(
    (listener, next) => new AnimationPool(1, listener, next),
    "animation"
  )
  const audioPool = new PoolJobs<AudioJob, AudioResponse>(
    (listener, next) => new AudioPool(1, listener, next),
    "audio"
  )
  const videoPool = new PoolJobs<VideoFileJob, VideoResponse>(
    (listener, next) => new VideoPool(listener, next, 1),
    "video"
  )
  // Results being written go to a folder of the page's own, emptied when it goes.
  const videoFolder = `agent-${crypto.randomUUID()}`
  void clearScratch(null)
  // Transcriptions and videos run in workers of their own, ended with the page.
  const running = new Set<() => void>()
  const own =
    <Job, Message>(
      start: (job: Job, onMessage: (message: Message) => void) => () => void
    ) =>
    (job: Job, onMessage: (message: Message) => void) => {
      const stop = start(job, onMessage)
      const end = () => {
        running.delete(end)
        stop()
      }
      running.add(end)
      return end
    }
  const audio = {
    pool: audioPool,
    decode: decodeOnPage,
    transcribe: own(startTranscription),
    video: own(startVideo),
    colours: () => themeColours(document.documentElement),
  }
  const agent = new Agent(
    agentTools({
      runJson: (job) => json.run(job),
      sampleImage,
      paletteStrip,
      pdf,
      text: editText,
      ocr: startOcr,
      images,
      animation,
      audio,
      video: {
        pool: videoPool,
        ask: browserAsker,
        folder: videoFolder,
        frame: async (file, seconds) => {
          const [engine, { frameAt }] = await Promise.all([
            import("mediabunny"),
            import("@/lib/video/mediabunny-video"),
          ])
          return frameAt(engine, file, seconds)
        },
      },
    })
  )
  window.keepsimp = bridgeApi(agent, {
    download,
    progress: (id, fraction, note) =>
      window.keepsimpBridgeProgress?.(id, fraction, note),
    fetch: (url) => fetch(url),
  })
  let undo: (() => void) | null = null
  let stopped = false
  const context = modelContextOf(document)
  const webMcp = context
    ? registerTools(agent, context, (name, problem) =>
        console.warn(`WebMCP did not take ${name}: ${problem}`)
      ).then(({ taken, undo: done }) => {
        if (stopped) done()
        else undo = done
        return taken
      })
    : Promise.resolve(null)
  return {
    agent,
    webMcp,
    stop() {
      stopped = true
      undo?.()
      json.stop()
      pdfClient?.dispose()
      compressor?.dispose()
      images.resizer.dispose()
      images.converter.dispose()
      animation.dispose()
      audioPool.dispose()
      videoPool.dispose()
      void clearScratch(videoFolder)
      running.forEach((end) => end())
      delete window.keepsimp
    },
  }
}
