import Link from "next/link"
import { posts } from "@/lib/blog"

export function JsonTutorial() {
  return (
    <section className="mt-8 border-t pt-5" aria-labelledby="json-help-title">
      <h2 id="json-help-title" className="section-title">
        A little help along the way
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Choose Edit to format or repair, Explore to inspect values, Query to
        select data, Compare to preview patches, Schema to check a contract, or
        Convert to export another format. Results stay separate until you choose
        Use result as source.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {posts
          .filter((post) => post.tool === "json-formatter")
          .map((post) => (
            <Link
              prefetch={false}
              key={post.slug}
              href={`/blog/${post.slug}/`}
              className="flex min-h-11 items-center rounded-lg border p-3 text-sm leading-6 text-primary underline-offset-4 hover:underline"
            >
              {post.title}
            </Link>
          ))}
      </div>
    </section>
  )
}
