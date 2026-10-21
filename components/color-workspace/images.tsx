"use client"
import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { checkImageHeader, paletteFromPixels } from "@/lib/color/palette"
import { sampleProblem, sampleSize } from "@/lib/color/sample"
import { panel, Swatch, type Tell } from "./shared"
export function ImagePanel({
  tell,
  onUse,
  onPalette,
}: {
  tell: Tell
  onUse: (color: string) => void
  onPalette: (colors: string[]) => void
}) {
  const [colors, setColors] = useState<string[]>([]),
    [name, setName] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [sampled, setSampled] = useState<string | null>(null),
    [point, setPoint] = useState({ x: 0, y: 0 }),
    [samplePoint, setSamplePoint] = useState({ x: 0, y: 0 }),
    [size, setSize] = useState({ width: 0, height: 0 })
  const canvas = useRef<HTMLCanvasElement>(null),
    job = useRef(0),
    fileInput = useRef<HTMLInputElement>(null)
  async function open(file: File) {
    const id = ++job.current
    setError("")
    setBusy(true)
    setColors([])
    setSampled(null)
    setName("")
    const image = new Image()
    let url = ""
    try {
      const problem = sampleProblem(file.type, file.size)
      if (problem) throw new Error(problem)
      checkImageHeader(
        new Uint8Array(await file.slice(0, 16).arrayBuffer()),
        file.type
      )
      if (id !== job.current) return
      url = URL.createObjectURL(file)
      image.src = url
      await image.decode()
      if (id !== job.current) return
      const { width, height } = sampleSize(
        image.naturalWidth,
        image.naturalHeight
      )
      const target = canvas.current!
      target.width = width
      target.height = height
      const context = target.getContext("2d", { willReadFrequently: true })!
      context.clearRect(0, 0, width, height)
      context.drawImage(image, 0, 0, width, height)
      const found = paletteFromPixels(
        context.getImageData(0, 0, width, height).data,
        8
      ).map((p) => p.color)
      if (!found.length)
        throw new Error(
          "There are no visible pixels to extract. Try an image with less transparency."
        )
      setColors(found)
      setName(file.name)
      setSize({ width, height })
      setPoint({ x: 0, y: 0 })
      tell(`Extracted ${found.length} representative colors from ${file.name}.`)
    } catch (e) {
      if (id === job.current) setError((e as Error).message)
    } finally {
      URL.revokeObjectURL(url)
      if (id === job.current) setBusy(false)
    }
  }
  function pick(x: number, y: number) {
    const context = canvas.current?.getContext("2d")
    if (!context) return
    const rgba = context.getImageData(x, y, 1, 1).data
    const value = `rgb(${rgba[0]} ${rgba[1]} ${rgba[2]} / ${(rgba[3] / 255).toFixed(6)})`
    setPoint({ x, y })
    setSamplePoint({ x, y })
    setSampled(value)
    tell(`Selected pixel ${x + 1}, ${y + 1} in the resized sRGB preview.`)
  }
  return (
    <section
      className={panel}
      onDragOver={(e) => {
        e.preventDefault()
      }}
      onDrop={(e) => {
        e.preventDefault()
        const file = e.dataTransfer.files[0]
        if (file) void open(file)
      }}
    >
      <h2 className="section-title">Find colors in an image</h2>
      <p className="text-sm text-muted-foreground">
        Open or drop an image. Representative swatches and pixel sampling stay
        on your device.
      </p>
      <label className="inline-flex min-h-11 cursor-pointer items-center rounded-md border px-3 text-sm font-medium focus-within:ring-2 focus-within:ring-ring">
        <span>{busy ? "Reading image…" : "Choose an image"}</span>
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          aria-label="Choose an image for colors"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ""
            if (file) void open(file)
          }}
        />
      </label>
      {busy && (
        <p role="status" className="text-sm">
          Reading locally…
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className={name ? "space-y-3" : "hidden"}>
        <p className="text-sm break-all">
          {name} · sample {size.width} × {size.height}
        </p>
        <div className="relative max-w-xl">
          <canvas
            ref={canvas}
            role="img"
            aria-label="Resized image for color sampling"
            className="checkerboard block w-full max-w-xl cursor-crosshair rounded-lg border"
            onClick={(e) => {
              const box = e.currentTarget.getBoundingClientRect()
              pick(
                Math.min(
                  size.width - 1,
                  Math.floor(((e.clientX - box.left) / box.width) * size.width)
                ),
                Math.min(
                  size.height - 1,
                  Math.floor(((e.clientY - box.top) / box.height) * size.height)
                )
              )
            }}
          />
          {sampled && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background ring-2 ring-foreground"
              style={{
                left: `${((samplePoint.x + 0.5) / size.width) * 100}%`,
                top: `${((samplePoint.y + 0.5) / size.height) * 100}%`,
              }}
            />
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Click the preview, or choose exact preview coordinates below. The
          preview is resized to at most 256 pixels on a side and converted by
          the browser to sRGB; these are not original-file pixel coordinates.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          {(["x", "y"] as const).map((axis) => (
            <label key={axis} className="space-y-2 text-sm font-medium">
              <span className="block">Pixel {axis.toUpperCase()}</span>
              <input
                className="h-11 w-24 rounded-md border border-input bg-background px-2.5 md:h-9"
                aria-label={`Pixel ${axis.toUpperCase()}`}
                type="number"
                min={1}
                max={axis === "x" ? size.width : size.height}
                value={point[axis] + 1}
                onChange={(e) =>
                  setPoint({
                    ...point,
                    [axis]: Math.max(
                      0,
                      Math.min(
                        (axis === "x" ? size.width : size.height) - 1,
                        Number(e.target.value) - 1
                      )
                    ),
                  })
                }
              />
            </label>
          ))}
          <Button variant="outline" onClick={() => pick(point.x, point.y)}>
            Sample this pixel
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              job.current++
              setName("")
              setColors([])
              setSampled(null)
              setError("")
            }}
          >
            Remove image
          </Button>
        </div>
        {sampled && (
          <div className="max-w-xs">
            <Swatch
              value={sampled}
              label="Sampled pixel"
              tell={tell}
              onUse={onUse}
            />
          </div>
        )}
      </div>
      {colors.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {colors.map((value, i) => (
              <Swatch
                key={i}
                value={value}
                label={`Image color ${i + 1}`}
                tell={tell}
                onUse={onUse}
              />
            ))}
          </div>
          <Button variant="outline" onClick={() => onPalette(colors)}>
            Use image colors as palette
          </Button>
        </>
      )}
      <p className="text-xs leading-6 text-muted-foreground">
        PNG, JPEG, WebP or GIF, up to 10 MiB and 30 million pixels.
        Dominant-color sampling ignores pixels below 50% opacity and can miss
        small details. For an exact preview pixel, use the coordinate fields.
        Images and palettes are cleared on refresh.
      </p>
    </section>
  )
}
