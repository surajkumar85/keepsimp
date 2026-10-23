import { chromium, expect, test, type BrowserContext } from "@playwright/test"
import { ORIGIN_TRIAL_TOKEN } from "@/lib/agent/setup"
import AxeBuilder from "@axe-core/playwright"
import { parse as parseYaml } from "yaml"
import { hand, ran, ready, run, saved, twoColourPng } from "./agent"

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
    "inspect_json",
    "json_table",
    "convert_color",
    "check_contrast",
    "make_palette",
    "mix_colors",
    "make_gradient",
    "brand_colors",
    "colors_from_image",
    "pick_image_color",
    "pdf_info",
    "merge_pdfs",
    "split_pdf",
    "compress_pdf",
    "organize_pdf_pages",
    "crop_pdf",
    "add_page_numbers",
    "add_header_footer",
    "watermark_pdf",
    "edit_pdf_details",
    "list_pdf_form_fields",
    "fill_pdf_form",
    "verify_pdf_signatures",
    "redact_pdf",
    "find_replace_pdf_text",
    "add_text_to_pdf",
    "add_image_to_pdf",
    "ocr_pdf",
    "draw_on_pdf",
    "list_pdf_comments",
    "comment_on_pdf",
    "read_pdf_page_content",
    "edit_pdf_text",
    "edit_pdf_pictures",
    "edit_pdf_links",
    "suggest_pdf_form_fields",
    "create_pdf_form_fields",
    "edit_pdf_form_fields",
    "image_info",
    "compress_image",
    "resize_image",
    "convert_image",
    "convert_animation",
    "audio_info",
    "convert_audio",
    "edit_audio",
    "make_ringtone",
    "normalize_audio",
    "change_audio_speed",
    "remove_background_noise",
    "edit_audio_tags",
    "split_audio",
    "join_audio",
    "transcribe_audio",
    "audio_to_video",
    "video_info",
    "convert_video",
    "compress_video",
    "trim_video",
    "split_video",
    "video_frame",
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

test("looks through JSON, mixes colours, writes gradients and brand palettes, and reads pixels", async ({
  page,
}) => {
  await ready(page)
  const data = await hand(
    page,
    "orders.json",
    '{"total":10.500000000000000001,"items":[{"sku":"a","n":2},{"sku":"b","n":5}]}',
    "application/json"
  )
  const looked = await ran(page, "inspect_json", { file: data, search: "sku" })
  expect(looked.summary).toBe(
    "Valid JSON: 9 values, 3 deep, 77 bytes. 1 number is kept exactly here but cannot be held exactly by JavaScript. 2 matches; 1 to 2 listed."
  )
  expect(
    (looked.data as unknown as { rows: { pointer: string }[] }).rows.map(
      (row) => row.pointer
    )
  ).toEqual(["/items/0/sku", "/items/1/sku"])
  const tree = await ran(page, "inspect_json", { file: data })
  expect(
    (tree.data as unknown as { rows: { preview: string }[] }).rows[1].preview
  ).toBe("10.500000000000000001")
  const table = await ran(page, "json_table", {
    text: '[{"sku":"a","n":2},{"sku":"b","n":5}]',
  })
  expect(table.data).toEqual({
    columns: ["sku", "n"],
    rows: [
      ["a", "2"],
      ["b", "5"],
    ],
    total: 2,
  })

  const contrast = await ran(page, "check_contrast", {
    foreground: "#666",
    background: "white",
    target: 7,
  })
  expect(contrast.data).toMatchObject({
    target: 7,
    difference: 43.13,
    vision: { grayscale: { foreground: "#666666", background: "#ffffff" } },
  })
  const mixed = await ran(page, "mix_colors", {
    first: "black",
    second: "white",
    space: "srgb",
  })
  expect(mixed.data).toMatchObject({ hex: "#808080", inSrgb: true })
  const gradient = await ran(page, "make_gradient", {
    stops: [
      { color: "#00786f", position: 0 },
      { color: "white", position: 100 },
    ],
    kind: "radial",
  })
  const css = gradient.data as unknown as { modern: string; css: string }
  expect(css.modern).toBe(
    "radial-gradient(circle in oklab, #00786f 0%, #ffffff 100%)"
  )
  // The browser takes both declarations as they are written.
  expect(
    await page.evaluate(
      (modern) => CSS.supports("background", modern),
      css.modern
    )
  ).toBe(true)
  const brand = await ran(page, "brand_colors", {
    brand: "Microsoft",
    format: "css",
  })
  expect((await saved(page, brand.files![0].id)).text).toContain(
    "--color-1: #0078d4;"
  )

  // The PNG strip, drawn by the page, read back as an image by the pixel picker.
  const strip = await ran(page, "make_palette", {
    colors: ["#00786f", "rgb(255 0 0 / 0.5)"],
    format: "png",
  })
  const png = await saved(page, strip.files![0].id)
  expect(png.name).toBe("palette.png")
  expect([png.bytes.readUInt32BE(16), png.bytes.readUInt32BE(20)]).toEqual([
    320, 160,
  ])
  const back = await hand(page, "strip.png", png.bytes, "image/png")
  const left = await ran(page, "pick_image_color", { file: back, x: 10, y: 10 })
  expect(left.data).toMatchObject({
    hex: "#00786f",
    sample: { width: 256, height: 128 },
  })
  const right = await ran(page, "pick_image_color", {
    file: back,
    x: 250,
    y: 100,
  })
  expect((right.data as unknown as { color: string }).color).toMatch(
    /^rgb\(255 0 0 \/ 0\.(49|50)/
  )
  const two = await hand(page, "two.png", twoColourPng(), "image/png")
  expect(
    (await ran(page, "pick_image_color", { file: two, x: 40, y: 5 })).data
  ).toMatchObject({ hex: "#ffffff", sample: { width: 64, height: 32 } })
  expect(
    await run(page, "pick_image_color", { file: two, x: 64, y: 0 })
  ).toEqual({
    ok: false,
    problem: "two.png is drawn 64 × 32 pixels; give x under 64 and y under 32.",
  })
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
  await expect(page.getByTestId("agent-tools").locator("li")).toHaveCount(70)
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
      "has given 70 tools to agents in this browser"
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

test("asks Chrome for WebMCP with the site's origin-trial token, in the page's head", async ({
  page,
}) => {
  await ready(page)
  expect(
    await page.evaluate(
      () =>
        document.head.querySelector<HTMLMetaElement>(
          'meta[http-equiv="origin-trial"]'
        )?.content
    )
  ).toBe(ORIGIN_TRIAL_TOKEN)
})
