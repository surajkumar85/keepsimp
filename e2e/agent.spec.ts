import { crc32, deflateSync } from "node:zlib"
import {
  chromium,
  expect,
  test,
  type BrowserContext,
  type Page,
} from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { parse as parseYaml } from "yaml"
import { bytesOf } from "./pdf"

const AGENTS = "/dashboard/agents/"

/** A PNG, left half teal (#00786f), right half white, written byte by byte. */
function twoColourPng() {
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

async function ready(page: Page) {
  await page.goto(AGENTS)
  await expect(page.getByTestId("agent-page")).toHaveAttribute(
    "data-ready",
    "true"
  )
}

type Answer<T> = { ok: true; value: T } | { ok: false; problem: string }
type Result = {
  summary: string
  files?: { id: string; name: string }[]
  data?: Record<string, unknown> & { output?: string }
}

/** Hands a file to the page as the bridge does: from an address answered here, never the network. */
let served = 0
async function hand(
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

async function run(page: Page, name: string, input: unknown) {
  const answer = (await page.evaluate(
    ([name, input]) =>
      window.keepsimp!.run(`e2e-${Math.random()}`, name as string, input),
    [name, input] as const
  )) as Answer<Result>
  return answer
}

async function ran(page: Page, name: string, input: unknown) {
  const answer = await run(page, name, input)
  if (!answer.ok) throw new Error(answer.problem)
  return answer.value
}

/** Saves a file the tools made, as the bridge does, from a download. */
async function saved(page: Page, id: string) {
  const pending = page.waitForEvent("download")
  await page.evaluate((id) => window.keepsimp!.save(id), id)
  const download = await pending
  const bytes = Buffer.from(await bytesOf(download))
  return { name: download.suggestedFilename(), text: bytes.toString(), bytes }
}

test("the page offers its tools to the bridge, runs them and hands their files back", async ({
  page,
}) => {
  await ready(page)
  const outside: string[] = []
  page.on("request", (request) => {
    if (!request.url().startsWith(new URL(page.url()).origin))
      outside.push(request.url())
  })
  const listed = await page.evaluate(() => window.keepsimp!.tools())
  expect(listed.map((tool) => tool.name)).toEqual([
    "format_json",
    "repair_json",
    "transform_json",
    "query_json",
    "validate_json",
    "compare_json",
    "patch_json",
    "convert_json",
    "convert_color",
    "check_contrast",
    "make_palette",
    "colors_from_image",
  ])
  expect(await page.evaluate(() => window.keepsimp!.version)).toBe(1)

  // JSON: a file in, a formatted file out, every digit kept.
  const data = await hand(
    page,
    "orders.json",
    '{"total":10.500000000000000001,"items":[{"sku":"a","n":2},{"sku":"b","n":5}]}',
    "application/json"
  )
  const formatted = await ran(page, "format_json", {
    file: data,
    style: "sort-keys",
  })
  expect(formatted.summary).toBe(
    "Formatted with the keys sorted. Written to orders-formatted.json."
  )
  const file = await saved(page, formatted.files![0].id)
  expect(file.name).toBe("orders-formatted.json")
  expect(file.text).toBe(
    '{\n  "items": [\n    {\n      "n": 2,\n      "sku": "a"\n    },\n    {\n      "n": 5,\n      "sku": "b"\n    }\n  ],\n  "total": 10.500000000000000001\n}'
  )

  // A path keeps every digit; a filter that compares numbers needs ones
  // JavaScript holds exactly, and says so.
  const total = await ran(page, "query_json", { file: data, query: "$.total" })
  expect(total.data!.output).toBe("[\n  10.500000000000000001\n]")
  expect(
    await run(page, "query_json", { file: data, query: "$.items[?@.n > 3]" })
  ).toEqual({
    ok: false,
    problem: expect.stringContaining("safely representable"),
  })
  // The other jobs on a document of ordinary numbers.
  const plain = await hand(
    page,
    "plain.json",
    '{"total":10.5,"items":[{"sku":"a","n":2},{"sku":"b","n":5}]}',
    "application/json"
  )
  const query = await ran(page, "query_json", {
    file: plain,
    query: "$.items[?@.n > 3].sku",
  })
  expect(query.data).toMatchObject({ count: 1, paths: ["/items/1/sku"] })

  const schema = await ran(page, "validate_json", {
    file: plain,
    schema: '{"type":"object","required":["total","customer"]}',
  })
  expect(schema.summary).toBe("Not valid: 1 error.")

  const yaml = await ran(page, "convert_json", { file: plain, to: "json-yaml" })
  const yamlFile = await saved(page, yaml.files![0].id)
  expect(yamlFile.name).toBe("plain-json-yaml.yaml")
  expect(parseYaml(yamlFile.text).items[1].n).toBe(5)

  const compared = await ran(page, "compare_json", {
    file: plain,
    otherText: '{"total":11,"items":[]}',
  })
  const patched = await ran(page, "patch_json", {
    file: plain,
    patch: compared.data!.output,
  })
  const patchedFile = await saved(page, patched.files![0].id)
  expect(JSON.parse(patchedFile.text)).toEqual({
    total: 11,
    items: [],
  })

  const broken = await ran(page, "repair_json", { text: "{a:1,}" })
  expect(JSON.parse(broken.data!.output!)).toEqual({ a: 1 })

  // A problem comes back in words, and nothing breaks.
  expect(
    await run(page, "format_json", { text: "{", style: "pretty" })
  ).toMatchObject({ ok: false })
  expect(
    await run(page, "format_json", { style: "fancy", text: "[]" })
  ).toEqual({
    ok: false,
    problem: expect.stringContaining('"style" must be one of'),
  })

  // Colours.
  const contrast = await ran(page, "check_contrast", {
    foreground: "#999",
    background: "white",
  })
  expect(contrast.summary).toMatch(/^2\.84:1\. Fails AA/)
  const palette = await ran(page, "make_palette", {
    color: "#00786f",
    harmony: "complementary",
    format: "tailwind",
  })
  const theme = JSON.parse((await saved(page, palette.files![0].id)).text)
  expect(Object.keys(theme.theme.extend.colors)).toEqual(["color-1", "color-2"])

  const image = await hand(page, "two.png", twoColourPng(), "image/png")
  const colours = await ran(page, "colors_from_image", {
    file: image,
    count: 2,
  })
  expect(
    (colours.data as unknown as { color: string; share: number }[]).map(
      (each) => [each.color, Math.round(each.share * 10) / 10]
    )
  ).toEqual(
    expect.arrayContaining([
      ["#00786f", 0.5],
      ["#ffffff", 0.5],
    ])
  )

  // The page lists every call, as it was asked.
  await expect(page.getByTestId("agent-call").first()).toContainText(
    "asked by the KeepSimp bridge"
  )
  expect(outside).toEqual([])
})

test("the person adds files, and sees what agents asked", async ({ page }) => {
  await ready(page)
  await page.locator("#agent-file").setInputFiles({
    name: "notes.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"b":1,"a":2}'),
  })
  const row = page.getByTestId("agent-files").locator("li")
  await expect(row).toHaveCount(1)
  await expect(row).toContainText("notes.json")
  await expect(row).toContainText("file-1")
  const done = await ran(page, "format_json", {
    file: "file-1",
    style: "minify",
  })
  expect(done.files![0].name).toBe("notes-min.json")
  await expect(row).toHaveCount(2)
  await expect(page.getByTestId("agent-call")).toContainText("Minified")
  await expect(page.getByTestId("agent-call-state")).toHaveText("Done")
  // The person can take a file away.
  await page.getByRole("button", { name: "Remove notes.json" }).click()
  await expect(row).toHaveCount(1)
  await expect(page.getByTestId("agent-tools").locator("li")).toHaveCount(13)
})

test("an agent in the browser calls the tools through WebMCP", async ({
  browserName,
  baseURL,
}) => {
  test.skip(browserName !== "chromium", "WebMCP is in Chromium only")
  const browser = await chromium.launch({ args: ["--enable-features=WebMCP"] })
  let context: BrowserContext | null = null
  try {
    context = await browser.newContext({ baseURL, serviceWorkers: "block" })
    const page = await context.newPage()
    await ready(page)
    await expect(page.getByTestId("webmcp-status")).toContainText(
      "has given 13 tools to agents in this browser"
    )
    const tools = await page.webmcp.tools()
    expect(tools.map((tool) => tool.name)).toContain("list_files")
    expect(
      tools.find((tool) => tool.name === "query_json")?.annotations
    ).toMatchObject({ readOnly: true, untrustedContent: true })
    // The person adds a file; the agent finds it and works on it.
    await page.locator("#agent-file").setInputFiles({
      name: "two.png",
      mimeType: "image/png",
      buffer: twoColourPng(),
    })
    // Playwright reads the JSON text a tool answers with.
    const answer = (value: unknown) =>
      (typeof value === "string" ? JSON.parse(value) : value) as {
        summary?: string
        problem?: string
        data?: unknown
      }
    const listedFiles = answer(await page.webmcp.callTool("list_files", {}))
    expect(listedFiles.data).toEqual([
      expect.objectContaining({
        id: "file-1",
        name: "two.png",
        origin: "added",
      }),
    ])
    const found = answer(
      await page.webmcp.callTool("colors_from_image", {
        file: "file-1",
        count: 2,
      })
    )
    expect(found.summary).toBe("2 main colours of two.png.")
    const refused = answer(
      await page.webmcp.callTool("check_contrast", { foreground: "#000" })
    )
    expect(refused.problem).toBe('"background" is needed.')
    await expect(page.getByTestId("agent-call").first()).toContainText(
      "asked by an agent in this browser"
    )
  } finally {
    await context?.close()
    await browser.close()
  }
})

test("the page is accessible in both themes and fits a phone", async ({
  page,
  isMobile,
}) => {
  await ready(page)
  await ran(page, "convert_color", { colors: ["teal"] })
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" })
    const violations = (
      await new AxeBuilder({ page })
        .include("[data-testid=agent-page]")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations
    expect(violations).toEqual([])
  }
  // On a phone the sidebar is in the menu.
  if (!isMobile)
    await expect(
      page.getByRole("link", { name: "For AI agents" })
    ).toHaveAttribute("aria-current", "page")
  await page.setViewportSize({ width: 320, height: 740 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
})
