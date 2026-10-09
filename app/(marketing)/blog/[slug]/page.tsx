import { EditorialImage } from "@/components/editorial-image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { IconArrowLeft, IconArrowUpRight } from "@tabler/icons-react"
import { posts, findPost } from "@/lib/blog"
import { absoluteUrl, pageMetadata, site } from "@/lib/site"
import { StructuredData } from "@/components/structured-data"
import { buttonVariants } from "@/components/ui/button"

export const dynamicParams = false
export function generateStaticParams() {
  return posts.map((post) => ({ slug: post.slug }))
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const post = findPost((await params).slug)
  if (!post) notFound()
  const base = pageMetadata(
    post.title,
    post.description,
    `/blog/${post.slug}/`,
    `/images/social/${post.slug}.png`
  )
  return {
    ...base,
    openGraph: {
      ...base.openGraph,
      type: "article",
      publishedTime: site.updated,
      modifiedTime: site.updated,
      authors: ["KeepSimp"],
    },
  }
}
export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const post = findPost((await params).slug)
  if (!post) notFound()
  const url = absoluteUrl(`/blog/${post.slug}/`)
  return (
    <>
      <StructuredData
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "BlogPosting",
              "@id": `${url}#article`,
              headline: post.title,
              description: post.description,
              image: [absoluteUrl(`/images/social/${post.slug}.png`)],
              datePublished: site.updated,
              dateModified: site.updated,
              author: {
                "@type": "Organization",
                name: "KeepSimp",
                url: site.origin,
              },
              publisher: {
                "@type": "Organization",
                name: "KeepSimp",
                logo: {
                  "@type": "ImageObject",
                  url: absoluteUrl("/brand/keepsimp-mark.svg"),
                },
              },
              mainEntityOfPage: { "@type": "WebPage", "@id": url },
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                {
                  "@type": "ListItem",
                  position: 1,
                  name: "Home",
                  item: absoluteUrl("/"),
                },
                {
                  "@type": "ListItem",
                  position: 2,
                  name: "Journal",
                  item: absoluteUrl("/blog/"),
                },
                {
                  "@type": "ListItem",
                  position: 3,
                  name: post.title,
                  item: url,
                },
              ],
            },
          ],
        }}
      />
      <article>
        <header className="marketing-container pt-10 pb-8 sm:pt-14">
          <Link
            prefetch={false}
            href="/blog/"
            className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground"
          >
            <IconArrowLeft className="size-4" aria-hidden="true" /> Back to the
            journal
          </Link>
          <div className="max-w-3xl">
            <p className="eyebrow mb-4 text-primary">{post.category}</p>
            <h1 className="marketing-heading sm:text-5xl sm:leading-tight">
              {post.title}
            </h1>
            <p className="mt-4 text-base leading-7 text-muted-foreground">
              {post.description}
            </p>
            <p className="mt-5 text-xs text-muted-foreground">
              By KeepSimp{" "}
              <span className="mx-2" aria-hidden="true">
                ·
              </span>{" "}
              <time dateTime="2026-10-10">10 October 2026</time>
              <span className="mx-2" aria-hidden="true">
                ·
              </span>
              {post.readingTime}
            </p>
          </div>
        </header>
        <div className="marketing-container">
          <EditorialImage
            src={post.image}
            alt={post.imageAlt}
            width={1536}
            height={1024}
            className="max-h-96 w-full rounded-2xl object-cover"
            sizes="(max-width: 767px) 100vw, 1152px"
            eager
          />
        </div>
        <div className="marketing-container grid gap-10 py-12 lg:grid-cols-4 lg:gap-16">
          <aside className="lg:order-2">
            <nav
              aria-label="In this article"
              className="rounded-xl border bg-marketing-surface p-5 lg:sticky lg:top-24"
            >
              <h2 className="mb-3 text-sm font-medium">In this article</h2>
              <ul className="space-y-1">
                {post.sections.map((section) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className="inline-flex min-h-11 items-center text-sm leading-6 text-muted-foreground hover:text-primary"
                    >
                      {section.title}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>
          <div className="article-copy min-w-0 lg:order-1 lg:col-span-3">
            <p className="mt-0! text-lg! text-foreground!">{post.intro}</p>
            {post.sections.map((section) => (
              <section
                id={section.id}
                key={section.id}
                className="scroll-mt-24"
              >
                <h2>{section.title}</h2>
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </section>
            ))}
            <section className="mt-10 border-t pt-5">
              <h2 className="mt-0! text-xl!">Further reading</h2>
              <ul className="mt-3 space-y-3 text-sm">
                {post.sources.map((source) => (
                  <li key={source.url}>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {source.title}{" "}
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
            <div className="mt-10 rounded-xl border bg-marketing-surface p-6">
              <h2 className="mt-0! text-2xl!">
                A little less theory. A little more doing.
              </h2>
              <p className="mt-2!">
                Try it on your own terms, with a free browser tool.
              </p>
              <Link
                prefetch={false}
                href={`/dashboard/${post.tool}/`}
                className={buttonVariants({
                  size: "lg",
                  className: "mt-4 gap-2",
                })}
              >
                Try the tool{" "}
                <IconArrowUpRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </article>
      <section className="border-t bg-marketing-surface py-10">
        <div className="marketing-container">
          <h2 className="section-title mb-5">Keep exploring</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {posts
              .filter((item) => item.slug !== post.slug)
              .map((item) => (
                <Link
                  prefetch={false}
                  href={`/blog/${item.slug}/`}
                  key={item.slug}
                  className="flex min-h-20 items-center justify-between gap-4 rounded-lg border bg-card p-5 font-heading text-lg"
                >
                  {item.title}
                  <IconArrowUpRight
                    className="size-5 shrink-0"
                    aria-hidden="true"
                  />
                </Link>
              ))}
          </div>
        </div>
      </section>
    </>
  )
}
