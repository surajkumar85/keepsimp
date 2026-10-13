import Link from "next/link"
import { notFound } from "next/navigation"
import { IconArrowLeft } from "@tabler/icons-react"
import { tools } from "@/lib/catalogue"
import { pageMetadata, absoluteUrl } from "@/lib/site"
import { StructuredData } from "@/components/structured-data"
import { AnimationConverter } from "@/components/animation-converter/animation-converter"
import { AnimationConverterTutorial } from "@/components/animation-converter/tutorial"
import { ImageCompressor } from "@/components/image-compressor/image-compressor"
import { ImageCompressorTutorial } from "@/components/image-compressor/tutorial"
import { ImageConverter } from "@/components/image-converter/image-converter"
import { ImageConverterTutorial } from "@/components/image-converter/tutorial"
import { ImageResizer } from "@/components/image-resizer/image-resizer"
import { ImageResizerTutorial } from "@/components/image-resizer/tutorial"
import { JsonTool } from "@/components/json-tool"
import { PdfCompressor } from "@/components/pdf-compressor/pdf-compressor"
import { PdfCompressorTutorial } from "@/components/pdf-compressor/tutorial"
import { PdfEditor } from "@/components/pdf-editor/pdf-editor"
import {
  PdfAnnotatorTutorial,
  PdfEditorTutorial,
  PdfCropTutorial,
  PdfFormTutorial,
  PdfNumbersTutorial,
  PdfWatermarkTutorial,
  PdfSignerTutorial,
} from "@/components/pdf-editor/tutorial"
import { PdfMerger } from "@/components/pdf-merger/pdf-merger"
import { PdfMergerTutorial } from "@/components/pdf-merger/tutorial"
import { PdfSplitter } from "@/components/pdf-splitter/pdf-splitter"
import { PdfSplitterTutorial } from "@/components/pdf-splitter/tutorial"
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
  if (id === "pdf-annotator")
    return pageMetadata(
      "Annotate a PDF online for free",
      "Highlight, underline and strike out text, add notes and reply to comments on any PDF, in your browser. Comments other programs can read. No account, no file uploads.",
      `/dashboard/${id}/`
    )
  if (id === "fill-pdf-form")
    return pageMetadata(
      "Fill in a PDF form online for free",
      "Fill in the fields of any PDF form in your browser: type, tick, choose and sign, then download it as a form or with everything made final. No account, no file uploads.",
      `/dashboard/${id}/`
    )
  if (id === "crop-pdf")
    return pageMetadata(
      "Crop a PDF online for free",
      "Cut the pages of a PDF to a frame you drag or type, one page or all of them, or make them A4 or Letter size, in your browser. No account, no file uploads.",
      `/dashboard/${id}/`
    )
  if (id === "add-page-numbers")
    return pageMetadata(
      "Add page numbers to a PDF online for free",
      "Number the pages of a PDF where you want them, and add headers, footers or Bates numbers, in your browser. No account, no file uploads.",
      `/dashboard/${id}/`
    )
  if (id === "watermark-pdf")
    return pageMetadata(
      "Add a watermark to a PDF online for free",
      "Lay DRAFT, Confidential or a logo of your own over the pages of a PDF, as faint and as large as you like, in your browser. No account, no file uploads.",
      `/dashboard/${id}/`
    )
  if (id === "sign-pdf")
    return pageMetadata(
      "Sign a PDF online for free",
      "Draw or type your signature, or use a picture of it, and place it on any PDF. Fill in the blanks and add the date, in your browser. No account, no file uploads.",
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
              : tool.category === "document"
                ? "BusinessApplication"
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
      ) : id === "animation-converter" ? (
        <AnimationConverter />
      ) : id === "pdf-merger" ? (
        <PdfMerger />
      ) : id === "pdf-splitter" ? (
        <PdfSplitter />
      ) : id === "pdf-compressor" ? (
        <PdfCompressor />
      ) : id === "pdf-editor" ? (
        <PdfEditor />
      ) : id === "pdf-annotator" ? (
        <PdfEditor mode="annotate" />
      ) : id === "sign-pdf" ? (
        <PdfEditor mode="sign" />
      ) : id === "fill-pdf-form" ? (
        <PdfEditor mode="fill" />
      ) : id === "crop-pdf" ? (
        <PdfEditor mode="crop" />
      ) : id === "add-page-numbers" ? (
        <PdfEditor mode="numbers" />
      ) : id === "watermark-pdf" ? (
        <PdfEditor mode="watermark" />
      ) : (
        <JsonTool />
      )}
      {id === "image-compressor" ? (
        <ImageCompressorTutorial />
      ) : id === "image-resizer" ? (
        <ImageResizerTutorial />
      ) : id === "image-converter" ? (
        <ImageConverterTutorial />
      ) : id === "animation-converter" ? (
        <AnimationConverterTutorial />
      ) : id === "pdf-merger" ? (
        <PdfMergerTutorial />
      ) : id === "pdf-splitter" ? (
        <PdfSplitterTutorial />
      ) : id === "pdf-compressor" ? (
        <PdfCompressorTutorial />
      ) : id === "pdf-editor" ? (
        <PdfEditorTutorial />
      ) : id === "pdf-annotator" ? (
        <PdfAnnotatorTutorial />
      ) : id === "sign-pdf" ? (
        <PdfSignerTutorial />
      ) : id === "fill-pdf-form" ? (
        <PdfFormTutorial />
      ) : id === "crop-pdf" ? (
        <PdfCropTutorial />
      ) : id === "add-page-numbers" ? (
        <PdfNumbersTutorial />
      ) : id === "watermark-pdf" ? (
        <PdfWatermarkTutorial />
      ) : (
        <JsonTutorial />
      )}
    </div>
  )
}
