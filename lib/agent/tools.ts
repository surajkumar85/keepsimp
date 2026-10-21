/** Every tool given to agents, made with the engines it needs. */
import { colorTools, type SampleImage } from "./color"
import { jsonTools, type RunJson } from "./json"
import { pdfTools } from "./pdf"
import type { PdfEngine } from "./pdf-engine"
import { asTool, type AgentTool } from "./registry"

export interface Engines {
  runJson: RunJson
  sampleImage: SampleImage
  pdf: PdfEngine
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
  ]
}
