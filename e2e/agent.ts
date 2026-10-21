/** Driving the agent page as the KeepSimp bridge does. */
import { crc32, deflateSync } from "node:zlib"
import { expect, type Page } from "@playwright/test"
import { bytesOf } from "./pdf"

export const AGENTS = "/dashboard/agents/"

/** A PNG, left half teal (#00786f), right half white, written byte by byte. */
export function twoColourPng() {
  const width = 64
  const height = 32
  const rows = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      rows.set(
        x < width / 2 ? [0x00, 0x78, 0x6f] : [0xff, 0xff, 0xff],
        y * (width * 3 + 1) + 1 + x * 3
      )
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data])
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const check = Buffer.alloc(4)
    check.writeUInt32BE(crc32(body))
    return Buffer.concat([length, body, check])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 2, 0, 0, 0], 8)
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

export async function ready(page: Page) {
  await page.goto(AGENTS)
  await expect(page.getByTestId("agent-page")).toHaveAttribute(
    "data-ready",
    "true"
  )
}

export type Answer<T> = { ok: true; value: T } | { ok: false; problem: string }
export type Result = {
  summary: string
  files?: { id: string; name: string }[]
  data?: Record<string, unknown> & { output?: string }
}

/** Hands a file to the page as the bridge does: from an address answered here, never the network. */
let served = 0
export async function hand(
  page: Page,
  name: string,
  body: Buffer | string,
  type: string
) {
  const url = `/__bridge/in/${++served}`
  await page.route(`**${url}`, (route) =>
    route.fulfill({ body, contentType: type })
  )
  const answer = await page.evaluate(
    ([url, name, type]) => window.keepsimp!.load(url, name, type),
    [url, name, type] as const
  )
  expect(answer.ok).toBe(true)
  return (answer as { ok: true; value: { id: string } }).value.id
}

export async function run(page: Page, name: string, input: unknown) {
  const answer = (await page.evaluate(
    ([name, input]) =>
      window.keepsimp!.run(`e2e-${Math.random()}`, name as string, input),
    [name, input] as const
  )) as Answer<Result>
  return answer
}

export async function ran(page: Page, name: string, input: unknown) {
  const answer = await run(page, name, input)
  if (!answer.ok) throw new Error(answer.problem)
  return answer.value
}

/** Saves a file the tools made, as the bridge does, from a download. */
export async function saved(page: Page, id: string) {
  const pending = page.waitForEvent("download")
  await page.evaluate((id) => window.keepsimp!.save(id), id)
  const download = await pending
  const bytes = Buffer.from(await bytesOf(download))
  return { name: download.suggestedFilename(), text: bytes.toString(), bytes }
}
