import Link from "next/link"
import {
  IconArrowRight,
  IconArrowUpRight,
  IconBraces,
  IconCertificate,
  IconCheck,
  IconCloudOff,
  IconDeviceDesktop,
  IconEyeOff,
  IconFileTypePdf,
  IconMarkdown,
  IconMathFunction,
  IconMovie,
  IconMusic,
  IconPhoto,
  IconPlus,
  IconScan,
  IconTextRecognition,
  IconUserOff,
  IconVolume,
  IconWifiOff,
  IconZoomScan,
} from "@tabler/icons-react"
import { AppTile } from "@/components/agent/app-logo"
import { EditorialImage } from "@/components/editorial-image"
import { DropAnything } from "@/components/landing/drop-anything"
import { StructuredData } from "@/components/structured-data"
import { ToolIcon, categoryTone } from "@/components/tool-icon"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "cn"
import { agentClients } from "@/lib/agent/clients"
import { BRIDGE_COMMAND } from "@/lib/agent/setup"
import { posts } from "@/lib/blog"
import { categories } from "@/lib/catalogue"
import { families, pagesOf, toolById } from "@/lib/landing"
import { pageMetadata, absoluteUrl, site } from "@/lib/site"

const summary =
  "Edit video and sound, sign and fill in PDFs, write Markdown and make pictures lighter, with free tools that run in your browser. No account. No uploads."

export const metadata = pageMetadata(
  "Free private tools for video, audio, PDF and images",
  summary,
  "/"
)

/** Files lying around the drop box on wide screens: what people bring. */
const scattered = [
  {
    name: "holiday.mov",
    icon: IconMovie,
    tone: categoryTone.video.tile,
    place: "left-0 top-6 -rotate-6",
  },
  {
    name: "interview.m4a",
    icon: IconMusic,
    tone: categoryTone.audio.tile,
    place: "left-10 top-40 rotate-3",
  },
  {
    name: "notes.md",
    icon: IconMarkdown,
    tone: categoryTone.document.tile,
    place: "left-2 top-72 -rotate-2",
  },
  {
    name: "contract.pdf",
    icon: IconFileTypePdf,
    tone: categoryTone.document.tile,
    place: "right-0 top-4 rotate-6",
  },
  {
    name: "photo.heic",
    icon: IconPhoto,
    tone: categoryTone.image.tile,
    place: "right-12 top-40 -rotate-3",
  },
  {
    name: "data.json",
    icon: IconBraces,
    tone: categoryTone.developer.tile,
    place: "right-2 top-72 rotate-2",
  },
]

/** The harder jobs, said plainly, each opening the page that does it. */
const depth = [
  {
    tool: "sign-pdf",
    icon: IconCertificate,
    title: "Sign by hand or with a certificate",
    text: "Draw or type a signature, or sign with your own certificate file. The signature is checked before you get the file.",
  },
  {
    tool: "redact-pdf",
    icon: IconEyeOff,
    title: "Redaction that removes",
    text: "Marked words, pictures and drawings are taken out of the file, not covered, and the result is read back to be sure.",
  },
  {
    tool: "ocr-pdf",
    icon: IconScan,
    title: "Scans you can search",
    text: "Tesseract reads the words in a scanned page on your device and lays them unseen under the picture.",
  },
  {
    tool: "transcribe-audio",
    icon: IconTextRecognition,
    title: "Speech to text",
    text: "Whisper writes down what is said, with times, as text or subtitles. It can mishear, so read it through.",
  },
  {
    tool: "normalize-audio",
    icon: IconVolume,
    title: "Loudness to a target",
    text: "Measure loudness the way streaming services do and set it to a target, with peaks kept under a ceiling.",
  },
  {
    tool: "video-compressor",
    icon: IconZoomScan,
    title: "A video that fits",
    text: "Bring a video under 8, 10 or 25 MB, or a size of your own, with its quality checked.",
  },
  {
    tool: "markdown-editor",
    icon: IconMathFunction,
    title: "Maths, diagrams and slides",
    text: "Write formulas, Mermaid diagrams and slides in Markdown, then make a PDF, a Word file or a web page.",
  },
  {
    tool: "json-formatter",
    icon: IconBraces,
    title: "Every digit kept",
    text: "Format, query and convert JSON without rounding a large number or dropping a decimal place.",
  },
]

