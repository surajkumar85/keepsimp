import { describe, expect, it } from "vitest"
import list from "./whisper-models.json"
import {
  downloadBytes,
  WHISPER_CHOICES,
  WHISPER_VERSION,
  whisperBase,
  whisperModel,
} from "./whisper"

describe("Whisper as the site serves it", () => {
  it("names a versioned folder and every model it offers", () => {
    expect(whisperBase()).toBe(`/whisper/${WHISPER_VERSION}/`)
    for (const choice of WHISPER_CHOICES) {
      const model = whisperModel(choice.id)
      expect(model.repo).toMatch(/^onnx-community\/whisper-/)
      expect(model.revision).toMatch(/^[0-9a-f]{40}$/)
      for (const file of model.files)
        expect(file.sha256).toMatch(/^[0-9a-f]{64}$/)
    }
  })

  it("says what a first use downloads: the model and the engine", () => {
    const base = whisperModel("base").files.reduce(
      (sum, file) => sum + file.bytes,
      0
    )
    expect(downloadBytes("base")).toBe(base + list.engineBytes)
    expect(downloadBytes("small")).toBeGreaterThan(downloadBytes("base") * 2)
  })
})
