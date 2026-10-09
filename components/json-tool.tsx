"use client"

import { useState } from "react"
import { IconBraces, IconDownload, IconCheck } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { formatJson } from "@/lib/json-tools"

export function JsonTool() {
  const [input, setInput] = useState("")
  const [output, setOutput] = useState("")
  const [error, setError] = useState("")
  const [copied, setCopied] = useState(false)
  function format(minify = false) {
    try {
      setOutput(formatJson(input, minify))
      setError("")
      setCopied(false)
    } catch (e) {
      setError((e as Error).message)
      setOutput("")
    }
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([output], { type: "application/json" })
    )
    const link = document.createElement("a")
    link.href = url
    link.download = "formatted-keepsimp.json"
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => {
            setInput(
              '{"name":"KeepSimp","free":true,"tools":["images","JSON"]}'
            )
            setOutput("")
            setError("")
          }}
        >
          Use example
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setInput("")
            setOutput("")
            setError("")
          }}
        >
          Clear
        </Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <label htmlFor="json-input" className="mb-2 block font-medium">
            Your JSON
          </label>
          <textarea
            id="json-input"
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              setOutput("")
              setError("")
            }}
            className="code-editor"
            placeholder='{"hello": "world"}'
            spellCheck={false}
            autoComplete="off"
            maxLength={1_000_001}
            aria-describedby="json-help"
            aria-invalid={!!error}
          />
        </div>
        <div>
          <label htmlFor="json-output" className="mb-2 block font-medium">
            Formatted result
          </label>
          <textarea
            id="json-output"
            value={output}
            readOnly
            className="code-editor"
            placeholder="Your formatted JSON will appear here."
            spellCheck={false}
            autoComplete="off"
          />
        </div>
      </div>
      <p id="json-help" className="text-sm text-muted-foreground">
        Up to 1 million characters. Number precision and key order are
        preserved. Your text stays in this tab.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => format()}>
          <IconBraces aria-hidden="true" /> Format JSON
        </Button>
        <Button variant="outline" onClick={() => format(true)}>
          Minify
        </Button>
        <Button variant="outline" disabled={!output} onClick={download}>
          <IconDownload aria-hidden="true" /> Download JSON
        </Button>
        <Button
          variant="ghost"
          disabled={!output}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(output)
              setCopied(true)
            } catch {
              setError(
                "Clipboard is unavailable. Select the result to copy it, or download the file."
              )
            }
          }}
        >
          {copied ? (
            <>
              <IconCheck aria-hidden="true" /> Copied
            </>
          ) : (
            "Copy result"
          )}
        </Button>
      </div>
    </div>
  )
}