const faqs = [
  [
    "Is KeepSimp really free?",
    "Yes. Every tool is free to use, with no account and no payment.",
  ],
  [
    "Where do my files go?",
    "Nowhere. The tools read and write your files in your browser, so they are not uploaded. The site's host sends the pages and the tools' code, and a few engines, such as speech and text recognition, are fetched from this site the first time you use them.",
  ],
  [
    "Why is there one editor for so many jobs?",
    "Each kind of file has one editor that does all of its jobs. Pages such as Sign PDF or Video compressor open that editor ready for one job, with the rest a press away, so you never learn two tools for one file.",
  ],
  [
    "Can I use it on my phone?",
    "Yes, in a current mobile browser. Long videos and large PDFs take longer and need more memory on a phone than on a computer. You can add KeepSimp to your home screen.",
  ],
  [
    "Does it work offline?",
    "Yes. Install KeepSimp as an app, or visit the tools once, and they keep working without a connection.",
  ],
  [
    "Can my AI agent use the tools?",
    "Yes. Claude Code, Codex and other MCP clients can call them through the keepsimp-mcp bridge, which runs them in a browser on your own computer. Signing and recording stay for you to do yourself.",
  ],
]

/** How wide each group is: the PDF editor and the images share the first row, and the last group fills its row on tablets. */
const span: Record<string, string> = {
  pdf: "md:col-span-2 lg:col-span-4",
  images: "lg:col-span-2",
  developer: "md:col-span-2 lg:col-span-3",
}

const categoryLabel = (id: string) =>
  categories.find((category) => category.id === id)!.label

/** Three articles from different corners of the site. */
function featuredPosts() {
  const picked: (typeof posts)[number][] = []
  for (const family of ["video", "pdf", "markdown"]) {
    const ids = new Set(
      pagesOf(families.find((one) => one.id === family)!).map((tool) => tool.id)
    )
    const post = posts.find((one) => ids.has(one.tool) && !picked.includes(one))
    if (post) picked.push(post)
  }
  return picked
}

