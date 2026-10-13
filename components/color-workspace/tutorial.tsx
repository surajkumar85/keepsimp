import Link from "next/link"
import { colorPosts } from "@/lib/color-blog"
export function ColorTutorial() {
  return (
    <section className="mt-8 border-t pt-5" aria-labelledby="color-help-title">
      <h2 id="color-help-title" className="section-title">
        A little help along the way
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Convert a color, grow a palette, check contrast or create a gradient.
        From image reads a local picture; Brand colors has sourced company
        swatches. The guides explain gamut, transparency and what each export
        keeps.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {colorPosts.map((post) => (
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
