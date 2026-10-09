import Link from "next/link"
import { notFound } from "next/navigation"
import { IconArrowLeft } from "@tabler/icons-react"
import { tools } from "@/lib/catalogue"
import { pageMetadata, absoluteUrl } from "@/lib/site"
import { StructuredData } from "@/components/structured-data"
import { ImageTool } from "@/components/image-tool"
import { ImageCompressor } from "@/components/image-compressor/image-compressor"
import { JsonTool } from "@/components/json-tool"

const ready = tools.filter((tool) => tool.status === "available")
export function generateStaticParams() {
  return ready.map((tool) => ({ tool: tool.id }))
}
export const dynamicParams = false
export async function generateMetadata({
  params,
}: {
  params: Promise<{ tool: string }>
}) {
  const { tool: id } = await params
  const tool = ready.find((tool) => tool.id === id)
  if (!tool) notFound()
  return pageMetadata(
    `Free ${tool.name.toLowerCase()}`,
    `${tool.description} Use the free ${tool.name.toLowerCase()} in your browser. No account, no file uploads.`,
    `/dashboard/${id}/`
  )
}
export default async function ToolPage({
  params,
}: {
  params: Promise<{ tool: string }>
}) {
  const { tool: id } = await params
  const tool = ready.find((tool) => tool.id === id)
  if (!tool) notFound()
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
      <StructuredData
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: tool.name,
          url: absoluteUrl(`/dashboard/${id}/`),
          applicationCategory:
            tool.category === "image"
              ? "MultimediaApplication"
              : "DeveloperApplication",
          operatingSystem: "Modern web browser",
          description: tool.description,
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        }}
      />
      <Link
        href="/dashboard/"
        className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <IconArrowLeft className="size-4" aria-hidden="true" /> All tools
      </Link>
      <h1 className="page-title">{tool.name}</h1>
      <p className="mt-2 mb-6 text-sm text-muted-foreground">
        {tool.description} Free, with no account or uploads.
      </p>
      {id === "image-compressor" ? (
        <ImageCompressor />
      ) : tool.category === "image" ? (
        <ImageTool mode={id} />
      ) : (
        <JsonTool />
      )}
      <div className="mt-8 border-t pt-5">
        <h2 className="section-title">A little help along the way</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {id === "image-compressor"
            ? "Drop or paste an image. Smart compression starts straight away; pick a format, size, crop or file-size target and the preview updates. Drag the slider to compare with your original, then download. Keep your original until you are happy with the result."
            : tool.category === "image"
              ? "Choose a still image, adjust the format, width and quality, then download your result. Compare it with your original before replacing anything."
              : "Paste valid JSON, choose Format JSON or Minify, then copy or download the result. Invalid JSON shows an error without changing your input."}
        </p>
        <Link
          href={
            tool.category === "image"
              ? "/blog/compress-images-without-uploading/"
              : "/blog/format-json-without-losing-precision/"
          }
          className="mt-3 inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4"
        >
          Read the step-by-step guide
        </Link>
      </div>
    </div>
  )
}
