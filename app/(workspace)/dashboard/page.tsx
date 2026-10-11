import { Suspense } from "react"
import { IconDeviceLaptop, IconHeart, IconLock } from "@tabler/icons-react"
import { ToolCatalogue } from "@/components/tool-catalogue"
import { pageMetadata } from "@/lib/site"

export const metadata = pageMetadata(
  "Free tools dashboard",
  "Compress, resize and convert images, and format JSON locally. Find your next free browser tool in the KeepSimp dashboard.",
  "/dashboard/"
)

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6">
      <section
        aria-labelledby="hero-heading"
        className="page-intro mb-6 border-b pb-6"
      >
        <h1 id="hero-heading" className="page-title">
          Simple tools. Less fuss.
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Free, private tools for the things you do every day.
        </p>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <IconLock
              className="size-3.5 text-category-developer"
              aria-hidden="true"
            />{" "}
            Private by design
          </span>
          <span className="flex items-center gap-1.5">
            <IconHeart
              className="size-3.5 text-category-video"
              aria-hidden="true"
            />{" "}
            Always free
          </span>
          <span className="flex items-center gap-1.5">
            <IconDeviceLaptop
              className="size-3.5 text-category-document"
              aria-hidden="true"
            />{" "}
            In your browser
          </span>
        </div>
      </section>
      <Suspense fallback={<p role="status">Loading the collection…</p>}>
        <ToolCatalogue />
      </Suspense>
    </div>
  )
}
