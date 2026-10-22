/** Every tool given to agents, made with the engines it needs. */
import { colorTools, type SampleImage } from "./color"
import { jsonTools, type RunJson } from "./json"
import { pdfTools } from "./pdf"
import { pdfEditTools, type EditText, type StartOcr } from "./pdf-edit"
import type { PdfEngine } from "./pdf-engine"
import { imageTools, type ImageEngines } from "./image"
import { animationTools, type AnimationJob } from "./animation"
import { audioTools, type AudioEngines } from "./audio"
import type { PoolJobs } from "./pool-jobs"
import type { AnimationResponse } from "@/lib/animation/protocol"
import { asTool, type AgentTool } from "./registry"

export interface Engines {
  runJson: RunJson
  sampleImage: SampleImage
  pdf: PdfEngine
  text: EditText
  ocr: StartOcr
  images: ImageEngines
  animation: PoolJobs<AnimationJob, AnimationResponse>
  audio: AudioEngines
}

const listFiles: AgentTool<Record<string, never>> = {
  name: "list_files",
  title: "List the files",
  description:
    "Lists the files on the KeepSimp agent page: those the person added and those the tools made, with the ids other tools take.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: true },
  pageOnly: true,
  async run(_input, { files }) {
    const list = files.list()
    return {
      summary: list.length
        ? `${list.length} ${list.length === 1 ? "file" : "files"}.`
        : "No files yet: the person can add them on the page.",
      data: list,
    }
  },
}

export function agentTools(engines: Engines): AgentTool[] {
  return [
    asTool(listFiles),
    ...jsonTools(engines.runJson),
    ...colorTools(engines.sampleImage),
    ...pdfTools(engines.pdf),
    ...pdfEditTools(engines.pdf, engines.text, engines.ocr),
    ...imageTools(engines.images),
    ...animationTools(engines.animation),
    ...audioTools(engines.audio),
  ]
}
