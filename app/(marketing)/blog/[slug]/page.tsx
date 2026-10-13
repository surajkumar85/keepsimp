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
  // The tab and search results get the question a person types; the page keeps its own heading.
  const base = pageMetadata(
    post.searchTitle ?? post.title,
    post.description,
    `/blog/${post.slug}/`,
    `/images/social/${post.slug}.png`
  )
  return {
    ...base,
    keywords: post.keywords,
    openGraph: {
      ...base.openGraph,
      type: "article",
      publishedTime: post.published ?? site.updated,
      modifiedTime: post.modified ?? post.published ?? site.updated,
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
              alternativeHeadline: post.searchTitle,
              description: post.description,
              keywords: post.keywords?.join(", "),
              image: [absoluteUrl(`/images/social/${post.slug}.png`)],
              datePublished: post.published ?? site.updated,
              dateModified: post.modified ?? post.published ?? site.updated,
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
                  name: "Blog",
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
            blog
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
              <time dateTime={(post.published ?? site.updated).slice(0, 10)}>
                {new Intl.DateTimeFormat("en-GB", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  timeZone: "UTC",
                }).format(
                  new Date(
                    `${(post.published ?? site.updated).slice(0, 10)}T12:00:00Z`
                  )
                )}
              </time>
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
                {section.links && (
                  <ul className="mt-4 space-y-1 text-base">
                    {section.links.map((link) => (
                      <li key={link.href}>
                        {link.href.startsWith("/") ? (
                          <Link
                            prefetch={false}
                            href={link.href}
                            className="inline-flex min-h-11 items-center gap-1.5 md:min-h-9"
                          >
                            {link.label}
                            <IconArrowUpRight
                              className="size-4 shrink-0"
                              aria-hidden="true"
                            />
                          </Link>
                        ) : (
                          <a
                            href={link.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-11 items-center md:min-h-9"
                          >
                            {link.label}{" "}
                            <span className="sr-only">
                              (opens in a new tab)
                            </span>
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {section.example && (
                  <figure className="my-6 min-w-0 rounded-lg border bg-marketing-surface p-4">
                    <figcaption className="mb-3 text-sm font-medium">
                      {section.example.label}
                    </figcaption>
                    <pre className="overflow-x-auto font-mono text-xs leading-6">
                      <code>{section.example.code}</code>
                    </pre>
                  </figure>
                )}
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
            {post.keywords && (
              <p className="mt-8! text-sm!" data-testid="topics">
                <span className="font-medium text-foreground">Topics:</span>{" "}
                {post.keywords.join(" · ")}
              </p>
            )}
            <div className="mt-10 rounded-xl border bg-marketing-surface p-6">
              <h2 className="mt-0! text-2xl!">
                A little less theory. A little more doing.
              </h2>
              <p className="mt-2!">
                Try it on your own terms, with a free browser tool.
              </p>
              <Link
                prefetch={false}
                href={
                  post.tool
                    ? `/dashboard/${post.tool}/${post.toolAnchor ? `#${post.toolAnchor}` : ""}`
                    : "/dashboard/"
                }
                className={buttonVariants({
                  size: "lg",
                  className: "mt-4 gap-2",
                })}
              >
                {post.tool ? "Try the tool" : "Open the tools"}{" "}
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
              .sort(
                (a, b) =>
                  Number(b.tool === post.tool) - Number(a.tool === post.tool)
              )
              .slice(0, 2)
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
