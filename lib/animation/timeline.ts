/** Timing choices that apply to one animation. Times are in milliseconds of the original. */
export interface Timing {
  /** Where the kept part starts. */
  start: number
  /** Where it ends; null keeps everything to the end. */
  end: number | null
  /** 2 plays twice as fast. */
  speed: number
  /** Most frames per second to keep; null keeps every frame. */
  fps: number | null
  reverse: boolean
  /** Play forwards, then backwards. */
  boomerang: boolean
}

/** One frame of the result: which original frame it shows, and for how long. */
export interface Step {
  source: number
  duration: number
}

export const sum = (values: readonly number[]) =>
  values.reduce((total, value) => total + value, 0)

/** The original frame on screen at a time; the last one for times past the end. */
export function frameAt(durations: readonly number[], time: number) {
  let end = 0
  for (let index = 0; index < durations.length; index++) {
    end += durations[index]
    if (time < end) return index
  }
  return Math.max(0, durations.length - 1)
}

function trim(durations: readonly number[], start: number, end: number | null) {
  const total = sum(durations)
  const from = Math.min(Math.max(0, start), total)
  const to = Math.min(Math.max(from, end ?? total), total)
  // An empty window still shows something: the frame under its start.
  if (to - from <= 0) {
    const source = frameAt(durations, from)
    return [{ source, duration: durations[source] }]
  }
  const steps: Step[] = []
  let begins = 0
  durations.forEach((duration, source) => {
    const ends = begins + duration
    const shown = Math.min(ends, to) - Math.max(begins, from)
    if (shown > 0) steps.push({ source, duration: shown })
    begins = ends
  })
  return steps
}

/** Keep at most `fps` frames a second by showing the frame that is due at each tick. */
function limitRate(steps: Step[], fps: number) {
  const tick = 1000 / fps
  const durations = steps.map((step) => step.duration)
  const total = sum(durations)
  const limited: Step[] = []
  for (let index = 0; index * tick < total; index++) {
    const time = index * tick
    const source = steps[frameAt(durations, time)].source
    const duration = Math.min(tick, total - time)
    const last = limited[limited.length - 1]
    if (last?.source === source) last.duration += duration
    else limited.push({ source, duration })
  }
  // A limit never adds frames.
  return limited.length < steps.length ? limited : steps
}

/** Turn an animation's frame durations and the timing choices into the frames of the result. */
export function planFrames(
  durations: readonly number[],
  timing: Timing
): Step[] {
  if (!durations.length) return []
  let steps = trim(durations, timing.start, timing.end)
  if (timing.speed !== 1)
    steps = steps.map((step) => ({
      source: step.source,
      duration: step.duration / timing.speed,
    }))
  if (timing.fps) steps = limitRate(steps, timing.fps)
  if (timing.reverse) steps = [...steps].reverse()
  // Back again without repeating either end, so the loop does not stutter.
  if (timing.boomerang) steps = [...steps, ...[...steps].reverse().slice(1, -1)]
  return steps.map((step) => ({ ...step }))
}

/**
 * Round durations to whole units (GIF counts hundredths of a second), carrying
 * the rounding error forward so the animation keeps its length.
 */
export function wholeUnits(
  durations: readonly number[],
  unit: number,
  minimum = 1
) {
  let carry = 0
  return durations.map((duration) => {
    const wanted = duration + carry
    const units = Math.max(minimum, Math.round(wanted / unit))
    carry = wanted - units * unit
    return units
  })
}

/** Frames, length and average frame rate, for the facts line. */
export function describeTiming(durations: readonly number[]) {
  const duration = sum(durations)
  return {
    frames: durations.length,
    duration,
    fps: duration > 0 ? (durations.length * 1000) / duration : 0,
  }
}
