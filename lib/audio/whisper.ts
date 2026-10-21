/**
 * Whisper, as this site serves it: the models offered, how large each is
 * to download (with the engine), and where their files are. The files are
 * put into the site at build time from pinned revisions, each checked
 * against its SHA-256 (scripts/whisper-files.mjs); see whisper-models.json.
 */
import list from "./whisper-models.json"

export type WhisperId = "base" | "small"

export const WHISPER_VERSION = list.version

/** Where the engine and models are, from the site's root. */
export const whisperBase = () => `/whisper/${list.version}/`

export const whisperModel = (id: WhisperId) =>
  list.models.find((model) => model.id === id)!

/** What a first transcription with a model downloads, in bytes: the model and the engine. */
export const downloadBytes = (id: WhisperId) =>
  whisperModel(id).files.reduce((sum, file) => sum + file.bytes, 0) +
  list.engineBytes

/** The models offered, and what each is good for. KeepSimp's own words, from its own measurements. */
export const WHISPER_CHOICES: readonly {
  id: WhisperId
  label: string
  says: string
}[] = [
  {
    id: "base",
    label: "Base",
    says: "Quick: about a third of the sound's length on a laptop. Good for clear speech.",
  },
  {
    id: "small",
    label: "Small",
    says: "More accurate with accents, noise and other languages; about three times slower.",
  },
]
