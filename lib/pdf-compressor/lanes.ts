/**
 * Working on several things at once without taking more memory than the
 * device has room for.
 */

/**
 * Do `work` for every item, at most `lanes()` at a time, and stay within
 * `room`: the weights of the items in work never add up to more, except that
 * an item heavier than the room is worked on alone. Items start in the order
 * given. `lanes` is asked again whenever a place may be free, so helpers that
 * arrive late are put to use.
 *
 * The first failure stops new items from starting; those under way are
 * waited for, and the failure is passed on.
 */
export function inLanes<T>(
  items: Iterable<T>,
  lanes: () => number,
  weigh: (item: T) => number,
  room: number,
  work: (item: T) => Promise<void>
) {
  return new Promise<void>((resolve, reject) => {
    const waiting = items[Symbol.iterator]()
    let next = waiting.next()
    let running = 0
    let used = 0
    let failure: { error: unknown } | null = null
    const pump = () => {
      while (!failure && !next.done) {
        const weight = weigh(next.value)
        if (running >= Math.max(1, lanes())) break
        if (running > 0 && used + weight > room) break
        const item = next.value
        next = waiting.next()
        running++
        used += weight
        // The work is started here, so a failure before its first pause counts too.
        Promise.resolve()
          .then(() => work(item))
          .catch((error: unknown) => {
            failure ??= { error }
          })
          .then(() => {
            running--
            used -= weight
            pump()
          })
      }
      if (running > 0) return
      // Nothing is in work, so nothing was held back: every item has been started.
      if (failure) reject(failure.error)
      else resolve()
    }
    pump()
  })
}
