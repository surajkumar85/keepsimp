import { describe, expect, it } from "vitest"
import type { Pixels } from "@/lib/image-compressor/ssim"
import {
  answer,
  HELPER_PIXELS,
  HelperCodecs,
  type HelperPort,
  type HelperReply,
  type HelperTask,
} from "./helpers"
import type { Codecs } from "./mupdf-compress"

const pixels = (width = 2, height = 2): Pixels => ({
  data: new Uint8ClampedArray(width * height * 4),
  width,
  height,
})

/** Codecs that say who did the work, and keep count. */
function named(name: number) {
  const calls: string[] = []
  const codecs: Codecs = {
    async jpeg(_pixels, quality, grey) {
      calls.push("jpeg")
      return new Uint8Array([name, quality, Number(grey)])
    },
    async resize(_pixels, size) {
      calls.push("resize")
      return pixels(size.width, size.height)
    },
    async png() {
      calls.push("png")
      return new Uint8Array([name, 1])
    },
    async deflate(bytes) {
      calls.push("deflate")
      return new Uint8Array([name, bytes.length])
    },
  }
  return { codecs, calls }
}

/** A helper's end of the line, answered by hand. */
function port() {
  const asked: (HelperTask & { id: number })[] = []
  const end: HelperPort & {
    asked: typeof asked
    reply(reply: HelperReply): void
  } = {
    asked,
    onmessage: null,
    postMessage: (message) => void asked.push(message),
    reply(reply) {
      end.onmessage?.({ data: reply })
    },
  }
  return end
}

const HERE = 1
const AWAY = 2

