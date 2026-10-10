import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { replaceEditor } from "./editor"
import { readFile, mkdir } from "node:fs/promises"

const source = (page: Page) => page.getByLabel("Your JSON", { exact: true })
const result = (page: Page) =>
  page.getByLabel("Formatted result", { exact: true })
const settle = (page: Page) =>
  expect(page.getByTestId("json-workspace")).toHaveAttribute(
    "data-settled",
    "true"
  )
async function downloaded(page: Page, name = "Download JSON") {
  const event = page.waitForEvent("download")
  await page.getByRole("button", { name, exact: true }).click()
  const download = await event
  return {
    text: (await readFile((await download.path())!)).toString("utf8"),
    filename: download.suggestedFilename(),
  }
}
test.beforeEach(async ({ page }) => {
  await page.goto("/dashboard/json-formatter/")
  await expect(source(page)).toBeVisible()
})

test("source changes invalidate results and Clear removes secondary documents", async ({
  page,
}) => {
  await replaceEditor(source(page), '{"name":"Ada"}')
  await page.getByRole("button", { name: "Validate JSON", exact: true }).click()
  await expect(
    page.getByText("Valid JSON syntax.", { exact: false })
  ).toBeVisible()
  await replaceEditor(source(page), '{"name":}')
  await expect(
    page.getByText("Valid JSON syntax.", { exact: false })
  ).toHaveCount(0)
  await replaceEditor(source(page), '{"name":"Ada"}')
  await page.getByRole("tab", { name: "Schema", exact: true }).click()
  await replaceEditor(
    page.getByLabel("JSON Schema", { exact: true }),
    '{"type":"object"}'
  )
  await page
    .getByRole("button", { name: "Validate schema", exact: true })
    .click()
  await expect(
    page.getByText("Your JSON matches the schema.", { exact: true })
  ).toBeVisible()
  await replaceEditor(source(page), "42")
  await expect(
    page.getByText("Your JSON matches the schema.", { exact: true })
  ).toHaveCount(0)
  await page.getByRole("tab", { name: "Compare", exact: true }).click()
  await replaceEditor(page.getByLabel("Comparison JSON", { exact: true }), "43")
  await page.getByRole("button", { name: "Compare JSON", exact: true }).click()
  await expect(page.getByText("1 difference", { exact: true })).toBeVisible()
  await replaceEditor(page.getByLabel("Comparison JSON", { exact: true }), "44")
  await expect(page.getByText("1 difference", { exact: true })).toHaveCount(0)
  await expect(result(page).locator(".cm-placeholder")).toBeVisible()
  await page.getByRole("button", { name: "Clear", exact: true }).click()
  await expect(source(page).locator(".cm-placeholder")).toBeVisible()
  await expect(
    page.getByLabel("Comparison JSON").locator(".cm-placeholder")
  ).toBeVisible()
  await expect(
    page.getByLabel("JSON Patch operations").locator(".cm-placeholder")
  ).toBeVisible()
  await page.getByRole("tab", { name: "Schema", exact: true }).click()
  await expect(
    page.getByLabel("JSON Schema", { exact: true }).locator(".cm-placeholder")
  ).toBeVisible()
})

test("expensive schemas can be cancelled, fail within a bound and recover in a fresh worker", async ({
  page,
  browserName,
}) => {
  test.setTimeout(60_000)
  const input = JSON.stringify({ value: "a".repeat(5000) + "!" })
  await replaceEditor(source(page), input)
  await page.getByRole("tab", { name: "Schema", exact: true }).click()
  await replaceEditor(
    page.getByLabel("JSON Schema", { exact: true }),
    '{"type":"object","properties":{"value":{"type":"string","pattern":"^(a+)+$"}}}'
  )
  await page
    .getByRole("button", { name: "Validate schema", exact: true })
    .click()
  await page
    .getByRole("button", { name: "Cancel operation", exact: true })
    .click()
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "cancelled"
  )
  await expect(source(page)).toContainText("!")
  await page
    .getByRole("button", { name: "Validate schema", exact: true })
    .click()
  const failure = page.getByRole("main").getByRole("alert")
  if (browserName === "webkit") {
    // WebKit can finish the expected pattern mismatch before the worker deadline.
    const mismatch = page.getByText("Your JSON does not match the schema.", {
      exact: true,
    })
    await expect(failure.or(mismatch)).toBeVisible({ timeout: 30_000 })
    if (await failure.count())
      await expect(failure).toContainText(
        /took too long|recursion|regular expression.*complex/iu
      )
    else
      await expect(
        page.getByText('must match pattern "^(a+)+$"', { exact: false })
      ).toBeVisible()
  } else {
    await expect(failure).toContainText(
      browserName === "chromium"
        ? "took too long"
        : /took too long|too much recursion|Maximum call stack/iu,
      { timeout: 30_000 }
    )
  }
  await page.getByRole("tab", { name: "Edit", exact: true }).click()
  await expect(
    page.getByText("Invalid JSON syntax", { exact: true })
  ).toHaveCount(0)
  await replaceEditor(source(page), '{"recovered":true}')
  await page.getByRole("button", { name: "Format JSON", exact: true }).click()
  await expect(result(page)).toContainText('"recovered": true')
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0)
})

