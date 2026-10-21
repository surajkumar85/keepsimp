/**
 * The hidden browser the tools run in: Google Chrome when it is installed,
 * otherwise Chromium (installed once). It opens the KeepSimp agent page and
 * nothing else: every request outside the site is refused. Files go in
 * through an address the bridge answers from disk, and come out as
 * downloads the bridge saves.
 */
import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { createRequire } from "node:module"
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright-core"
import type { Listing } from "./tools.ts"

/** The version of the page's interface this bridge speaks. */
export const AGENT_VERSION = 1

export type BrowserChoice = "auto" | "chrome" | "chromium"

export interface FileRef {
  id: string
  name: string
  type: string
  size: number
}

export interface ToolResult {
  summary: string
  files?: FileRef[]
  data?: unknown
}

export type Answer<T> = { ok: true; value: T } | { ok: false; problem: string }

/** What the bridge needs of the browser; the tests give it one of their own. */
export interface Tools {
  tools(): Promise<Listing[]>
  put(path: string, name: string): Promise<FileRef>
  call(
    id: string,
    name: string,
    input: unknown,
    onProgress: (fraction: number, note: string) => void
  ): Promise<Answer<ToolResult>>
  stop(id: string): Promise<void>
  save(fileId: string, target: string): Promise<void>
  forget(ids: string[]): Promise<void>
  close(): Promise<void>
}

export interface SessionOptions {
  site: string
  browser: BrowserChoice
  headed: boolean
  log: (line: string) => void
}

function installChromium(log: (line: string) => void) {
  log(
    "KeepSimp is installing Chromium to run its tools in (once, about 150 MB)…"
  )
  const cli = createRequire(import.meta.url).resolve("playwright-core/cli.js")
  return new Promise<void>((done, failed) => {
    const child = spawn(process.execPath, [cli, "install", "chromium"], {
      stdio: ["ignore", process.stderr, process.stderr],
    })
    child.on("error", failed)
    child.on("exit", (code) =>
      code === 0
        ? done()
        : failed(new Error("Chromium could not be installed."))
    )
  })
}

async function launch(options: SessionOptions): Promise<Browser> {
  const headless = !options.headed
  if (options.browser !== "chromium")
    try {
      return await chromium.launch({ channel: "chrome", headless })
    } catch (error) {
      if (options.browser === "chrome") throw error
    }
  try {
    return await chromium.launch({ headless })
  } catch {
    await installChromium(options.log)
    return chromium.launch({ headless })
  }
}

export class Session implements Tools {
  /** Requests refused because they would have left the site. */
  readonly blocked: string[] = []
  private readonly options: SessionOptions
  private readonly origin: string
  private browser: Browser | null = null
  private context: BrowserContext | null = null
  private page: Promise<Page> | null = null
  private readonly incoming = new Map<string, string>()
  private readonly progress = new Map<
    string,
    (fraction: number, note: string) => void
  >()
  private saving: Promise<unknown> = Promise.resolve()

  constructor(options: SessionOptions) {
    this.options = options
    this.origin = new URL(options.site).origin
  }

  private async open(): Promise<Page> {
    this.browser ??= await launch(this.options)
    if (!this.context) {
      const context = await this.browser.newContext({
        serviceWorkers: "block",
        acceptDownloads: true,
      })
      // The last route added is asked first: files handed in, then the rest.
      await context.route("**/*", (route) => {
        const url = route.request().url()
        if (new URL(url).origin === this.origin) return route.continue()
        this.blocked.push(url)
        this.options.log(`Refused a request outside KeepSimp: ${url}`)
        return route.abort("blockedbyclient")
      })
      await context.route(`${this.origin}/__bridge/in/*`, (route) => {
        const token = new URL(route.request().url()).pathname.split("/").pop()!
        const path = this.incoming.get(token)
        this.incoming.delete(token)
        return path
          ? route.fulfill({ path, contentType: "application/octet-stream" })
          : route.fulfill({ status: 404, body: "" })
      })
      await context.exposeFunction(
        "keepsimpBridgeProgress",
        (id: string, fraction: number, note: string) =>
          this.progress.get(id)?.(fraction, note)
      )
      this.context = context
    }
    const page = await this.context.newPage()
    page.on("crash", () => {
      this.options.log("The KeepSimp page stopped; it will be opened again.")
      this.page = null
    })
    await page.goto(new URL("/dashboard/agents/", this.options.site).href)
    const version = await page
      .waitForFunction(() => window.keepsimp?.version, null, {
        timeout: 30_000,
      })
      .then((handle) => handle.jsonValue() as Promise<number>)
    if (version !== AGENT_VERSION)
      throw new Error(
        version > AGENT_VERSION
          ? "KeepSimp's tools have changed since this bridge was made. Update it: npx -y keepsimp-mcp@latest."
          : "This bridge is newer than the KeepSimp site it opened."
      )
    return page
  }

  private ready() {
    this.page ??= this.open().catch((error: unknown) => {
      this.page = null
      throw error
    })
    return this.page
  }

  async tools(): Promise<Listing[]> {
    const page = await this.ready()
    return page.evaluate(() => window.keepsimp!.tools() as unknown as Listing[])
  }

  async put(path: string, name: string): Promise<FileRef> {
    const page = await this.ready()
    const token = randomUUID()
    this.incoming.set(token, path)
    const answer = await page.evaluate(
      ([url, name]) => window.keepsimp!.load(url, name, ""),
      [`/__bridge/in/${token}`, name] as const
    )
    if (!answer.ok) throw new Error(answer.problem)
    return answer.value
  }

  async call(
    id: string,
    name: string,
    input: unknown,
    onProgress: (fraction: number, note: string) => void
  ): Promise<Answer<ToolResult>> {
    const page = await this.ready()
    this.progress.set(id, onProgress)
    try {
      return (await page.evaluate(
        ([id, name, input]) => window.keepsimp!.run(id, name, input),
        [id, name, input] as const
      )) as Answer<ToolResult>
    } finally {
      this.progress.delete(id)
    }
  }

  async stop(id: string) {
    const page = await this.ready()
    await page.evaluate((id) => window.keepsimp!.stop(id), id)
  }

  /** Saves a file the tools made at `target`; one at a time, so downloads cannot cross. */
  save(fileId: string, target: string) {
    const saved = this.saving.then(async () => {
      const page = await this.ready()
      const download = page.waitForEvent("download")
      const answer = await page.evaluate(
        (id) => window.keepsimp!.save(id),
        fileId
      )
      if (!answer.ok) throw new Error(answer.problem)
      await (await download).saveAs(target)
    })
    this.saving = saved.catch(() => undefined)
    return saved
  }

  async forget(ids: string[]) {
    if (!ids.length || !this.page) return
    const page = await this.ready()
    await page.evaluate((ids) => window.keepsimp!.forget(ids), ids)
  }

  async close() {
    await this.browser?.close()
    this.browser = null
    this.context = null
    this.page = null
  }
}

declare global {
  interface Window {
    keepsimp?: {
      version: number
      tools(): unknown[]
      load(url: string, name: string, type: string): Promise<Answer<FileRef>>
      run(id: string, name: string, input: unknown): Promise<Answer<ToolResult>>
      stop(id: string): void
      save(fileId: string): Answer<FileRef>
      forget(ids: string[]): void
    }
  }
}