describe("HelperCodecs", () => {
  it("does the work here while there are no helpers", async () => {
    const { codecs, calls } = named(HERE)
    const pool = new HelperCodecs(codecs)
    expect(pool.lanes).toBe(1)
    expect(await pool.codecs.jpeg(pixels(), 80, false)).toEqual(
      new Uint8Array([HERE, 80, 0])
    )
    expect(await pool.codecs.png(pixels())).toEqual(new Uint8Array([HERE, 1]))
    expect(await pool.codecs.deflate(new Uint8Array(5))).toEqual(
      new Uint8Array([HERE, 5])
    )
    expect(
      await pool.codecs.resize(pixels(), { width: 1, height: 1 }, true)
    ).toMatchObject({ width: 1, height: 1 })
    expect(calls).toEqual(["jpeg", "png", "deflate", "resize"])
  })

  it("hands each kind of work to a helper and gives back its answer", async () => {
    const { codecs, calls } = named(HERE)
    const pool = new HelperCodecs(codecs)
    const helper = port()
    pool.add(helper)
    expect(pool.lanes).toBe(1)

    const jpeg = pool.codecs.jpeg(pixels(), 70, true)
    expect(helper.asked[0]).toMatchObject({
      op: "jpeg",
      quality: 70,
      grey: true,
    })
    helper.reply({ id: helper.asked[0].id, bytes: new Uint8Array([AWAY]) })
    expect(await jpeg).toEqual(new Uint8Array([AWAY]))

    const resized = pool.codecs.resize(pixels(), { width: 1, height: 1 }, false)
    expect(helper.asked[1]).toMatchObject({
      op: "resize",
      size: { width: 1, height: 1 },
      linear: false,
    })
    helper.reply({ id: helper.asked[1].id, pixels: pixels(1, 1) })
    expect(await resized).toMatchObject({ width: 1, height: 1 })

    const png = pool.codecs.png(pixels())
    expect(helper.asked[2].op).toBe("png")
    helper.reply({ id: helper.asked[2].id, bytes: new Uint8Array([AWAY, 2]) })
    expect(await png).toEqual(new Uint8Array([AWAY, 2]))

    const packed = pool.codecs.deflate(new Uint8Array(9))
    expect(helper.asked[3]).toMatchObject({ op: "deflate" })
    helper.reply({ id: helper.asked[3].id, bytes: new Uint8Array([AWAY, 3]) })
    expect(await packed).toEqual(new Uint8Array([AWAY, 3]))
    expect(calls).toEqual([])
  })

  it("gives each helper one task at a time and queues the rest", async () => {
    const pool = new HelperCodecs(named(HERE).codecs)
    const first = port()
    const second = port()
    pool.add(first)
    pool.add(second)
    expect(pool.lanes).toBe(2)
    const results = [70, 71, 72].map((quality) =>
      pool.codecs.jpeg(pixels(), quality, false)
    )
    expect(first.asked.length + second.asked.length).toBe(2)
    expect(pool.lanes).toBe(2)
    // The third goes to whichever helper answers first.
    const busy = second.asked.length ? second : first
    busy.reply({ id: busy.asked[0].id, bytes: new Uint8Array([9]) })
    expect(busy.asked).toHaveLength(2)
    expect(busy.asked[1]).toMatchObject({ quality: 72 })
    busy.reply({ id: busy.asked[1].id, bytes: new Uint8Array([8]) })
    const other = busy === first ? second : first
    other.reply({ id: other.asked[0].id, bytes: new Uint8Array([7]) })
    const sizes = (await Promise.all(results)).map((bytes) => bytes[0])
    expect(sizes.sort()).toEqual([7, 8, 9])
  })

  it("starts on work that was waiting when a helper arrives", async () => {
    const pool = new HelperCodecs(named(HERE).codecs)
    const first = port()
    pool.add(first)
    void pool.codecs.png(pixels())
    const waiting = pool.codecs.png(pixels())
    const second = port()
    pool.add(second)
    expect(second.asked).toHaveLength(1)
    second.reply({ id: second.asked[0].id, bytes: new Uint8Array([AWAY]) })
    expect(await waiting).toEqual(new Uint8Array([AWAY]))
  })

  it("keeps the largest pictures here", async () => {
    const { codecs, calls } = named(HERE)
    const pool = new HelperCodecs(codecs)
    const helper = port()
    pool.add(helper)
    const large: Pixels = {
      data: new Uint8ClampedArray(4),
      width: HELPER_PIXELS + 1,
      height: 1,
    }
    expect(await pool.codecs.jpeg(large, 80, false)).toEqual(
      new Uint8Array([HERE, 80, 0])
    )
    await pool.codecs.png(large)
    await pool.codecs.resize(large, { width: 1, height: 1 }, true)
    // Bytes count as pixels at four each.
    await pool.codecs.deflate({ length: HELPER_PIXELS * 4 + 4 } as Uint8Array)
    expect(calls).toEqual(["jpeg", "png", "resize", "deflate"])
    expect(helper.asked).toHaveLength(0)
    void pool.codecs.deflate({ length: HELPER_PIXELS * 4 } as Uint8Array)
    expect(helper.asked).toHaveLength(1)
  })

  it("does a helper's failed task here and does not ask that helper again", async () => {
    const { codecs, calls } = named(HERE)
    const pool = new HelperCodecs(codecs)
    const bad = port()
    const good = port()
    pool.add(good)
    pool.add(bad)
    const first = pool.codecs.jpeg(pixels(), 60, false)
    const second = pool.codecs.jpeg(pixels(), 61, false)
    expect(bad.asked).toHaveLength(1)
    expect(good.asked).toHaveLength(1)
    bad.reply({ id: bad.asked[0].id, failed: true })
    expect(pool.lanes).toBe(1)
    good.reply({ id: good.asked[0].id, bytes: new Uint8Array([AWAY]) })
    const got = await Promise.all([first, second])
    expect(got.map((bytes) => bytes[0]).sort()).toEqual([HERE, AWAY])
    expect(calls).toEqual(["jpeg"])
    void pool.codecs.png(pixels())
    expect(bad.asked).toHaveLength(1)
    expect(good.asked).toHaveLength(2)
  })

  it("does everything here once its last helper has failed", async () => {
    const { codecs, calls } = named(HERE)
    const pool = new HelperCodecs(codecs)
    const only = port()
    pool.add(only)
    const first = pool.codecs.jpeg(pixels(), 60, false)
    const second = pool.codecs.png(pixels())
    only.reply({ id: only.asked[0].id, failed: true })
    expect(await first).toEqual(new Uint8Array([HERE, 60, 0]))
    expect(await second).toEqual(new Uint8Array([HERE, 1]))
    expect(await pool.codecs.deflate(new Uint8Array(2))).toEqual(
      new Uint8Array([HERE, 2])
    )
    expect(calls).toEqual(["jpeg", "png", "deflate"])
    expect(only.onmessage).toBeNull()
  })

  it("passes on a failure of the work done here", async () => {
    const trouble = new RangeError("out of memory")
    const pool = new HelperCodecs({
      ...named(HERE).codecs,
      jpeg: () => Promise.reject(trouble),
    })
    const only = port()
    pool.add(only)
    const result = pool.codecs.jpeg(pixels(), 60, false)
    only.reply({ id: only.asked[0].id, failed: true })
    await expect(result).rejects.toBe(trouble)
  })

  it("takes back all work when the helpers are lost", async () => {
    const { codecs, calls } = named(HERE)
    const pool = new HelperCodecs(codecs)
    const helper = port()
    pool.add(helper)
    const working = pool.codecs.jpeg(pixels(), 50, false)
    const waiting = pool.codecs.png(pixels())
    pool.clear()
    expect(await working).toEqual(new Uint8Array([HERE, 50, 0]))
    expect(await waiting).toEqual(new Uint8Array([HERE, 1]))
    expect(calls).toEqual(["jpeg", "png"])
    expect(pool.lanes).toBe(1)
    expect(helper.onmessage).toBeNull()
    // An idle helper is let go of too.
    const idle = port()
    pool.add(idle)
    pool.clear()
    expect(idle.onmessage).toBeNull()
  })

  it("ignores an answer to a question it did not ask", async () => {
    const pool = new HelperCodecs(named(HERE).codecs)
    const helper = port()
    pool.add(helper)
    // Nothing is in work.
    helper.reply({ id: 99, bytes: new Uint8Array([5]) })
    const result = pool.codecs.png(pixels())
    helper.reply({ id: helper.asked[0].id + 1, bytes: new Uint8Array([5]) })
    helper.reply({ id: helper.asked[0].id, bytes: new Uint8Array([AWAY]) })
    expect(await result).toEqual(new Uint8Array([AWAY]))
  })
})

