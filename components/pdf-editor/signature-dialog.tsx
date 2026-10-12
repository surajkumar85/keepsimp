"use client"

import { useEffect, useId, useRef, useState, type PointerEvent } from "react"
import { IconEraser, IconPhotoUp, IconTrash } from "@tabler/icons-react"
import { ToggleRow } from "@/components/image-batch/controls"
import { Button, buttonVariants } from "@/components/ui/button"
import { ChoiceChips } from "@/components/ui/choice-chips"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { FAMILY_LABELS, screenFamily } from "@/lib/pdf-editor/fonts"
import type { Point } from "@/lib/pdf-editor/geometry"
import { strokePath } from "@/lib/pdf-editor/ink"
import {
  HAND_FAMILIES,
  type Colour,
  type HandFamily,
} from "@/lib/pdf-editor/objects"
import {
  inkOnly,
  LARGEST_REMEMBERED,
  LONGEST_SIGNATURE,
  readSignature,
  seenBox,
  type Signature,
  type SignatureSlot,
} from "@/lib/pdf-editor/signature"
import { cssColour, sameColour } from "@/lib/pdf-editor/styles"
import { cn } from "cn"

/** Where each of a person's two marks is kept, on this device only, when they ask for it. */
const KEYS: Record<SignatureSlot, string> = {
  signature: "keepsimp.signature",
  initials: "keepsimp.initials",
}

/** The inks a signature is made in. */
const INKS: { name: string; colour: Colour }[] = [
  { name: "Black", colour: [0, 0, 0] },
  { name: "Blue", colour: [0.1, 0.25, 0.75] },
]

type How = "draw" | "type" | "picture"

function remembered(slot: SignatureSlot): Signature | null {
  try {
    const kept = localStorage.getItem(KEYS[slot])
    return kept ? readSignature(JSON.parse(kept)) : null
  } catch {
    return null
  }
}

function forget(slot: SignatureSlot) {
  try {
    localStorage.removeItem(KEYS[slot])
  } catch {
    // There was nothing to forget.
  }
}

function remember(slot: SignatureSlot, signature: Signature) {
  try {
    localStorage.setItem(KEYS[slot], JSON.stringify(signature))
  } catch {
    // The browser has no room, or keeps nothing: it is used this once.
  }
}

