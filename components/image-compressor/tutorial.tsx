import Link from "next/link"
import { IconChevronDown } from "@tabler/icons-react"
import { StructuredData } from "@/components/structured-data"
import { absoluteUrl } from "@/lib/site"

const VIDEO = "/videos/image-compressor-tutorial.mp4"
const POSTER = "/videos/image-compressor-tutorial-poster.webp"
const CAPTIONS = "/videos/image-compressor-tutorial.vtt"
/** Keep in step with the file written by `npm run tutorial:video`. */
const DURATION = { iso: "PT1M44S", label: "1 min 44 s" }

const steps = [
  {
    title: "Add an image",
    text: "Drop a file on the page, choose one, paste with ⌘V or Ctrl+V, or try the sample. JPEG, PNG, WebP, AVIF, HEIC, GIF, BMP, TIFF, ICO, SVG and JPEG XL all work.",
  },
  {
    title: "Compare before you download",
    text: "Smart compression starts straight away. Drag the divider, or use the arrow keys, to see the original on the left and the result on the right. Zoom to 100% or 200% for fine detail.",
  },
  {
    title: "Choose a format",
    text: "Same as original keeps your file type. WebP and AVIF are usually smaller. Auto tries several formats and keeps the smallest file.",
  },
  {
    title: "Resize to fit",
    text: "Pick 75%, 50% or 25%, a long edge such as 1280 px, or exact width and height in pixels or percent.",
  },
  {
    title: "Crop and rotate",
    text: "Choose a shape such as 1:1 or 16:9, drag the box or its handles, or type exact pixels. Rotate and flip in one click.",
  },
  {
    title: "Download",
    text: "Check the saving and the measured detail kept, then download. Your image never leaves your device.",
  },
]

const options: { term: string; detail: string }[] = [
  {
    term: "Same as original",
    detail:
      "Writes the same file type when possible, so the result can replace the original. HEIC, TIFF, GIF, BMP, SVG and JPEG XL become JPEG, or PNG if they have transparency.",
  },
  {
    term: "Auto (smallest)",
    detail:
      "Compresses with several formats and keeps the smallest file. It takes longer because each format is tested.",
  },
  {
    term: "WebP, AVIF, JPEG, PNG",
    detail:
      "AVIF is often the smallest and slowest to encode. WebP is small and widely supported. JPEG suits photos everywhere. PNG keeps sharp edges and transparency, using an optimised palette unless you choose Lossless.",
  },
  {
    term: "Smart, Smallest, High quality",
    detail:
      "Each searches for the lowest quality that still measures close to your original. Smart is balanced, Smallest accepts softer detail, High quality keeps almost everything. Text and flat graphics are judged by their weakest areas so edges stay clean.",
  },
  {
    term: "Lossless",
    detail: "Keeps every pixel exactly. Available for PNG and WebP.",
  },
  {
    term: "Custom",
    detail: "Sets the encoder quality directly, from 1 to 100.",
  },
  {
    term: "Target size",
    detail:
      "Finds the highest quality that fits a limit in KB or MB. With Allow smaller dimensions on, the image shrinks step by step if quality alone is not enough.",
  },
  {
    term: "Size",
    detail:
      "Original, 75%, 50%, 25%, a long-edge preset, or Custom. Custom accepts pixels or percent. Keep proportions links width and height; turn it off to choose Fit inside, Fill and crop, or Stretch.",
  },
  {
    term: "Crop and rotate",
    detail:
      "Shapes: Free, Original, 1:1, 4:5, 4:3, 3:2, 16:9 and 9:16. In the crop view, drag the box or its eight handles, use the arrow keys to move it (hold Shift for 10 px, Alt to resize), or type Left, Top, Width and Height. Rotate left or right and flip either way.",
  },
  {
    term: "Advanced options",
    detail:
      "Encoder effort (Fast, Balanced, Maximum), resampling (Lanczos, Mitchell, Catmull-Rom), the background for transparent images saved as JPEG, colour detail for JPEG and AVIF (4:2:0 or 4:4:4), progressive JPEG, PNG palette size and dithering.",
  },
  {
    term: "Limits",
    detail:
      "Files up to 50 MB and 50 megapixels; outputs up to 16,383 px per side. Animated files use their first frame. SVG is drawn at least 1024 px on its long edge. Very large images may be too big for some phone browsers.",
  },
  {
    term: "Privacy",
    detail:
      "Everything runs in your browser. Files are not uploaded. Metadata such as camera details and location is removed, and colours are converted to sRGB. Keep your original until you are happy with the result.",
  },
]

export function ImageCompressorTutorial() {
  return (
    <section aria-labelledby="tutorial-title" className="mt-8 border-t pt-5">
      <StructuredData
        data={{
          "@context": "https://schema.org",
          "@type": "VideoObject",
          name: "How to use the KeepSimp image compressor",
          description:
            "A short tour of compressing, comparing, converting, resizing, cropping and downloading an image in your browser.",
          thumbnailUrl: absoluteUrl(POSTER),
          contentUrl: absoluteUrl(VIDEO),
          uploadDate: "2026-10-10",
          duration: DURATION.iso,
        }}
      />
      <h2 id="tutorial-title" className="section-title">
        A little help along the way
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Watch the tour, or follow the same six steps below. Every option is
        explained underneath.
      </p>
      <div className="mt-5 grid gap-6 lg:grid-cols-5">
        <figure className="min-w-0 lg:col-span-3">
          <video
            controls
            playsInline
            preload="none"
            poster={POSTER}
            width={1920}
            height={1080}
            aria-describedby="tutorial-steps"
            className="aspect-video h-auto w-full rounded-xl border bg-muted"
          >
            <source src={VIDEO} type="video/mp4" />
            <track
              kind="captions"
              src={CAPTIONS}
              srcLang="en"
              label="English"
            />
            Your browser cannot play this video.{" "}
            <a href={VIDEO} download>
              Download the tutorial
            </a>
            .
          </video>
          <figcaption className="mt-2 text-xs text-muted-foreground">
            {DURATION.label}, no sound. On-screen captions describe each step;
            the same steps are written out here.
          </figcaption>
        </figure>
        <ol id="tutorial-steps" className="space-y-4 lg:col-span-2">
          {steps.map((step, index) => (
            <li key={step.title} className="flex gap-3">
              <span
                aria-hidden="true"
                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
              >
                {index + 1}
              </span>
              <span>
                <span className="block text-sm font-medium">{step.title}</span>
                <span className="text-sm text-muted-foreground">
                  {step.text}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </div>
      <details className="group mt-6 rounded-xl border bg-card">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 font-heading text-base font-medium md:min-h-9 [&::-webkit-details-marker]:hidden">
          Every option explained
          <IconChevronDown
            className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </summary>
        <dl className="grid gap-x-6 gap-y-4 border-t px-4 py-4 sm:grid-cols-2">
          {options.map((option) => (
            <div key={option.term}>
              <dt className="text-sm font-medium">{option.term}</dt>
              <dd className="mt-1 text-sm text-muted-foreground">
                {option.detail}
              </dd>
            </div>
          ))}
        </dl>
      </details>
      <Link
        href="/blog/compress-images-without-uploading/"
        className="mt-3 inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4"
      >
        Read the step-by-step guide
      </Link>
    </section>
  )
}