describe("answer", () => {
  const { codecs } = named(AWAY)

  it("does each kind of task and hands over the buffer", async () => {
    const jpeg = await answer(codecs, {
      id: 1,
      op: "jpeg",
      pixels: pixels(),
      quality: 75,
      grey: true,
    })
    expect(jpeg.reply).toEqual({ id: 1, bytes: new Uint8Array([AWAY, 75, 1]) })
    expect(jpeg.transfer).toEqual([
      (jpeg.reply as { bytes: Uint8Array }).bytes.buffer,
    ])
    const png = await answer(codecs, { id: 2, op: "png", pixels: pixels() })
    expect(png.reply).toEqual({ id: 2, bytes: new Uint8Array([AWAY, 1]) })
    const packed = await answer(codecs, {
      id: 3,
      op: "deflate",
      bytes: new Uint8Array(7),
    })
    expect(packed.reply).toEqual({ id: 3, bytes: new Uint8Array([AWAY, 7]) })
    const resized = await answer(codecs, {
      id: 4,
      op: "resize",
      pixels: pixels(),
      size: { width: 3, height: 1 },
      linear: true,
    })
    const made = (resized.reply as { pixels: Pixels }).pixels
    expect(made).toMatchObject({ width: 3, height: 1 })
    expect(made.data).toHaveLength(12)
    expect(resized.transfer).toEqual([made.data.buffer])
  })

  it("copies bytes that are part of a larger buffer before handing them over", async () => {
    const memory = new Uint8Array([0, 0, 4, 5, 6, 0])
    const part = await answer(
      { ...codecs, deflate: async () => memory.subarray(2, 5) },
      { id: 5, op: "deflate", bytes: new Uint8Array(1) }
    )
    const { bytes } = part.reply as { bytes: Uint8Array }
    expect(bytes).toEqual(new Uint8Array([4, 5, 6]))
    expect(bytes.buffer).not.toBe(memory.buffer)
    expect(bytes.buffer.byteLength).toBe(3)
    // A view that starts at the front but stops short is copied as well.
    const front = await answer(
      { ...codecs, png: async () => memory.subarray(0, 2) },
      { id: 6, op: "png", pixels: pixels() }
    )
    expect((front.reply as { bytes: Uint8Array }).bytes.buffer.byteLength).toBe(
      2
    )
  })

  it("says so when the codec fails", async () => {
    const failed = await answer(
      {
        ...codecs,
        jpeg: () => Promise.reject(new Error("no engine")),
      },
      { id: 7, op: "jpeg", pixels: pixels(), quality: 80, grey: false }
    )
    expect(failed).toEqual({ reply: { id: 7, failed: true }, transfer: [] })
  })
})
