import { EditorialImage } from "@/components/editorial-image"
import Link from "next/link"
import { IconArrowUpRight } from "@tabler/icons-react"
import { posts } from "@/lib/blog"
import { absoluteUrl, pageMetadata } from "@/lib/site"
import { StructuredData } from "@/components/structured-data"

export const metadata = pageMetadata(
  "The journal — Practical image and JSON guides",
  "Practical image and JSON guides: formatting, JSONPath, JSON Pointer, repair, JSON Patch, JSON Schema and YAML/CSV conversion. Learn, then try a free KeepSimp tool.",
  "/blog/"
)
export default function BlogIndex() {
  return (
    <>
      <StructuredData
        data={{
          "@context": "https://schema.org",
          "@type": "Blog",
          name: "The KeepSimp journal",
          url: absoluteUrl("/blog/"),
          blogPost: posts.map((post) => ({
            "@type": "BlogPosting",
            headline: post.title,
            url: absoluteUrl(`/blog/${post.slug}/`),
          })),
        }}
      />
      <section className="border-b bg-marketing-surface">
        <div className="marketing-container py-16 sm:py-20">
          <p className="eyebrow mb-4 text-primary">The KeepSimp journal</p>
          <h1 className="marketing-title">
            A little know-how.
            <br />A lot less guesswork.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">
            Practical notes on lighter images, clearer data, and the small
            choices that make your everyday work easier.
          </p>
        </div>
      </section>
      <section className="marketing-section" aria-label="Latest articles">
        <div className="marketing-container grid gap-x-8 gap-y-12 md:grid-cols-3">
          {posts.map((post) => (
            <article key={post.slug}>
              <Link
                prefetch={false}
                href={`/blog/${post.slug}/`}
                tabIndex={-1}
                aria-hidden="true"
                className="block overflow-hidden rounded-xl"
              >
                <EditorialImage
                  src={post.image}
                  alt=""
                  width={600}
                  height={400}
                  className="aspect-3/2 w-full object-cover"
                  sizes="(max-width: 767px) 100vw, 380px"
                />
              </Link>
              <p className="mt-5 text-xs text-muted-foreground">
                {post.category} · {post.readingTime}
              </p>
              <h2 className="mt-2 font-heading text-2xl leading-8 font-medium">
                <Link
                  prefetch={false}
                  href={`/blog/${post.slug}/`}
                  className="hover:text-primary"
                >
                  {post.title}
                </Link>
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {post.description}
              </p>
              <Link
                prefetch={false}
                href={`/blog/${post.slug}/`}
                className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm text-primary"
                aria-label={`Read ${post.title}`}
              >
                Read the story{" "}
                <IconArrowUpRight className="size-4" aria-hidden="true" />
              </Link>
            </article>
          ))}
        </div>
      </section>
    </>
  )
}
