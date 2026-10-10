import Link from "next/link"
import { IconChevronDown } from "@tabler/icons-react"
import { StructuredData } from "@/components/structured-data"
import { TutorialVideo } from "@/components/tutorial-video"
import { absoluteUrl } from "@/lib/site"

export interface TutorialContent {
  /**
   * The tutorial video, once one has been recorded; without it the written
   * steps stand alone.
   */
  video?: {
    /** Base name of the files in /public/videos, e.g. "image-compressor-tutorial". */
    file: string
    /** Keep in step with the file written by `npm run tutorial:video`. */
    duration: { iso: string; label: string }
    uploadDate: string
  }
  name: string
  description: string
  /** Sentence under the heading. */
  intro: string
  steps: { title: string; text: string }[]
  options: { term: string; detail: string }[]
  /** The journal article that goes with the tool, once it is written. */
  guideHref?: string
}

/** Help section for a tool: tutorial video with captions, written steps and an options reference. */
export function ToolTutorial({ content }: { content: TutorialContent }) {
  const film = content.video
  const video = `/videos/${film?.file}.mp4`
  const poster = `/videos/${film?.file}-poster.webp`
  const captions = `/videos/${film?.file}.vtt`
  const { steps, options } = content
  return (
    <section aria-labelledby="tutorial-title" className="mt-8 border-t pt-5">
      {film && (
        <StructuredData
          data={{
            "@context": "https://schema.org",
            "@type": "VideoObject",
            name: content.name,
            description: content.description,
            thumbnailUrl: absoluteUrl(poster),
            contentUrl: absoluteUrl(video),
            uploadDate: film.uploadDate,
            duration: film.duration.iso,
          }}
        />
      )}
      <h2 id="tutorial-title" className="section-title">
        A little help along the way
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">{content.intro}</p>
      <div className="mt-5 grid gap-6 lg:grid-cols-5">
        {film && (
          <figure className="min-w-0 lg:col-span-3">
            <TutorialVideo video={video} poster={poster} captions={captions} />
            <figcaption className="mt-2 text-xs text-muted-foreground">
              {film.duration.label}, no sound. On-screen captions describe each
              step; the same steps are written out here.
            </figcaption>
          </figure>
        )}
        <ol
          id="tutorial-steps"
          className={
            film
              ? "space-y-4 lg:col-span-2"
              : "grid gap-4 sm:grid-cols-2 lg:col-span-5"
          }
        >
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
      {content.guideHref && (
        <Link
          href={content.guideHref}
          className="mt-3 inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4"
        >
          Read the step-by-step guide
        </Link>
      )}
    </section>
  )
}