test("format, validation, repair preview, undo and real exact-number downloads", async ({
  page,
}) => {
  const raw = '{"z":9007199254740993,"a":"é","array":[1,2]}'
  await replaceEditor(source(page), raw)
  await page.getByRole("radio", { name: "4 spaces" }).click()
  await page.getByRole("button", { name: "Format JSON", exact: true }).click()
  await expect(result(page)).toContainText("9007199254740993")
  await page.getByLabel("Download filename").fill("payload")
  expect(await downloaded(page)).toMatchObject({
    filename: "payload.json",
    text: expect.stringContaining('\n    "z": 9007199254740993'),
  })
  await page.getByRole("button", { name: "Use result as source" }).click()
  await expect(source(page)).toContainText('"z": 9007199254740993')
  await page.getByRole("button", { name: "Undo edit" }).click()
  await expect(source(page)).toHaveText(raw)
  await replaceEditor(source(page), "{name:'Ada',id:9007199254740993,}")
  await page.getByText("More transformations", { exact: true }).click()
  await page.getByLabel("Transform", { exact: true }).selectOption("repair")
  await settle(page)
  await page
    .getByRole("button", { name: "Preview repair", exact: true })
    .click()
  await expect(result(page)).toContainText('"Ada"')
  await expect(source(page)).toContainText("name:'Ada'")
  await expect(
    page.getByText("Repair proposes changes.", { exact: false })
  ).toBeVisible()
  expect((await downloaded(page)).text).toContain("9007199254740993")
})
test("sort, escape, redaction and UTF-8 encodings produce reviewable transformations", async ({
  page,
}) => {
  await replaceEditor(
    source(page),
    '{"z":{"token":"secret","b":2,"a":1},"a":"é"}'
  )
  await page.getByText("More transformations", { exact: true }).click()
  await page.getByRole("button", { name: "Sort keys A–Z" }).click()
  expect((await downloaded(page)).text.indexOf('"a"')).toBeLessThan(
    (await result(page).innerText()).indexOf('"z"')
  )
  await page.getByLabel("Transform", { exact: true }).selectOption("redact")
  await page.getByRole("button", { name: "Redact property names" }).click()
  await expect(result(page)).toContainText("[REDACTED]")
  await expect(source(page)).toContainText('"secret"')
  await page
    .getByLabel("Transform", { exact: true })
    .selectOption("base64-encode")
  await page.getByRole("button", { name: "Encode Base64" }).click()
  const encoded = await downloaded(page, "Download TXT")
  expect(Buffer.from(encoded.text, "base64").toString("utf8")).toContain('"é"')
  await page.getByRole("button", { name: "Use result as source" }).click()
  await page
    .getByLabel("Transform", { exact: true })
    .selectOption("base64-decode")
  await page.getByRole("button", { name: "Decode Base64 to JSON" }).click()
  await expect(result(page)).toContainText('"é"')
})
test("tree search, pointer selection, replacement preview and table exploration", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Use example" }).click()
  await page.getByRole("tab", { name: "Explore", exact: true }).click()
  await page.getByRole("button", { name: "Expand /users", exact: true }).click()
  await expect(
    page.getByRole("button", { name: "Expand /users/0", exact: true })
  ).toBeVisible()
  await page.getByLabel("Search keys, values and paths").fill("Ada")
  await page.getByRole("button", { name: /Select \/users\/0\/name/ }).click()
  await expect(page.getByLabel("Selected JSON Pointer")).toHaveValue(
    "/users/0/name"
  )
  await expect(result(page)).toContainText('"Ada"')
  await page.getByLabel("Replacement JSON value").fill('"Grace"')
  await page.getByRole("button", { name: "Preview replacement" }).click()
  await expect(result(page)).toContainText('"Grace"')
  await expect(source(page)).toContainText('"Ada"')
  await replaceEditor(
    source(page),
    '[{"id":9007199254740993,"name":"Ada"},{"id":2,"name":"Lin"}]'
  )
  await page.getByRole("radio", { name: "Table", exact: true }).click()
  await expect(page.getByRole("table")).toContainText("9007199254740993")
  await expect(page.getByRole("table")).toContainText("Lin")
})
test("JSONPath, exact JSON Pointer and filters work without JavaScript or network execution", async ({
  page,
}) => {
  const errors: string[] = [],
    outbound: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("request", (request) => {
    if (
      request.url().startsWith("http") &&
      (!request.url().startsWith("http://127.0.0.1:4173/") ||
        !["GET", "HEAD"].includes(request.method()))
    )
      outbound.push(request.url())
  })
  await page.getByRole("button", { name: "Use example" }).click()
  await page.getByRole("tab", { name: "Query", exact: true }).click()
  await page.getByRole("button", { name: "Run query" }).click()
  await expect(result(page)).toContainText('"Ada"')
  await expect(page.getByText("2 matches", { exact: true })).toBeVisible()
  await replaceEditor(
    source(page),
    '{"users":[{"id":9007199254740993,"name":"Ada"},{"id":2,"name":"Lin"}]}'
  )
  await page.getByRole("radio", { name: "JSON Pointer", exact: true }).click()
  await page.getByRole("button", { name: "Run query" }).click()
  expect((await downloaded(page)).text).toBe("9007199254740993")
  await replaceEditor(
    source(page),
    '{"users":[{"id":1,"name":"Ada"},{"id":2,"name":"Lin"}]}'
  )
  await page.getByRole("radio", { name: "JSONPath", exact: true }).click()
  await page.getByLabel("JSONPath expression").fill("$.users[?@.id > 1].name")
  await page.getByRole("button", { name: "Run query" }).click()
  await expect(result(page)).toContainText('"Lin"')
  await page.getByLabel("JSONPath expression").fill("$[?alert(1)]")
  await page.getByRole("button", { name: "Run query" }).click()
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "unknown function"
  )
  expect(errors).toEqual([])
  expect(outbound).toEqual([])
})
test("comparison exports a directional exact JSON Patch and failed patches are atomic", async ({
  page,
}) => {
  await replaceEditor(
    source(page),
    '{"id":9007199254740993,"name":"Ada","removed":true}'
  )
  await page.getByRole("tab", { name: "Compare", exact: true }).click()
  await replaceEditor(
    page.getByLabel("Comparison JSON"),
    '{"id":9007199254740994,"name":"Lin","added":null}'
  )
  await page.getByRole("button", { name: "Compare JSON", exact: true }).click()
  await expect(page.getByRole("table")).toContainText("/id")
  expect((await downloaded(page)).text).toContain("9007199254740994")
  await page.getByRole("button", { name: "Preview patch" }).click()
  await expect(result(page)).toContainText('"Lin"')
  expect((await downloaded(page)).text).not.toContain('"removed"')
  await replaceEditor(
    page.getByLabel("JSON Patch operations"),
    '[{"op":"test","path":"/name","value":"wrong"},{"op":"remove","path":"/id"}]'
  )
  await page.getByRole("button", { name: "Preview patch" }).click()
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "test failed"
  )
  await expect(source(page)).toContainText('"Ada"')
})
test("schema checks local refs, formats, wrong types and blocks external references", async ({
  page,
}) => {
  const remote: string[] = []
  page.on("request", (request) => {
    if (request.url().includes("example.com")) remote.push(request.url())
  })
  await replaceEditor(source(page), '{"email":"bad","age":"1"}')
  await page.getByRole("tab", { name: "Schema", exact: true }).click()
  await replaceEditor(
    page.getByLabel("JSON Schema", { exact: true }),
    '{"type":"object","properties":{"email":{"type":"string","format":"email"},"age":{"$ref":"#/$defs/age"}},"$defs":{"age":{"type":"integer"}}}'
  )
  await page.getByRole("button", { name: "Validate schema" }).click()
  await expect(
    page.getByText("Your JSON does not match the schema.", { exact: true })
  ).toBeVisible()
  await expect(page.getByText("/email", { exact: true })).toBeVisible()
  await replaceEditor(source(page), '{"email":"ada@example.com","age":1}')
  await page.getByRole("button", { name: "Validate schema" }).click()
  await expect(
    page.getByText("Your JSON matches the schema.", { exact: true })
  ).toBeVisible()
  await replaceEditor(
    page.getByLabel("JSON Schema", { exact: true }),
    '{"$ref":"https://example.com/schema.json"}'
  )
  await page.getByRole("button", { name: "Validate schema" }).click()
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "no URLs are fetched"
  )
  expect(remote).toEqual([])
})
test("YAML, protected CSV, JSON Lines, types and schemas download real converted contents", async ({
  page,
}) => {
  await replaceEditor(
    source(page),
    '[{"id":9007199254740993,"name":"=1+2"},{"id":2,"name":"é"}]'
  )
  await page.getByRole("tab", { name: "Convert", exact: true }).click()
  await page.getByRole("button", { name: "Convert document" }).click()
  const yaml = await downloaded(page, "Download YAML")
  expect(yaml.text).toContain("9007199254740993")
  await page.getByLabel("Conversion", { exact: true }).selectOption("yaml-json")
  await replaceEditor(source(page), yaml.text)
  await page.getByRole("button", { name: "Convert document" }).click()
  await expect(result(page)).toContainText("9007199254740993")
  await page.getByRole("button", { name: "Use result as source" }).click()
  await page.getByLabel("Conversion", { exact: true }).selectOption("json-csv")
  await page.getByRole("button", { name: "Convert document" }).click()
  expect((await downloaded(page, "Download CSV")).text).toContain("'=1+2")
  await page
    .getByLabel("Conversion", { exact: true })
    .selectOption("json-lines")
  await page.getByRole("button", { name: "Convert document" }).click()
  expect(
    (await downloaded(page, "Download JSONL")).text.trim().split("\n")
  ).toHaveLength(2)
  await page
    .getByLabel("Conversion", { exact: true })
    .selectOption("typescript")
  await page.getByLabel("Type name").fill("Payload")
  await page.getByRole("button", { name: "Convert document" }).click()
  expect((await downloaded(page, "Download TS")).text).toContain(
    "export type Payload"
  )
  await page.getByLabel("Conversion", { exact: true }).selectOption("schema")
  await page.getByRole("button", { name: "Convert document" }).click()
  await page.getByLabel("Download filename").fill("payload.schema.json")
  const schemaFile = await downloaded(page, "Download SCHEMA.JSON")
  expect(schemaFile.filename).toBe("payload.schema.json")
  expect(JSON.parse(schemaFile.text)).toHaveProperty("$schema")
})
test("local files, malformed UTF-8, CSV strings and refresh clear all user content", async ({
  page,
}) => {
  await page.locator("#json-file").setInputFiles({
    name: "payload.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"id":9007199254740993}'),
  })
  await expect(source(page)).toContainText("9007199254740993")
  await page.getByRole("button", { name: "Format JSON", exact: true }).click()
  await expect(result(page)).toContainText("9007199254740993")
  await page.locator("#json-file").setInputFiles({
    name: "bad.txt",
    mimeType: "text/plain",
    buffer: Buffer.from([0xff, 0xfe, 0xff]),
  })
  await expect(page.getByRole("main").getByRole("alert")).toContainText("UTF-8")
  await page.getByRole("tab", { name: "Convert", exact: true }).click()
  await page.getByLabel("Conversion", { exact: true }).selectOption("csv-json")
  await replaceEditor(source(page), "id,name\n0001,Ada")
  await page.getByRole("button", { name: "Convert document" }).click()
  expect(JSON.parse((await downloaded(page)).text)).toEqual([
    { id: "0001", name: "Ada" },
  ])
  await page.reload()
  await expect(source(page).locator(".cm-placeholder")).toBeVisible()
  await expect(result(page).locator(".cm-placeholder")).toBeVisible()
})
test("all workflows support mobile layouts, keyboard escape and accessible themes", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 320, height: 740 })
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.getByRole("button", { name: "Use example" }).click()
  for (const name of [
    "Edit",
    "Explore",
    "Query",
    "Compare",
    "Schema",
    "Convert",
  ]) {
    await page.getByRole("tab", { name, exact: true }).click()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true)
    const scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze()
    expect(scan.violations).toEqual([])
    if (["Query", "Convert"].includes(name)) {
      const controls = await page
        .getByRole("tabpanel", { name, exact: true })
        .boundingBox()
      const output = await result(page).boundingBox()
      expect(controls!.y + controls!.height).toBeLessThan(output!.y)
    }
  }
  await page.getByRole("tab", { name: "Edit", exact: true }).click()
  await source(page).focus()
  await page.keyboard.press("Escape")
  await page.keyboard.press("Tab")
  await expect(source(page)).not.toBeFocused()
  await page.getByRole("button", { name: "Switch to dark theme" }).click()
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations
  ).toEqual([])
  await mkdir("/tmp/keepsimp-json", { recursive: true })
  await page.screenshot({
    path: `/tmp/keepsimp-json/${testInfo.project.name}-mobile.png`,
    fullPage: true,
  })
  if (testInfo.project.name === "chromium") {
    await page.getByRole("button", { name: "Switch to light theme" }).click()
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.getByRole("button", { name: "Format JSON", exact: true }).click()
    await page.screenshot({
      path: "/tmp/keepsimp-json/desktop.png",
      fullPage: true,
    })
    // A 1440px display at 200% zoom has a 720px CSS viewport. Check the
    // corresponding reflow and a real operation, without relying on CSS zoom.
    await page.setViewportSize({ width: 720, height: 500 })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true)
    await page.getByRole("button", { name: "Minify", exact: true }).click()
    await expect(result(page)).toContainText('"project":"KeepSimp"')
    await page.screenshot({
      path: "/tmp/keepsimp-json/zoom-reflow.png",
      fullPage: true,
    })
  }
})
