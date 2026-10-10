import Link from "next/link"
import { notFound } from "next/navigation"
import { IconArrowLeft } from "@tabler/icons-react"
import { tools } from "@/lib/catalogue"
import { pageMetadata, absoluteUrl } from "@/lib/site"
import { StructuredData } from "@/components/structured-data"
import { ImageCompressor } from "@/components/image-compressor/image-compressor"
import { ImageCompressorTutorial } from "@/components/image-compressor/tutorial"
import { ImageConverter } from "@/components/image-converter/image-converter"
import { ImageConverterTutorial } from "@/components/image-converter/tutorial"
import { ImageResizer } from "@/components/image-resizer/image-resizer"
import { ImageResizerTutorial } from "@/components/image-resizer/tutorial"
import { JsonTool } from "@/components/json-tool"
import { JsonTutorial } from "@/components/json-workspace/tutorial"

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
  if (id === "json-formatter")
    return pageMetadata(
      "Free JSON formatter, validator & viewer",
      "Format, repair, explore and query JSON. Compare documents, apply JSON Patch, validate schemas and convert YAML, CSV or JSON Lines locally. No uploads.",
      `/dashboard/${id}/`
    )
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
          ...(id === "json-formatter"
            ? {
                featureList: [
                  "JSON formatter and minifier",
                  "Tree and table viewer",
                  "JSONPath and JSON Pointer",
                  "JSON repair preview",
                  "Semantic JSON comparison",
                  "JSON Patch",
                  "JSON Schema validation",
                  "JSON, YAML, CSV and JSON Lines conversion",
                  "TypeScript and schema inference",
                  "Exact numeric token preservation",
                  "Local and offline processing",
                ],
              }
            : {}),
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
      ) : id === "image-resizer" ? (
        <ImageResizer />
      ) : id === "image-converter" ? (
        <ImageConverter />
      ) : (
        <JsonTool />
      )}
      {id === "image-compressor" ? (
        <ImageCompressorTutorial />
      ) : id === "image-resizer" ? (
        <ImageResizerTutorial />
      ) : id === "image-converter" ? (
        <ImageConverterTutorial />
      ) : (
        <JsonTutorial />
      )}
    </div>
  )
}
