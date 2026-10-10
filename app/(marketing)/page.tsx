import { EditorialImage } from "@/components/editorial-image"
import Link from "next/link"
import {
  IconArrowRight,
  IconArrowUpRight,
  IconPhoto,
  IconArrowsMaximize,
  IconTransform,
  IconBraces,
  IconLock,
  IconHeart,
  IconBolt,
  IconPlus,
  IconCheck,
  IconDeviceLaptop,
  IconUpload,
  IconDownload,
} from "@tabler/icons-react"
import { LandingDemo } from "@/components/landing-demo"
import { StructuredData } from "@/components/structured-data"
import { buttonVariants } from "@/components/ui/button"
import { pageMetadata, absoluteUrl, site } from "@/lib/site"
import { posts } from "@/lib/blog"

export const metadata = pageMetadata(
  "Free browser tools for images and JSON",
  "A little less busywork. Compress, resize and convert images, or format JSON, with free private browser tools. No account. No uploads.",
  "/"
)
const featured = [
  {
    id: "image-compressor",
    name: "Image compressor",
    description: "A smaller file. More room to share.",
    icon: IconPhoto,
    label: "Lighten it up",
  },
  {
    id: "image-resizer",
    name: "Image resizer",
    description: "The right dimensions for your next idea.",
    icon: IconArrowsMaximize,
    label: "Find the perfect fit",
  },
  {
    id: "image-converter",
    name: "Image converter",
    description: "JPEG, PNG or WebP. Make the switch.",
    icon: IconTransform,
    label: "Change it up",
  },
  {
    id: "json-formatter",
    name: "JSON formatter",
    description: "From a wall of text to a clear picture.",
    icon: IconBraces,
    label: "Give it some space",
  },
]
const faqs = [
  [
    "Is KeepSimp really free?",
    "Yes. The available tools are free to use, with no account or payment required. Image and JSON tools are ready now; video, audio and document tools are still being built.",
  ],
  [
    "Where do my files go?",
    "The available tools process your selected images and pasted JSON in your browser. That content is not uploaded to a server. Downloads are created on your device. The website itself still loads pages and assets from its host.",
  ],
  [
    "Can I use it on my phone?",
    "Yes, with a current mobile browser. The image compressor, resizer and converter accept files up to 50 MB and 50 million pixels, and the resizer and converter take up to 50 images at once. Large images may take longer or use more memory on a phone. You can add KeepSimp to your home screen, and once you have opened the tools they work without a connection.",
  ],
  [
    "Will compression always make my image smaller?",
    "No. File size depends on the image, dimensions, format, quality and browser. KeepSimp shows the measured result. Compare the output with your original, and keep the original file.",
  ],
  [
    "Which tools can I use today?",
    "Image compressor, image resizer, image converter and JSON formatter are ready. The dashboard clearly labels the remaining video, audio and document tools as coming soon.",
  ],
]

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
              description: "Free browser tools for images and JSON.",
            },
          ],
        }}
      />
      <section
        className="hero-stage overflow-hidden pt-12 pb-14 sm:pt-16 sm:pb-20"
        aria-labelledby="landing-heading"
      >
        <div className="marketing-container text-center">
          <div className="enter-soft">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground">
              <span
                className="size-1.5 rounded-full bg-primary"
                aria-hidden="true"
              />{" "}
              Good things come in simple packages
            </p>
            <h1 id="landing-heading" className="marketing-title">
              Less busywork.
              <br />
              <span className="text-primary">More room to create.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-muted-foreground">
              Free tools for the little things that slow you down.
              <br className="hidden sm:block" /> Make an image lighter. Find the
              right format. Get on with your day.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <Link
                prefetch={false}
                href="/dashboard/"
                className={buttonVariants({
                  size: "lg",
                  className: "gap-2 px-6",
                })}
              >
                Open the dashboard{" "}
                <IconArrowUpRight className="size-4" aria-hidden="true" />
              </Link>
              <a
                href="#how-it-works"
                className={buttonVariants({
                  variant: "ghost",
                  size: "lg",
                  className: "gap-2",
                })}
              >
                See how it works{" "}
                <IconArrowRight className="size-4" aria-hidden="true" />
              </a>
            </div>
            <div className="my-7 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <IconCheck className="size-3.5" aria-hidden="true" /> No sign-up
              </span>
              <span className="flex items-center gap-1.5">
                <IconLock className="size-3.5" aria-hidden="true" /> No file
                uploads
              </span>
              <span className="flex items-center gap-1.5">
                <IconHeart className="size-3.5" aria-hidden="true" /> Always
                free
              </span>
            </div>
          </div>
          <LandingDemo />
        </div>
      </section>
      <section
        id="tools"
        className="marketing-section border-t bg-marketing-surface"
        aria-labelledby="tools-heading"
      >
        <div className="marketing-container">
          <div className="mb-9 flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="eyebrow mb-3 text-primary">Small tasks, sorted</p>
              <h2 id="tools-heading" className="marketing-heading">
                Your everyday toolkit.
              </h2>
              <p className="mt-3 text-base text-muted-foreground">
                Four useful tools. Zero unnecessary steps.
              </p>
            </div>
            <Link
              prefetch={false}
              href="/dashboard/"
              className="inline-flex min-h-11 items-center gap-2 text-sm font-medium"
            >
              Explore the dashboard{" "}
              <IconArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {featured.map(({ id, name, description, icon: Icon, label }) => (
              <Link
                prefetch={false}
                href={`/dashboard/${id}/`}
                key={id}
                className="group rounded-xl border bg-card p-5 transition-colors hover:border-primary/50"
              >
                <div className="flex items-center justify-between">
                  <span className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-5" stroke={1.6} aria-hidden="true" />
                  </span>
                  <IconArrowUpRight
                    className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                    aria-hidden="true"
                  />
                </div>
                <p className="mt-6 mb-2 text-xs text-muted-foreground">
                  {label}
                </p>
                <h3 className="font-heading text-lg font-medium">{name}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {description}
                </p>
              </Link>
            ))}
          </div>
          <p className="mt-5 text-xs text-muted-foreground">
            A growing collection. Video, audio and document tools are coming
            next.
          </p>
        </div>
      </section>
      <section
        id="how-it-works"
        className="marketing-section"
        aria-labelledby="how-heading"
      >
        <div className="marketing-container grid items-center gap-10 lg:grid-cols-2 lg:gap-20">
          <div>
            <p className="eyebrow mb-3 text-primary">
              From “I need to…” to done
            </p>
            <h2 id="how-heading" className="marketing-heading">
              Three little steps.
              <br />
              One less thing to do.
            </h2>
            <p className="mt-4 max-w-md text-base leading-7 text-muted-foreground">
              Choose a tool, make it yours, and take the result with you. All in
              the browser you already have open.
            </p>
            <Link
              prefetch={false}
              href="/dashboard/"
              className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary"
            >
              Let’s make something simpler{" "}
              <IconArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
          <ol className="space-y-6">
            {[
              {
                title: "Pick your starting point",
                text: "Choose an image, or paste your JSON. Nothing leaves your device.",
                icon: IconUpload,
              },
              {
                title: "A few small adjustments",
                text: "Find your format, dimensions or quality. Keep only the changes you need.",
                icon: IconBolt,
              },
              {
                title: "Ready for your next move",
                text: "Download the result and carry on. Keep the original, just in case.",
                icon: IconDownload,
              },
            ].map(({ title, text, icon: Icon }, index) => (
              <li key={title} className="flex gap-4">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border bg-marketing-surface">
                  <Icon
                    className="size-5 text-primary"
                    stroke={1.6}
                    aria-hidden="true"
                  />
                </span>
                <div className="border-b pb-5">
                  <span className="text-xs text-muted-foreground">
                    0{index + 1}
                  </span>
                  <h3 className="mt-1 font-heading text-lg font-medium">
                    {title}
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {text}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <section
        className="marketing-section border-y bg-marketing-surface"
        aria-labelledby="privacy-heading"
      >
        <div className="marketing-container grid items-center gap-9 lg:grid-cols-2 lg:gap-16">
          <div className="overflow-hidden rounded-2xl">
            <EditorialImage
              src="/images/private-workspace.webp"
              alt="A sage folder and a glass padlock, illustrating files kept close to you"
              width={1400}
              height={788}
              className="aspect-4/3 w-full object-cover"
              sizes="(max-width: 1023px) 100vw, 540px"
            />
          </div>
          <div>
            <p className="eyebrow mb-3 text-primary">
              A quieter kind of internet
            </p>
            <h2 id="privacy-heading" className="marketing-heading">
              Your files.
              <br />
              Still your business.
            </h2>
            <p className="mt-4 text-base leading-7 text-muted-foreground">
              Your images and text are processed right in your browser. No
              sending them away. No account to create. Just you, your work, and
              a useful little tool.
            </p>
            <ul className="mt-6 space-y-3 text-sm">
              {[
                "Files processed on your device",
                "No account or payment required",
                "Tools without a file-processing server",
              ].map((text) => (
                <li key={text} className="flex items-center gap-2.5">
                  <IconCheck
                    className="size-4 text-primary"
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
              Our approach to privacy{" "}
              <IconArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
      <section className="marketing-section" aria-labelledby="journal-heading">
        <div className="marketing-container">
          <div className="mb-9 flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="eyebrow mb-3 text-primary">A little know-how</p>
              <h2 id="journal-heading" className="marketing-heading">
                Good to know. Easy to do.
              </h2>
              <p className="mt-3 text-base text-muted-foreground">
                Useful notes for making the everyday a little easier.
              </p>
            </div>
            <Link
              prefetch={false}
              href="/blog/"
              className="inline-flex min-h-11 items-center gap-2 text-sm font-medium"
            >
              Visit the journal{" "}
              <IconArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="grid gap-7 md:grid-cols-3">
            {posts.map((post) => (
              <article key={post.slug} className="group">
                <Link
                  prefetch={false}
                  href={`/blog/${post.slug}/`}
                  className="block overflow-hidden rounded-xl"
                  tabIndex={-1}
                  aria-hidden="true"
                >
                  <EditorialImage
                    src={post.image}
                    alt=""
                    width={600}
                    height={400}
                    className="aspect-3/2 w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    sizes="(max-width: 767px) 100vw, 380px"
                  />
                </Link>
                <p className="mt-4 text-xs text-muted-foreground">
                  {post.category}{" "}
                  <span className="mx-2" aria-hidden="true">
                    ·
                  </span>{" "}
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
      <section
        className="marketing-section border-t bg-marketing-surface"
        aria-labelledby="faq-heading"
      >
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
        className="marketing-section text-center"
        aria-labelledby="last-heading"
      >
        <div className="marketing-container">
          <span className="mx-auto mb-5 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <IconDeviceLaptop className="size-6" aria-hidden="true" />
          </span>
          <h2 id="last-heading" className="marketing-heading">
            One less thing between
            <br />
            you and your next idea.
          </h2>
          <p className="mt-4 text-base text-muted-foreground">
            Your next little task? Let’s make it simple.
          </p>
          <Link
            prefetch={false}
            href="/dashboard/"
            className={buttonVariants({
              size: "lg",
              className: "mt-6 gap-2 px-6",
            })}
          >
            Open the dashboard{" "}
            <IconArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
          <p className="mt-3 text-xs text-muted-foreground">
            Free. Private. Ready when you are.
          </p>
        </div>
      </section>
    </>
  )
}
