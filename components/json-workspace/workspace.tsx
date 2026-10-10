"use client"
import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import {
  IconBraces,
  IconDownload,
  IconCheck,
  IconUpload,
  IconCopy,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconSearch,
  IconGitCompare,
  IconShieldCheck,
  IconTransform,
  IconBinaryTree,
  IconFilter,
  IconX,
  IconLock,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  WorkspaceTabs,
  WorkspaceTabList,
  WorkspaceTab,
} from "@/components/ui/workspace-tabs"
import { CodeEditor, type EditorHandle } from "./code-editor"
import {
  EditPanel,
  ExplorePanel,
  QueryPanel,
  ComparePanel,
  SchemaPanel,
  ConvertPanel,
} from "./panels"
import { useJsonWorker, JsonOperationError } from "@/hooks/use-json-worker"
import {
  MAX_JSON_CHARACTERS,
  MAX_JSON_FILE_BYTES,
} from "@/lib/json-workspace/document"
import type { JsonJob, JsonResult } from "@/lib/json-workspace/protocol"
import type { Transform } from "@/lib/json-workspace/transforms"
import type { Conversion } from "@/lib/json-workspace/convert"

type Mode = "edit" | "explore" | "query" | "compare" | "schema" | "convert"
const modes: readonly Mode[] = [
  "edit",
  "explore",
  "query",
  "compare",
  "schema",
  "convert",
]
function subscribeMode(listener: () => void) {
  window.addEventListener("hashchange", listener)
  return () => window.removeEventListener("hashchange", listener)
}
function currentMode(): Mode {
  const value = window.location.hash.slice(1) as Mode
  return modes.includes(value) ? value : "edit"
}
type Output = {
  text: string
  extension: string
  mime: string
  label: string
  note?: string
  source: string
}
const example =
  '{"project":"KeepSimp","version":1,"private":true,"users":[{"id":"9007199254740993","name":"Ada","role":"editor"},{"id":"2","name":"Lin","role":"viewer"}],"settings":{"theme":"teal","token":"example-only"}}'
