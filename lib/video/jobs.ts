/**
 * Building the worker's jobs, shared by the workspace's page and the tools
 * given to agents, so both write a file the same way.
 */
import type { Container } from "./formats"
import type { Box } from "./frame"
import type { Soundtrack, TrackFacts } from "./soundtrack"
import type { ConvertJob, ReadJob } from "./protocol"
import { planKey } from "./queue"
import {
  planFor,
  type Cut,
  type Plan,
  type SoundCodec,
  type VideoCodec,
  type VideoFacts,
  type VideoSettings,
} from "./settings"

/** What this browser can write, asked once for each codec and size. */
export interface Asker {
  video(codec: VideoCodec, width: number, height: number): Promise<boolean>
  sound(codec: SoundCodec): Promise<boolean>
}

/** At most this many rounds of asking: each settles one codec at one size. */
const MOST_ROUNDS = 12

/**
 * The plan for a file once the browser has said what it can write: asked
 * as the plan needs to know, from the first choice down, never all at once.
 */
export async function browserPlan(
  facts: VideoFacts,
  settings: VideoSettings,
  ask: Asker,
  known = new Map<string, boolean>(),
  cut: Cut | null = null,
  box: Box | null = null,
  track: (TrackFacts & Soundtrack) | null = null
): Promise<Plan> {
  const sounds = new Map<SoundCodec, boolean>([["aac", true]])
  let plan = planFor(
    facts,
    settings,
    (codec, width, height) => known.get(`${codec}@${width}x${height}`) ?? null,
    (codec) => sounds.get(codec) ?? null,
    cut,
    box,
    track
  )
  for (let round = 0; round < MOST_ROUNDS; round++) {
    const waiting = plan.pending[0]
    const sound =
      plan.audio.action === "encode" || facts.audio
        ? (["opus", "vorbis"] as const).find((codec) => !sounds.has(codec))
        : undefined
    if (!waiting && !sound) break
    if (waiting)
      known.set(
        `${waiting.codec}@${waiting.width}x${waiting.height}`,
        await ask.video(waiting.codec, waiting.width, waiting.height)
      )
    if (sound) sounds.set(sound, await ask.sound(sound))
    plan = planFor(
      facts,
      settings,
      (codec, width, height) =>
        known.get(`${codec}@${width}x${height}`) ?? null,
      (codec) => sounds.get(codec) ?? null,
      cut,
      box,
      track
    )
  }
  return plan
}

export const readJob = (
  file: Blob,
  container: Container
): Omit<ReadJob, "id"> => ({ job: "read", file, container })

export const convertJob = (
  file: Blob,
  container: Container,
  facts: VideoFacts,
  plan: Plan,
  folder: string,
  track: Blob | null = null
): Omit<ConvertJob, "id"> => ({
  job: "convert",
  file,
  container,
  facts,
  plan,
  key: planKey(plan),
  folder,
  track,
})