/** A signature shown small: strokes as a drawing, words in their font, a picture as it is. */
function Preview({
  signature,
  colour,
}: {
  signature: Signature
  colour: Colour
}) {
  if (signature.kind === "type")
    return (
      <span
        className="block truncate text-3xl leading-tight"
        style={{
          fontFamily: `"${screenFamily(signature.font)}", cursive`,
          color: cssColour(colour),
        }}
      >
        {signature.text}
      </span>
    )
  if (signature.kind === "picture")
    return (
      // eslint-disable-next-line @next/next/no-img-element -- A picture the person made, held in the page; there is no address to optimise.
      <img
        src={signature.data}
        alt="Your signature"
        className="max-h-16 max-w-full object-contain"
      />
    )
  const all = signature.strokes.flat()
  const left = Math.min(...all.map((point) => point.x))
  const top = Math.min(...all.map((point) => point.y))
  const wide = Math.max(1, Math.max(...all.map((point) => point.x)) - left)
  const tall = Math.max(1, Math.max(...all.map((point) => point.y)) - top)
  return (
    <svg
      role="img"
      aria-label="Your signature"
      viewBox={`${left - 4} ${top - 4} ${wide + 8} ${tall + 8}`}
      className="h-16 max-w-full"
    >
      {signature.strokes.map((stroke, at) => (
        <path
          key={at}
          d={strokePath(stroke)}
          fill="none"
          stroke={cssColour(colour)}
          strokeWidth={Math.max(1.5, wide / 120)}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  )
}

/** A pad to sign on with a mouse, a pen or a finger. */
function Pad({
  strokes,
  onStrokes,
  colour,
}: {
  strokes: Point[][]
  onStrokes: (strokes: Point[][]) => void
  colour: Colour
}) {
  const pad = useRef<SVGSVGElement>(null)
  const [drawing, setDrawing] = useState<Point[] | null>(null)
  const at = (event: PointerEvent) => {
    const box = pad.current!.getBoundingClientRect()
    // The pad is always 480 by 160 of its own units, however large it is shown.
    return {
      x: ((event.clientX - box.left) / box.width) * 480,
      y: ((event.clientY - box.top) / box.height) * 160,
    }
  }
  const all = drawing ? [...strokes, drawing] : strokes
  return (
    <svg
      ref={pad}
      role="img"
      aria-label={
        strokes.length
          ? "What you have drawn"
          : "A place to draw your signature with a mouse, a pen or a finger"
      }
      data-testid="signature-pad"
      data-strokes={strokes.length}
      viewBox="0 0 480 160"
      className="block w-full cursor-crosshair touch-none rounded-lg border bg-white"
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.currentTarget.setPointerCapture(event.pointerId)
        setDrawing([at(event)])
      }}
      onPointerMove={(event) => {
        if (drawing) setDrawing([...drawing, at(event)])
      }}
      onPointerUp={() => {
        if (drawing) onStrokes([...strokes, drawing])
        setDrawing(null)
      }}
      onPointerCancel={() => setDrawing(null)}
    >
      <line
        x1={24}
        y1={124}
        x2={456}
        y2={124}
        className="stroke-muted-foreground/40"
        strokeWidth={1}
        strokeDasharray="4 4"
      />
      {all.map((stroke, index) => (
        <path
          key={index}
          d={strokePath(stroke)}
          fill="none"
          stroke={cssColour(colour)}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  )
}

/** A picture of a signature with the paper taken out and cut to the ink, as a PNG's address. */
async function fromPicture(file: Blob): Promise<Signature | null> {
  const bitmap = await createImageBitmap(file)
  try {
    // Large enough to stay sharp at the size a signature is placed, small enough to keep.
    const scale = Math.min(1, 900 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext("2d", { willReadFrequently: true })
    if (!context) return null
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const cleared = inkOnly(
      context.getImageData(0, 0, canvas.width, canvas.height)
    )
    const box = seenBox(cleared)
    if (!box) return null
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.putImageData(
      new ImageData(
        new Uint8ClampedArray(cleared.data),
        cleared.width,
        cleared.height
      ),
      0,
      0
    )
    const cut = document.createElement("canvas")
    cut.width = box.width
    cut.height = box.height
    cut
      .getContext("2d")
      ?.drawImage(
        canvas,
        box.x,
        box.y,
        box.width,
        box.height,
        0,
        0,
        box.width,
        box.height
      )
    return {
      kind: "picture",
      data: cut.toDataURL("image/png"),
      width: box.width,
      height: box.height,
    }
  } finally {
    bitmap.close()
  }
}

/**
 * The window a signature is made in: drawn, typed in a font that looks
 * written by hand, or taken from a picture with the paper removed. It can
 * be remembered on this device, and only there, for the next time.
 */
export function SignatureDialog({
  open,
  onClose,
  onUse,
  loadFont,
}: {
  open: boolean
  onClose: () => void
  /** Place it on the page. */
  onUse: (signature: Signature, slot: SignatureSlot, colour: Colour) => void
  /** Make one of the editor's fonts ready for the screen. */
  loadFont: (key: string) => Promise<void>
}) {
  const ids = useId()
  const [slot, setSlot] = useState<SignatureSlot>("signature")
  const [how, setHow] = useState<How>("draw")
  const [colour, setColour] = useState<Colour>(INKS[0].colour)
  const [strokes, setStrokes] = useState<Point[][]>([])
  const [text, setText] = useState("")
  const [font, setFont] = useState<HandFamily>("sacramento")
  const [picture, setPicture] = useState<Signature | null>(null)
  const [problem, setProblem] = useState("")
  const [keep, setKeep] = useState(false)
  /** What is remembered for the kind of mark being made; null when nothing is. */
  const [kept, setKept] = useState<Signature | null>(null)
  const [fonts, setFonts] = useState(false)

  // What was remembered is looked up when the window opens, and for each of the two marks.
  const [seen, setSeen] = useState("")
  const now = `${open}/${slot}`
  if (open && seen !== now) {
    // Remembering is asked for each time; it never stays switched on.
    if (!seen) setKeep(false)
    setSeen(now)
    setKept(remembered(slot))
  }
  if (!open && seen) setSeen("")

  // The fonts that look written by hand are fetched when they are first wanted.
  const wanted = open && (how === "type" || kept?.kind === "type")
  useEffect(() => {
    if (!wanted || fonts) return
    let stale = false
    void Promise.all(HAND_FAMILIES.map(loadFont)).then(
      () => !stale && setFonts(true),
      () =>
        !stale &&
        setProblem("The fonts could not be loaded. Check your connection.")
    )
    return () => {
      stale = true
    }
  }, [wanted, fonts, loadFont])

  const made: Signature | null =
    how === "draw"
      ? strokes.length
        ? { kind: "draw", strokes }
        : null
      : how === "type"
        ? text.trim()
          ? { kind: "type", text: text.trim(), font }
          : null
        : picture

  const use = (signature: Signature) => {
    // A picture too large to keep, or a browser that keeps nothing, does not
    // stop the signing: it is placed this once and not remembered.
    if (
      keep &&
      signature !== kept &&
      (signature.kind !== "picture" ||
        signature.data.length <= LARGEST_REMEMBERED)
    )
      remember(slot, signature)
    onUse(signature, slot, colour)
    onClose()
  }

  const word = slot === "initials" ? "initials" : "signature"

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className="max-w-xl overflow-y-auto"
        data-testid="signature-dialog"
      >
        <DialogHeader>
          <DialogTitle>Your {word}</DialogTitle>
          <DialogDescription>
            Draw it, type it or use a picture of it. It is placed on the page
            like ink on paper; it is not a certificate that proves who signed.
          </DialogDescription>
        </DialogHeader>

        <ChoiceChips
          label="What to place"
          hideLabel
          value={slot}
          onValueChange={setSlot}
          options={[
            { value: "signature", label: "Signature" },
            { value: "initials", label: "Initials" },
          ]}
        />

        {kept && (
          <section
            aria-labelledby={`${ids}-kept`}
            className="space-y-3 rounded-lg border p-3"
            data-testid="signature-kept"
          >
            <h3 id={`${ids}-kept`} className="text-sm font-medium">
              Remembered on this device
            </h3>
            <div className="flex min-h-16 items-center rounded-md bg-white px-3">
              <Preview signature={kept} colour={colour} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => use(kept)}>Place it on the page</Button>
              <Button
                variant="outline"
                onClick={() => {
                  forget(slot)
                  setKept(null)
                }}
              >
                <IconTrash aria-hidden="true" /> Forget it
              </Button>
            </div>
          </section>
        )}

        <ChoiceChips
          label={kept ? "Or make another" : "How to make it"}
          value={how}
          onValueChange={(next: How) => {
            setHow(next)
            setProblem("")
          }}
          options={[
            { value: "draw", label: "Draw" },
            { value: "type", label: "Type" },
            { value: "picture", label: "Picture" },
          ]}
        />

        {how === "draw" && (
          <div className="space-y-2">
            <Pad strokes={strokes} onStrokes={setStrokes} colour={colour} />
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Sign on the line with a mouse, a pen or a finger.
              </p>
              <Button
                variant="ghost"
                disabled={!strokes.length}
                onClick={() => setStrokes([])}
              >
                <IconEraser aria-hidden="true" /> Clear
              </Button>
            </div>
          </div>
        )}

        {how === "type" && (
          <div className="space-y-3">
            <div>
              <label
                htmlFor={`${ids}-name`}
                className="mb-2 block text-sm font-medium"
              >
                {slot === "initials" ? "Your initials" : "Your name"}
              </label>
              <Input
                id={`${ids}-name`}
                value={text}
                maxLength={LONGEST_SIGNATURE}
                autoComplete="name"
                onChange={(event) => setText(event.target.value)}
              />
            </div>
            <div
              role="radiogroup"
              aria-label="Handwriting"
              className="grid gap-2 sm:grid-cols-2"
            >
              {HAND_FAMILIES.map((family) => (
                <button
                  key={family}
                  type="button"
                  role="radio"
                  aria-checked={font === family}
                  aria-label={FAMILY_LABELS[family]}
                  onClick={() => setFont(family)}
                  className={cn(
                    "flex min-h-16 items-center overflow-hidden rounded-lg border bg-white px-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    font === family && "border-primary ring-1 ring-primary"
                  )}
                >
                  <span
                    className="block truncate text-2xl leading-tight"
                    style={{
                      fontFamily: `"${screenFamily(family)}", cursive`,
                      color: cssColour(colour),
                      visibility: fonts ? "visible" : "hidden",
                    }}
                  >
                    {text.trim() || FAMILY_LABELS[family]}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {how === "picture" && (
          <div className="space-y-2">
            <input
              id={`${ids}-picture`}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-label="Choose a picture of your signature"
              className="peer sr-only"
              onChange={(event) => {
                const [file] = Array.from(event.target.files ?? [])
                event.target.value = ""
                if (!file) return
                setProblem("")
                void fromPicture(file).then(
                  (found) => {
                    setPicture(found)
                    if (!found)
                      setProblem(
                        "No ink could be told from the paper in this picture. Try a photo with a plain, light background."
                      )
                  },
                  () => setProblem("This picture could not be read.")
                )
              }}
            />
            <label
              htmlFor={`${ids}-picture`}
              className={cn(
                buttonVariants({ variant: "outline" }),
                "cursor-pointer peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50"
              )}
            >
              <IconPhotoUp aria-hidden="true" /> Choose a picture
            </label>
            <p className="text-xs text-muted-foreground">
              A photo or scan of your signature on light paper. The paper is
              taken out, so only the ink is placed.
            </p>
            {picture && (
              <div
                className="flex min-h-20 items-center justify-center rounded-lg border bg-muted p-3"
                data-testid="signature-picture"
              >
                <Preview signature={picture} colour={colour} />
              </div>
            )}
          </div>
        )}

        {how !== "picture" && (
          <div
            role="group"
            aria-label="Ink"
            className="flex items-center gap-1"
          >
            <span className="pr-1 text-sm font-medium">Ink</span>
            {INKS.map((ink) => (
              <button
                key={ink.name}
                type="button"
                aria-label={`Ink: ${ink.name}`}
                title={ink.name}
                aria-pressed={sameColour(ink.colour, colour)}
                onClick={() => setColour(ink.colour)}
                className="group flex size-11 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring md:size-9"
              >
                <span
                  className="block size-6 rounded-full border border-foreground/25 group-aria-pressed:ring-2 group-aria-pressed:ring-primary group-aria-pressed:ring-offset-2 group-aria-pressed:ring-offset-popover md:size-5"
                  style={{ backgroundColor: cssColour(ink.colour) }}
                />
              </button>
            ))}
          </div>
        )}

        <ToggleRow
          label={`Remember this ${word} on this device`}
          hint="Kept in this browser only, for the next time you sign. It is never sent anywhere, and you can forget it here."
          checked={keep}
          onCheckedChange={setKeep}
        />

        {problem && (
          <p role="alert" className="text-sm text-destructive">
            {problem}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!made} onClick={() => made && use(made)}>
            Place it on the page
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