export function JsonWorkspace() {
  const [input, setInput] = useState("")
  const [fileName, setFileName] = useState("")
  const [output, setOutput] = useState<Output | null>(null)
  const [inspection, setInspection] = useState<JsonResult | null>(null)
  const [problem, setProblem] = useState<{
    text: string
    offset?: number
  } | null>(null)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const mode = useSyncExternalStore(
    subscribeMode,
    currentMode,
    () => "edit" as Mode
  )
  const [clearVersion, setClearVersion] = useState(0)
  const [indent, setIndent] = useState("  ")
  const [redactKeys, setRedactKeys] = useState(
    "password, secret, token, api_key, apiKey, authorization"
  )
  const [expanded, setExpanded] = useState([""])
  const [search, setSearch] = useState("")
  const [offset, setOffset] = useState(0)
  const [conversion, setConversion] = useState<Conversion>("json-yaml")
  const [downloadName, setDownloadName] = useState("formatted-keepsimp")
  const [dragging, setDragging] = useState(false)
  const editor = useRef<EditorHandle>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const revision = useRef(0)
  const sourceValue = useRef("")
  const { run, cancel, busy } = useJsonWorker()
  const invalidate = useCallback(() => {
    revision.current++
    cancel()
    setOutput(null)
    setError("")
    setNotice("")
  }, [cancel])
  const importing =
    mode === "convert" &&
    ["yaml-json", "csv-json", "lines-json"].includes(conversion)
  const updateSource = useCallback(
    (text: string) => {
      if (text === sourceValue.current) return
      sourceValue.current = text
      revision.current++
      cancel()
      setInput(text)
      setOutput(null)
      setInspection(null)
      setProblem(null)
      setError("")
      setNotice("")
    },
    [cancel]
  )
  useEffect(() => {
    if (!input.trim() || importing) return
    let active = true
    const timer = setTimeout(() => {
      run({ action: "inspect", input, expanded, search, offset })
        .then((result) => {
          if (active) {
            setInspection(result)
            setProblem(null)
          }
        })
        .catch((error) => {
          if (error.name === "AbortError") return
          if (active) {
            setInspection(null)
            setProblem({
              text: error.message,
              offset:
                error instanceof JsonOperationError ? error.offset : undefined,
            })
          }
        })
    }, 350)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [input, importing, expanded, search, offset, run])
  async function execute(
    job: JsonJob,
    label: string,
    extension = "json",
    mime = "application/json"
  ) {
    const version = revision.current
    setError("")
    setNotice("")
    try {
      const result = await run(job)
      if (version !== revision.current) return null
      if (result.output !== undefined)
        setOutput({
          text: result.output,
          extension: result.extension ?? extension,
          mime: result.mime ?? mime,
          label,
          note: result.note,
          source: input,
        })
      return result
    } catch (error) {
      if (version === revision.current) {
        setError((error as Error).message)
        if (
          error instanceof JsonOperationError &&
          error.offset !== undefined &&
          ["inspect", "query", "table", "value"].includes(job.action)
        )
          editor.current?.locate(error.offset)
      }
      return null
    }
  }
  async function transform(action: Transform) {
    const extension = action.endsWith("-encode") ? "txt" : "json"
    const result = await execute(
      {
        action: "transform",
        input,
        transform: action,
        indent,
        keys: redactKeys,
      },
      action === "repair" ? "Repair preview" : "Formatted result",
      extension,
      extension === "txt" ? "text/plain" : "application/json"
    )
    if (result && action === "repair")
      setNotice(
        "Repair proposes changes. Review the result before using it as your source."
      )
  }
  async function openFile(file?: File) {
    if (!file) return
    setError("")
    try {
      if (file.size > MAX_JSON_FILE_BYTES)
        throw new Error("Choose a text file smaller than 10 MB.")
      if (!/\.(json|jsonl|ndjson|yaml|yml|csv|txt)$/iu.test(file.name))
        throw new Error("Choose a JSON, JSON Lines, YAML, CSV or text file.")
      const text = new TextDecoder("utf-8", { fatal: true }).decode(
        await file.arrayBuffer()
      )
      if (text.length > MAX_JSON_CHARACTERS)
        throw new Error("Use at most 5 million characters per document.")
      updateSource(text)
      setFileName(file.name)
    } catch (error) {
      setError(
        error instanceof TypeError
          ? "This file is not valid UTF-8 text."
          : (error as Error).message
      )
    }
  }
  async function copy(text: string, label = "Result") {
    try {
      await navigator.clipboard.writeText(text)
      setNotice(`${label} copied.`)
    } catch {
      setError(
        "Clipboard is unavailable. Select the text to copy it, or download the result."
      )
    }
  }
  function download() {
    if (!output) return
    const safeName =
      downloadName
        .replace(
          /\.(?:schema\.json|json|csv|yaml|yml|jsonl|ndjson|ts|txt)$/iu,
          ""
        )
        .replace(/[^\p{L}\p{N}._-]/gu, "-")
        .slice(0, 100) || "keepsimp"
    const url = URL.createObjectURL(
      new Blob([output.text], { type: output.mime })
    )
    const link = document.createElement("a")
    link.href = url
    link.download = `${safeName}.${output.extension}`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const common = { input, busy, execute, invalidate }
  return (
    <div
      data-testid="json-workspace"
      data-settled={busy ? "false" : "true"}
      className="space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-marketing-surface px-4 py-3">
        <div className="flex items-center gap-2 text-sm">
          <IconLock className="size-4 text-primary" aria-hidden="true" />
          <span>One workspace. All on your device.</span>
        </div>
        <span className="text-xs text-muted-foreground">
          5 million characters · 100 levels · 100,000 values
        </span>
      </div>
      <WorkspaceTabs
        value={mode}
        onValueChange={(value) => {
          window.history.replaceState(null, "", `#${value}`)
          window.dispatchEvent(new HashChangeEvent("hashchange"))
          setError("")
          setNotice("")
        }}
      >
        <WorkspaceTabList label="JSON workflows">
          <WorkspaceTab value="edit">
            <IconBraces aria-hidden="true" />
            Edit
          </WorkspaceTab>
          <WorkspaceTab value="explore">
            <IconBinaryTree aria-hidden="true" />
            Explore
          </WorkspaceTab>
          <WorkspaceTab value="query">
            <IconFilter aria-hidden="true" />
            Query
          </WorkspaceTab>
          <WorkspaceTab value="compare">
            <IconGitCompare aria-hidden="true" />
            Compare
          </WorkspaceTab>
          <WorkspaceTab value="schema">
            <IconShieldCheck aria-hidden="true" />
            Schema
          </WorkspaceTab>
          <WorkspaceTab value="convert">
            <IconTransform aria-hidden="true" />
            Convert
          </WorkspaceTab>
        </WorkspaceTabList>
        <div className="mt-4 space-y-4">
          <div
            className="flex flex-wrap items-center gap-2"
            onDragOver={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              void openFile(event.dataTransfer.files[0])
            }}
          >
            <input
              ref={fileInput}
              id="json-file"
              type="file"
              accept=".json,.jsonl,.ndjson,.yaml,.yml,.csv,.txt"
              aria-label="Open JSON or text file"
              className="sr-only"
              onChange={(event) => {
                void openFile(event.target.files?.[0])
                event.target.value = ""
              }}
            />
            <Button
              variant="outline"
              onClick={() => fileInput.current?.click()}
            >
              <IconUpload aria-hidden="true" />
              Open file
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                updateSource(example)
                setFileName("")
              }}
            >
              Use example
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                updateSource("")
                invalidate()
                setFileName("")
                setExpanded([""])
                setSearch("")
                setOffset(0)
                setClearVersion((value) => value + 1)
              }}
            >
              Clear
            </Button>
            <span className="min-w-0 truncate text-xs text-muted-foreground">
              {dragging
                ? "Drop to open locally"
                : fileName ||
                  "Paste below or drop a text file here · up to 10 MB"}
            </span>
          </div>
          <EditPanel
            key={`edit-${clearVersion}`}
            {...common}
            transform={transform}
            indent={indent}
            setIndent={setIndent}
            redactKeys={redactKeys}
            setRedactKeys={setRedactKeys}
          />
          <div className="grid min-w-0 gap-4 xl:grid-cols-2">
            <div className="order-1 min-w-0 space-y-2">
              <CodeEditor
                id="json-input"
                label="Your JSON"
                value={input}
                onChange={updateSource}
                ref={editor}
                jsonLanguage={!importing}
              />
              <div className="flex flex-wrap gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => editor.current?.undo()}
                  aria-label="Undo edit"
                >
                  <IconArrowBackUp aria-hidden="true" />
                  Undo
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => editor.current?.redo()}
                  aria-label="Redo edit"
                >
                  <IconArrowForwardUp aria-hidden="true" />
                  Redo
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => editor.current?.find()}
                >
                  <IconSearch aria-hidden="true" />
                  Find / replace
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => editor.current?.fold()}
                >
                  Fold all
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => editor.current?.unfold()}
                >
                  Unfold all
                </Button>
              </div>
            </div>
            <div
              className={
                mode === "edit"
                  ? "hidden"
                  : `order-2 min-w-0 ${mode === "schema" && !output ? "" : "xl:order-3 xl:col-span-2"}`
              }
            >
              <Fragment key={`panels-${clearVersion}`}>
                <ExplorePanel
                  {...common}
                  inspection={inspection}
                  expanded={expanded}
                  setExpanded={setExpanded}
                  search={search}
                  setSearch={setSearch}
                  offset={offset}
                  setOffset={setOffset}
                  copy={copy}
                />
                <QueryPanel {...common} />
                <ComparePanel {...common} updateSource={updateSource} />
                <SchemaPanel {...common} />
                <ConvertPanel
                  {...common}
                  conversion={conversion}
                  setConversion={setConversion}
                />
              </Fragment>
            </div>
            {(mode !== "schema" || output) && (
              <div className="order-3 min-w-0 space-y-2 xl:order-2">
                <CodeEditor
                  id="json-output"
                  label="Formatted result"
                  value={output?.text ?? ""}
                  readOnly
                  jsonLanguage={
                    output?.extension === "json" ||
                    output?.extension === "schema.json" ||
                    !output
                  }
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!output}
                    onClick={() => void copy(output!.text)}
                  >
                    <IconCopy aria-hidden="true" />
                    Copy result
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!output}
                    onClick={() => {
                      if (output?.source !== input) {
                        setError(
                          "The source changed. Run the operation again before replacing it."
                        )
                        return
                      }
                      updateSource(output!.text)
                      setNotice(
                        "Result is now the source. Undo restores your previous source."
                      )
                    }}
                  >
                    Use result as source
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {output
                      ? `${output.label} · ${new TextEncoder().encode(output.text).length.toLocaleString()} bytes`
                      : "Results appear here; your source stays intact."}
                  </span>
                </div>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {inspection?.stats ? (
                <>
                  <IconCheck
                    className="mr-1 inline size-3.5 text-primary"
                    aria-hidden="true"
                  />
                  Valid JSON · {inspection.stats.bytes.toLocaleString()} bytes ·{" "}
                  {inspection.stats.nodes.toLocaleString()} values · depth{" "}
                  {inspection.stats.depth}
                </>
              ) : importing ? (
                "Convert accepts the source format you selected."
              ) : input.trim() ? (
                problem ? (
                  problem.offset !== undefined ? (
                    "Invalid JSON syntax"
                  ) : (
                    "JSON check could not finish"
                  )
                ) : (
                  "Checking JSON syntax…"
                )
              ) : (
                "Start with a document or try the example."
              )}
            </span>
            <span>
              Ctrl/Cmd + F to find · Ctrl/Cmd + Z to undo · Escape, then Tab to
              leave the editor
            </span>
          </div>
          {problem && !importing && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <span>{problem.text}</span>
              {problem.offset !== undefined && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => editor.current?.locate(problem.offset!)}
                >
                  Go to error
                </Button>
              )}
            </div>
          )}
          {!!inspection?.stats?.duplicates.length && (
            <p className="rounded-lg border p-3 text-sm text-muted-foreground">
              Duplicate keys:{" "}
              {inspection.stats.duplicates.slice(0, 5).join(", ")}. Formatting
              preserves them; make keys unique before querying, comparing,
              converting or schema validation.
            </p>
          )}
          {!!inspection?.stats?.unsafeNumbers.length && (
            <p className="rounded-lg border p-3 text-sm text-muted-foreground">
              Exact numeric text is preserved. Filters and schema checks need
              safely representable JavaScript numbers; JSON Pointer selects
              large IDs without rounding.
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="text-sm text-primary">
              {notice}
            </p>
          )}
          {busy && (
            <div
              role="status"
              className="flex items-center gap-3 text-sm text-muted-foreground"
            >
              Working locally…
              <Button variant="ghost" size="sm" onClick={cancel}>
                <IconX aria-hidden="true" />
                Cancel operation
              </Button>
            </div>
          )}
        </div>
      </WorkspaceTabs>
      {output && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-marketing-surface p-4">
          <div className="min-w-0 flex-1">
            <label
              htmlFor="json-download-name"
              className="mb-2 block text-sm font-medium"
            >
              Download filename
            </label>
            <Input
              id="json-download-name"
              value={downloadName}
              onChange={(event) => setDownloadName(event.target.value)}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              .{output.extension} is added automatically.
            </p>
          </div>
          <Button onClick={download}>
            <IconDownload aria-hidden="true" />
            {output.extension === "json"
              ? "Download JSON"
              : `Download ${output.extension.toUpperCase()}`}
          </Button>
          {output.note && (
            <p className="w-full text-xs leading-6 text-muted-foreground">
              {output.note}
            </p>
          )}
        </div>
      )}
      <p className="text-xs leading-6 text-muted-foreground">
        Source, comparison and schema text stay in this tab and clear on
        refresh. Files are not uploaded. The editor never runs pasted
        JavaScript. Cancel stops the worker without changing your source.
      </p>
    </div>
  )
}