export default function LandingPage() {
  return (
    <>
      <StructuredData
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              "@id": `${site.origin}/#organization`,
              name: "KeepSimp",
              url: site.origin,
              logo: absoluteUrl("/brand/keepsimp-mark.svg"),
            },
            {
              "@type": "WebSite",
              "@id": `${site.origin}/#website`,
              name: "KeepSimp",
              url: site.origin,
              publisher: { "@id": `${site.origin}/#organization` },
              description: summary,
            },
          ],
        }}
      />
      <section
        className="hero-stage overflow-hidden pt-12 pb-14 sm:pt-16 sm:pb-20"
        aria-labelledby="landing-heading"
      >
        <div className="marketing-container relative text-center">
          <ul
            className="pointer-events-none absolute inset-x-0 top-56 hidden xl:block"
            aria-hidden="true"
          >
            {scattered.map(({ name, icon: Icon, tone, place }, index) => (
              <li
                key={name}
                className={cn(
                  "enter-soft absolute flex items-center gap-2.5 rounded-xl border bg-card py-2 pr-4 pl-2 text-sm shadow-sm",
                  place
                )}
                style={{ animationDelay: `${150 + index * 60}ms` }}
              >
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-lg",
                    tone
                  )}
                >
                  <Icon className="size-4.5" stroke={1.7} />
                </span>
                {name}
              </li>
            ))}
          </ul>
          <div className="enter-soft">
            <p className="mb-5 inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground">
              <span
                className="size-1.5 rounded-full bg-primary"
                aria-hidden="true"
              />
              Video · Audio · PDF · Images · Markdown · JSON
            </p>
            <h1 id="landing-heading" className="marketing-title text-balance">
              Do more with your files.{" "}
              <span className="block text-primary">Upload none of them.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-muted-foreground">
              Free tools for video, sound, PDFs, pictures and writing. They run
              in your browser, need no account and keep working offline.
            </p>
          </div>
          <div className="enter-delayed relative mt-9">
            <DropAnything />
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
            {[
              { icon: IconUserOff, text: "No sign-up" },
              { icon: IconCloudOff, text: "Nothing uploaded" },
              { icon: IconWifiOff, text: "Works offline" },
            ].map(({ icon: Icon, text }) => (
              <span key={text} className="flex items-center gap-1.5">
                <Icon className="size-3.5" aria-hidden="true" /> {text}
              </span>
            ))}
            <Link
              prefetch={false}
              href="/dashboard/"
              className="inline-flex min-h-11 items-center gap-1.5 font-medium text-foreground"
            >
              Browse all tools
              <IconArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <section
        id="tools"
        className="marketing-section border-t bg-marketing-surface"
        aria-labelledby="tools-heading"
      >
        <div className="marketing-container">
          <div className="mb-9 flex flex-wrap items-end justify-between gap-5">
            <div className="max-w-xl">
              <p className="eyebrow mb-3 text-primary">
                Everything in one place
              </p>
              <h2 id="tools-heading" className="marketing-heading">
                One editor for each kind of file.
              </h2>
              <p className="mt-3 text-base leading-7 text-muted-foreground">
                Open an editor and do anything it can, or start from the job
                itself: each has a page that opens the editor ready for it.
              </p>
            </div>
            <Link
              prefetch={false}
              href="/dashboard/"
              className="inline-flex min-h-11 items-center gap-2 text-sm font-medium"
            >
              Open the dashboard
              <IconArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
            {families.map((family) => {
              const [lead, ...rest] = pagesOf(family)
              const shown = rest.slice(0, 8)
              const more = rest.length - shown.length
              return (
                <article
                  key={family.id}
                  data-testid="tool-family"
                  className={cn(
                    "flex flex-col rounded-2xl border bg-card p-5 transition-colors sm:p-6",
                    categoryTone[family.category].card,
                    span[family.id] ?? "lg:col-span-3"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <ToolIcon tool={lead} />
                    <span
                      className={cn(
                        "text-xs font-medium",
                        categoryTone[family.category].text
                      )}
                    >
                      {categoryLabel(family.category)}
                    </span>
                  </div>
                  <h3 className="mt-5 font-heading text-xl font-medium">
                    <Link
                      prefetch={false}
                      href={`/dashboard/${lead.id}/`}
                      className="inline-flex items-center gap-1.5 hover:text-primary"
                    >
                      {family.title}
                      <IconArrowUpRight
                        className="size-4 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </Link>
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {family.blurb}
                  </p>
                  <ul
                    aria-label={`Jobs in the ${family.title.toLowerCase()}`}
                    className="mt-5 flex flex-wrap gap-2"
                  >
                    {(family.id === "images" || family.id === "developer"
                      ? [lead, ...shown]
                      : shown
                    ).map((tool) => (
                      <li key={tool.id}>
                        <Link
                          prefetch={false}
                          href={`/dashboard/${tool.id}/`}
                          className="inline-flex min-h-11 items-center rounded-full border bg-background px-3.5 text-sm transition-colors hover:border-foreground/30 md:min-h-9"
                        >
                          {tool.name}
                        </Link>
                      </li>
                    ))}
                    {more > 0 && (
                      <li>
                        <Link
                          prefetch={false}
                          href={`/dashboard/?category=${family.category}`}
                          className="inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-sm font-medium text-muted-foreground hover:text-foreground md:min-h-9"
                        >
                          {more} more
                          <IconArrowRight
                            className="size-3.5"
                            aria-hidden="true"
                          />
                        </Link>
                      </li>
                    )}
                  </ul>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      <section
        id="private"
        className="marketing-section"
        aria-labelledby="private-heading"
      >
        <div className="marketing-container grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <p className="eyebrow mb-3 text-primary">Private by design</p>
            <h2 id="private-heading" className="marketing-heading">
              Your files never
              <br />
              leave the room.
            </h2>
            <p className="mt-4 max-w-md text-base leading-7 text-muted-foreground">
              Most online tools send your file to a server and send back the
              result. KeepSimp brings the tools to your file instead: your
              browser does the work, on your device.
            </p>
            <ul className="mt-6 space-y-3 text-sm">
              {[
                "Nothing to upload, so nothing waits in a queue",
                "No account, no payment, no limit on how often",
                "Works offline after one visit, or installed as an app",
              ].map((text) => (
                <li key={text} className="flex items-start gap-2.5">
                  <IconCheck
                    className="mt-0.5 size-4 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  {text}
                </li>
              ))}
            </ul>
            <Link
              prefetch={false}
              href="/privacy/"
              className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary"
            >
              What the tools keep, and where
              <IconArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
          <figure className="rounded-2xl border bg-marketing-surface p-5 sm:p-8">
            <div className="rounded-xl border-2 border-dashed border-primary/40 bg-background p-4 sm:p-6">
              <p className="flex items-center gap-2 text-xs font-medium text-primary">
                <IconDeviceDesktop className="size-4" aria-hidden="true" />
                Your device
              </p>
              <ol className="mt-4 grid items-center gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
                {[
                  { title: "contract.pdf", note: "Your file" },
                  { title: "KeepSimp", note: "Runs in your browser" },
                  { title: "contract-signed.pdf", note: "Your result" },
                ].map(({ title, note }, index) => (
                  <li key={title} className="contents">
                    {index > 0 && (
                      <IconArrowRight
                        className="mx-auto size-4 rotate-90 text-muted-foreground sm:rotate-0"
                        aria-hidden="true"
                      />
                    )}
                    <div
                      className={cn(
                        "rounded-lg border px-3 py-3 text-center",
                        index === 1
                          ? "border-primary/50 bg-primary/10"
                          : "bg-card"
                      )}
                    >
                      <p className="truncate text-sm font-medium">{title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {note}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <div className="mt-4 flex items-center gap-3 rounded-xl border border-dashed bg-card px-4 py-3">
              <IconCloudOff
                className="size-5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  The site&rsquo;s server
                </span>{" "}
                sends the pages and the tools. It never receives your files.
              </p>
            </div>
            <figcaption className="sr-only">
              A file goes from your device to KeepSimp in your browser and back
              to your device as a result. The server is not part of the trip.
            </figcaption>
          </figure>
        </div>
      </section>

      <section
        id="depth"
        className="marketing-section border-y bg-marketing-surface"
        aria-labelledby="depth-heading"
      >
        <div className="marketing-container">
          <div className="mb-9 max-w-xl">
            <p className="eyebrow mb-3 text-primary">Simple, not shallow</p>
            <h2 id="depth-heading" className="marketing-heading">
              Easy to start.
              <br />
              Deep when you need it.
            </h2>
            <p className="mt-3 text-base leading-7 text-muted-foreground">
              Each tool starts with the everyday job and keeps the harder ones a
              press away.
            </p>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {depth.map(({ tool: id, icon: Icon, title, text }) => {
              const tool = toolById(id)
              return (
                <li key={id}>
                  <Link
                    prefetch={false}
                    href={`/dashboard/${id}/`}
                    className={cn(
                      "group flex h-full flex-col rounded-2xl border bg-card p-5 transition-colors",
                      categoryTone[tool.category].card
                    )}
                  >
                    <Icon
                      className={cn("size-6", categoryTone[tool.category].text)}
                      stroke={1.6}
                      aria-hidden="true"
                    />
                    <h3 className="mt-4 font-heading text-base font-medium">
                      {title}
                    </h3>
                    <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">
                      {text}
                    </p>
                    <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground group-hover:text-foreground">
                      {tool.name}
                      <IconArrowRight
                        className="size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                        aria-hidden="true"
                      />
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      </section>

      <section
        id="agents"
        className="marketing-section"
        aria-labelledby="agents-heading"
      >
        <div className="marketing-container grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <p className="eyebrow mb-3 text-primary">For AI agents</p>
            <h2 id="agents-heading" className="marketing-heading">
              Your agent can use
              <br />
              them too.
            </h2>
            <p className="mt-4 max-w-md text-base leading-7 text-muted-foreground">
              Claude, Codex, Cursor, Copilot, Gemini CLI and other MCP agents
              can call the tools through the keepsimp-mcp bridge. They still run
              on your computer, with the same engines as these pages.
            </p>
            <ul
              aria-label="Agent apps it works with"
              className="mt-5 flex flex-wrap gap-2"
            >
              {agentClients.map((client) => (
                <li key={client.id}>
                  <Link
                    prefetch={false}
                    href={`/dashboard/agents/#app-${client.id}`}
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border bg-card py-1 pr-3.5 pl-1.5 text-sm transition-colors hover:border-foreground/30 md:min-h-9"
                  >
                    <AppTile
                      logo={client.logo}
                      className="size-7 rounded-full"
                    />
                    {client.name}
                  </Link>
                </li>
              ))}
            </ul>
            <ul className="mt-6 space-y-3 text-sm">
              {[
                "Reads and writes only in the folders you allow",
                "Never overwrites a file",
                "Agents in the browser can call them through WebMCP",
              ].map((text) => (
                <li key={text} className="flex items-start gap-2.5">
                  <IconCheck
                    className="mt-0.5 size-4 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  {text}
                </li>
              ))}
            </ul>
            <Link
              prefetch={false}
              href="/blog/keepsimp-tools-for-ai-agents/"
              className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary"
            >
              How agents use KeepSimp
              <IconArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
          <figure className="overflow-hidden rounded-2xl border bg-card">
            <div className="flex items-center gap-1.5 border-b px-4 py-3">
              {[0, 1, 2].map((dot) => (
                <span
                  key={dot}
                  className="size-2.5 rounded-full bg-muted-foreground/30"
                  aria-hidden="true"
                />
              ))}
              <figcaption className="ml-2 text-xs text-muted-foreground">
                Add it to Claude Code
              </figcaption>
            </div>
            <div className="space-y-4 p-5 font-mono text-sm leading-6">
              <p className="break-all">
                <span className="text-muted-foreground" aria-hidden="true">
                  ${" "}
                </span>
                {BRIDGE_COMMAND}
              </p>
              <div className="border-t pt-4">
                <p className="font-sans text-xs text-muted-foreground">
                  Then ask in plain words:
                </p>
                <ul className="mt-2 space-y-1.5">
                  {[
                    "merge a.pdf and b.pdf",
                    "compress talk.mp4 to under 25 MB",
                    "transcribe interview.m4a",
                    "format data.json with sorted keys",
                  ].map((ask) => (
                    <li key={ask} className="flex gap-2">
                      <span className="text-primary" aria-hidden="true">
                        ›
                      </span>
                      {ask}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </figure>
        </div>
      </section>

      <section
        className="marketing-section border-t bg-marketing-surface"
        aria-labelledby="blog-heading"
      >
        <div className="marketing-container">
          <div className="mb-9 flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="eyebrow mb-3 text-primary">A little know-how</p>
              <h2 id="blog-heading" className="marketing-heading">
                Good to know. Easy to do.
              </h2>
              <p className="mt-3 text-base text-muted-foreground">
                Plain notes on getting the job done, from the blog.
              </p>
            </div>
            <Link
              prefetch={false}
              href="/blog/"
              className="inline-flex min-h-11 items-center gap-2 text-sm font-medium"
            >
              Visit the blog
              <IconArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="grid gap-7 md:grid-cols-3">
            {featuredPosts().map((post) => (
              <article key={post.slug} className="group">
                <Link
                  prefetch={false}
                  href={`/blog/${post.slug}/`}
                  className="block overflow-hidden rounded-xl border bg-card"
                  tabIndex={-1}
                  aria-hidden="true"
                >
                  <EditorialImage
                    src={post.image}
                    alt=""
                    width={600}
                    height={400}
                    className="aspect-3/2 w-full object-cover transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none"
                    sizes="(max-width: 767px) 100vw, 380px"
                  />
                </Link>
                <p className="mt-4 text-xs text-muted-foreground">
                  {post.category}
                  <span className="mx-2" aria-hidden="true">
                    ·
                  </span>
                  {post.readingTime}
                </p>
                <h3 className="mt-2 font-heading text-xl leading-7 font-medium">
                  <Link
                    prefetch={false}
                    href={`/blog/${post.slug}/`}
                    className="hover:text-primary"
                  >
                    {post.title}
                  </Link>
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {post.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="marketing-section" aria-labelledby="faq-heading">
        <div className="marketing-container grid gap-9 lg:grid-cols-3 lg:gap-16">
          <div>
            <p className="eyebrow mb-3 text-primary">Glad you asked</p>
            <h2 id="faq-heading" className="marketing-heading">
              A few good
              <br />
              questions.
            </h2>
          </div>
          <div className="lg:col-span-2">
            {faqs.map(([question, answer]) => (
              <details key={question} className="faq-row border-b py-5">
                <summary className="flex min-h-11 items-center justify-between gap-5 text-base font-medium">
                  {question}
                  <IconPlus
                    className="faq-plus size-5 shrink-0 text-muted-foreground transition-transform"
                    aria-hidden="true"
                  />
                </summary>
                <p className="mt-3 max-w-xl pr-5 text-sm leading-7 text-muted-foreground">
                  {answer}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section
        className="marketing-section border-t bg-marketing-surface text-center"
        aria-labelledby="last-heading"
      >
        <div className="marketing-container">
          <h2 id="last-heading" className="marketing-heading">
            Bring the next file.
          </h2>
          <p className="mt-4 text-base text-muted-foreground">
            Free, private and ready when you are.
          </p>
          <Link
            prefetch={false}
            href="/dashboard/"
            className={buttonVariants({
              size: "lg",
              className: "mt-6 gap-2 px-6",
            })}
          >
            Open the tools
            <IconArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </>
  )
}
