import Link from "next/link"
import { notFound } from "next/navigation"
import { IconArrowLeft } from "@tabler/icons-react"
import { tools } from "@/lib/catalogue"
import { pageMetadata, absoluteUrl } from "@/lib/site"
import { StructuredData } from "@/components/structured-data"
import { AnimationConverter } from "@/components/animation-converter/animation-converter"
import { AudioWorkspace } from "@/components/audio/audio-workspace"
import { VideoWorkspace } from "@/components/video/video-workspace"
import {
  VideoCompressorTutorial,
  VideoConverterTutorial,
  VideoEditorTutorial,
  VideoTrimmerTutorial,
  CropVideoTutorial,
  VideoSpeedTutorial,
  MuteVideoTutorial,
  MusicTutorial,
  TextTutorial,
  GifTutorial,
  MergeTutorial,
  SubtitlesTutorial,
} from "@/components/video/tutorial"
import {
  AudioConverterTutorial,
  AudioEditorTutorial,
  AudioExtractorTutorial,
  AudioTrimmerTutorial,
  RingtoneTutorial,
  NormalizeTutorial,
  BoosterTutorial,
  SplitterTutorial,
  JoinerTutorial,
  SpeedTutorial,
  NoiseTutorial,
  TagsTutorial,
  RecorderTutorial,
  TranscribeTutorial,
  VideoTutorial,
} from "@/components/audio/tutorial"
import { AnimationConverterTutorial } from "@/components/animation-converter/tutorial"
import { ImageCompressor } from "@/components/image-compressor/image-compressor"
import { ImageCompressorTutorial } from "@/components/image-compressor/tutorial"
import { ImageConverter } from "@/components/image-converter/image-converter"
import { ImageConverterTutorial } from "@/components/image-converter/tutorial"
import { ImageResizer } from "@/components/image-resizer/image-resizer"
import { ImageResizerTutorial } from "@/components/image-resizer/tutorial"
import { ColorWorkspace } from "@/components/color-workspace/workspace"
import { ColorTutorial } from "@/components/color-workspace/tutorial"
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
  PdfRedactTutorial,
  PdfOcrTutorial,
  PdfVerifyTutorial,
  PdfCreateFormTutorial,
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
  if (id === "color-utility")
    return {
      ...pageMetadata(
        "Free color converter, palette maker & contrast checker",
        "Convert HEX, RGB, HSL, OKLCH and wide-gamut colors. Make palettes and gradients, check WCAG contrast, extract image colors and browse sourced company palettes locally.",
        `/dashboard/${id}/`,
        "/images/social/convert-hex-rgb-hsl-oklch.png"
      ),
      keywords: [
        "color converter",
        "HEX to RGB",
        "OKLCH",
        "palette generator",
        "WCAG contrast checker",
        "CSS gradients",
        "company brand colors",
      ],
    }
  if (id === "json-formatter")
    return pageMetadata(
      "Free JSON formatter, validator & viewer",
      "Format, repair, explore and query JSON. Compare documents, apply JSON Patch, validate schemas and convert YAML, CSV or JSON Lines locally. No uploads.",
      `/dashboard/${id}/`
    )
  if (id === "video-editor")
    return pageMetadata(
      "Free video converter and editor, with no uploads",
      "Convert videos to MP4, WebM, MOV or MKV, change their size, frame rate and quality, turn them or take the sound out, many at once, in your browser. Copied as they are wherever nothing has to change, and every video checked before you download it. No account, no uploads.",
      `/dashboard/${id}/`
    )
  if (id === "video-compressor")
    return pageMetadata(
      "Compress video online for free: under 8, 10 or 25 MB",
      "Make a video smaller in your browser, to fit under 8, 10 or 25 MB, half its size or a size of your own, with the bitrate, frame rate and size chosen for it and the quality measured. Any length, no account, no uploads.",
      `/dashboard/${id}/`
    )
  if (id === "crop-video")
    return pageMetadata(
      "Crop video to 9:16, square or 4:5, free and without uploading",
      "Crop videos to 9:16 for Reels, Shorts and TikTok, to a square or to 4:5, around the middle of the picture, many at once, in your browser. Every result is checked. No account, no uploads.",
      `/dashboard/${id}/`
    )
  if (id === "change-video-speed")
    return pageMetadata(
      "Change video speed online: speed up or slow down, free",
      "Speed a video up to twice as fast or slow it to half speed in your browser, the sound keeping its pitch, with fades if you like. Every result is checked. No account, no uploads.",
      `/dashboard/${id}/`
    )
  if (id === "add-subtitles-to-video")
    return pageMetadata(
      "Add subtitles to a video: burn in SRT or VTT, free and without uploading",
      "Write the subtitles from an SRT or WebVTT file onto your video in your browser, so they show in every player and on every site. They follow any trim or speed change. No account, no uploads.",
      `/dashboard/${id}/`
    )
  if (id === "merge-videos")
    return pageMetadata(
      "Merge videos online for free: join MP4, MOV, WebM without uploading",
      "Join videos end to end in your browser, in the order you choose: copied packet for packet when they match, otherwise brought to one size, the sound in step. Trim each first if you like. No account, no uploads.",
      `/dashboard/${id}/`
    )
  if (id === "video-to-gif")
    return pageMetadata(
      "Video to GIF converter, free and without uploading",
      "Make a GIF, animated WebP or APNG from an MP4, MOV, WebM or MKV in your browser: trim it to the moment, crop it, caption it, choose the size and frame rate. No account, no uploads.",
      `/dashboard/${id}/`
    )
  if (id === "add-text-to-video")
    return pageMetadata(
      "Add text or a logo to a video online, free and without uploading",
      "Write a title or caption along the top or bottom of your videos and put a logo in a corner, in your browser, for the whole video or a few seconds. No account, no uploads.",
      `/dashboard/${id}/`
    )
  if (id === "add-music-to-video")
    return pageMetadata(
      "Add music to a video online, free and without uploading",
      "Put music or a voice-over under your videos in your browser: in place of their sound or mixed under it, looped to fit and faded at the end, set to a loudness if you like. No account, no uploads.",
      `/dashboard/${id}/`
    )
  if (id === "mute-video")
    return pageMetadata(
      "Mute a video: remove the sound, free and without uploading",
      "Take the sound out of MP4, MOV, WebM and MKV videos in your browser, the picture copied as it is so nothing is lost, many at once. No account, no uploads.",
      `/dashboard/${id}/`
    )
  if (id === "video-trimmer")
    return pageMetadata(
      "Trim video online for free, without losing quality",
      "Cut an MP4, MOV, WebM or MKV to the part you want in your browser: copied without encoding, so nothing is lost, or cut exactly to the frame. Cut several parts out at once, split it into files and save any frame as a PNG. Any length, no account, no uploads.",
      `/dashboard/${id}/`
    )
  if (id === "video-converter")
    return pageMetadata(
      "Video converter online for free: MOV, WebM, MKV to MP4",
      "Convert MOV, WebM, MKV and MPEG-TS videos to MP4 and back in your browser, copied as they are wherever nothing has to change, with H.264, HEVC, VP9 or AV1. Any length, no account, no uploads.",
      `/dashboard/${id}/`
    )
  if (id === "audio-editor")
    return pageMetadata(
      "Free audio editor and converter, with no uploads",
      "Trim, cut, fade and normalize sound to −14 LUFS or another loudness; convert MP3, M4A, Opus, FLAC, WAV and AIFF; make ringtones and take the sound out of videos, many files at once, in your browser. Every file is checked before you download it. No account, no uploads.",
      `/dashboard/${id}/`
    )
  if (id === "audio-converter")
    return pageMetadata(
      "Audio converter online for free: MP3, M4A, FLAC, WAV",
      "Convert audio between MP3, M4A (AAC), Opus, FLAC, WAV and iPhone ringtones in your browser, many files at once, keeping tags and cover art. No account, no file uploads.",
      `/dashboard/${id}/`
    )
  if (id === "audio-trimmer")
    return pageMetadata(
      "Trim audio online for free: cut MP3, M4A, WAV",
      "Cut a song, voice note or podcast to the part you want, to the millisecond, with fades in and out, in your browser. Every edit can be undone. No account, no file uploads.",
      `/dashboard/${id}/`
    )
  if (id === "normalize-audio")
    return pageMetadata(
      "Normalize audio loudness online: −14 LUFS, free",
      "Bring audio files to the same loudness in your browser: −14 LUFS for Spotify, −16 for podcasts, −23 for broadcast, measured as ITU-R BS.1770 does, with a true-peak limiter. No account, no file uploads.",
      `/dashboard/${id}/`
    )
  if (id === "change-audio-speed")
    return pageMetadata(
      "Change audio speed and pitch online for free",
      "Speed up or slow down MP3, M4A, WAV and more without changing the pitch, or change the pitch keeping the length, in your browser. Also reverse and karaoke. No account, no file uploads.",
      `/dashboard/${id}/`
    )
  if (id === "audio-to-video")
    return pageMetadata(
      "Audio to video online for free: MP3 to MP4 with a picture",
      "Turn MP3, M4A, WAV or FLAC into an MP4 video with its cover or a picture of your own, a moving waveform and its title, in your browser, for sharing. No account, no file uploads.",
      `/dashboard/${id}/`
    )
  if (id === "transcribe-audio")
    return pageMetadata(
      "Transcribe audio to text online for free, on your device",
      "Turn speech in MP3, M4A, WAV or video into text and SRT or WebVTT subtitles with Whisper running in your browser. Search it and play along. No account, no file uploads.",
      `/dashboard/${id}/`
    )
  if (id === "voice-recorder")
    return pageMetadata(
      "Online voice recorder: record audio from your microphone for free",
      "Record your voice or any sound from a microphone in your browser, with pause, a level meter and nothing lost, then trim, clean up and save it as MP3, M4A, WAV and more. No account, no uploads.",
      `/dashboard/${id}/`
    )
  if (id === "edit-audio-tags")
    return pageMetadata(
      "Edit audio tags online for free: MP3, M4A, FLAC tag editor",
      "Change the title, artist, album, track, genre, lyrics and cover art of MP3, M4A, FLAC, Ogg, Opus and WAV files, many at once, in your browser, without touching the sound. No account, no file uploads.",
      `/dashboard/${id}/`
    )
  if (id === "remove-background-noise")
    return pageMetadata(
      "Remove background noise from audio online for free",
      'Take background noise, hum, clicks and harsh "s" sounds out of voice recordings in your browser, with RNNoise on your device. MP3, M4A, WAV and more. No account, no file uploads.',
      `/dashboard/${id}/`
    )
  if (id === "join-audio")
    return pageMetadata(
      "Join audio files online for free: merge MP3, M4A, WAV",
      "Join sound files into one in your browser, in the order you set, straight on, with silence between or crossfaded, with a chapter for each. No account, no file uploads.",
      `/dashboard/${id}/`
    )
  if (id === "split-audio")
    return pageMetadata(
      "Split audio into parts online for free (MP3, M4A, WAV)",
      "Split a recording, podcast or mix into parts in your browser: every few minutes, into equal parts, at markers or at its pauses, each part checked. No account, no file uploads.",
      `/dashboard/${id}/`
    )
  if (id === "volume-booster")
    return pageMetadata(
      "Increase audio volume online for free, without clipping",
      "Make a quiet recording, song or video's sound louder in your browser, with a limiter that keeps peaks from clipping. MP3, M4A, WAV and more, no account, no file uploads.",
      `/dashboard/${id}/`
    )
  if (id === "ringtone-maker")
    return pageMetadata(
      "Ringtone maker: iPhone (M4R) and Android, free",
      "Make an iPhone ringtone (M4R, up to 40 seconds) or an Android ringtone (MP3) from any song in your browser, faded at its end. No account, no file uploads.",
      `/dashboard/${id}/`
    )
  if (id === "audio-extractor")
    return pageMetadata(
      "Extract audio from a video online for free",
      "Take the sound out of an MP4, MOV, WebM or MKV video in your browser: as it is, without losing quality, or as MP3, M4A, FLAC or WAV. No account, no file uploads.",
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
  if (id === "create-pdf-form")
    return pageMetadata(
      "Create a fillable PDF form online for free",
      "Add text fields, checkboxes, radio groups, dropdowns, lists, dates and signature places to a PDF. Move, resize and name fields locally in your browser. No uploads.",
      `/dashboard/${id}/`
    )
  if (id === "verify-pdf-signature")
    return pageMetadata(
      "Verify a PDF signature online for free",
      "Check whether a PDF's digital signatures still hold, whose certificate made them, and what was changed after signing, in your browser. No account, no file uploads.",
      `/dashboard/${id}/`
    )
  if (id === "ocr-pdf")
    return pageMetadata(
      "OCR a PDF online for free: make a scan searchable",
      "Recognise the words of a scanned PDF in your browser and lay them unseen over the pages, so you can search, select and copy them. The pages look the same. No account, no file uploads.",
      `/dashboard/${id}/`
    )
  if (id === "redact-pdf")
    return pageMetadata(
      "Redact a PDF online for free",
      "Take names, numbers and pictures out of a PDF for good: the text, the pixels and the drawings under your marks are removed, not covered. In your browser, no account, no file uploads.",
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
            tool.category === "image" ||
            tool.category === "audio" ||
            tool.category === "video"
              ? "MultimediaApplication"
              : tool.category === "document"
                ? "BusinessApplication"
                : "DeveloperApplication",
          operatingSystem: "Modern web browser",
          description: tool.description,
          ...(id === "color-utility"
            ? {
                featureList: [
                  "Color format conversion",
                  "Palette and gradient creation",
                  "WCAG contrast checker",
                  "Local image color extraction",
                  "Sourced company brand palettes",
                  "CSS, JSON, SVG and PNG palette exports",
                ],
              }
            : {}),
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
      {id === "color-utility" ? (
        <ColorWorkspace />
      ) : id === "image-compressor" ? (
        <ImageCompressor />
      ) : id === "image-resizer" ? (
        <ImageResizer />
      ) : id === "image-converter" ? (
        <ImageConverter />
      ) : id === "animation-converter" ? (
        <AnimationConverter />
      ) : id === "video-editor" ? (
        <VideoWorkspace mode="editor" />
      ) : id === "video-converter" ? (
        <VideoWorkspace mode="converter" />
      ) : id === "video-compressor" ? (
        <VideoWorkspace mode="compressor" />
      ) : id === "video-trimmer" ? (
        <VideoWorkspace mode="trimmer" />
      ) : id === "crop-video" ? (
        <VideoWorkspace mode="cropper" />
      ) : id === "change-video-speed" ? (
        <VideoWorkspace mode="speed" />
      ) : id === "mute-video" ? (
        <VideoWorkspace mode="mute" />
      ) : id === "add-music-to-video" ? (
        <VideoWorkspace mode="music" />
      ) : id === "add-text-to-video" ? (
        <VideoWorkspace mode="text" />
      ) : id === "video-to-gif" ? (
        <VideoWorkspace mode="gif" />
      ) : id === "merge-videos" ? (
        <VideoWorkspace mode="merge" />
      ) : id === "add-subtitles-to-video" ? (
        <VideoWorkspace mode="subtitles" />
      ) : id === "audio-editor" ? (
        <AudioWorkspace mode="editor" />
      ) : id === "audio-converter" ? (
        <AudioWorkspace mode="converter" />
      ) : id === "audio-extractor" ? (
        <AudioWorkspace mode="extractor" />
      ) : id === "audio-trimmer" ? (
        <AudioWorkspace mode="trimmer" />
      ) : id === "ringtone-maker" ? (
        <AudioWorkspace mode="ringtone" />
      ) : id === "normalize-audio" ? (
        <AudioWorkspace mode="normalize" />
      ) : id === "volume-booster" ? (
        <AudioWorkspace mode="booster" />
      ) : id === "split-audio" ? (
        <AudioWorkspace mode="splitter" />
      ) : id === "join-audio" ? (
        <AudioWorkspace mode="joiner" />
      ) : id === "change-audio-speed" ? (
        <AudioWorkspace mode="speed" />
      ) : id === "remove-background-noise" ? (
        <AudioWorkspace mode="noise" />
      ) : id === "edit-audio-tags" ? (
        <AudioWorkspace mode="tags" />
      ) : id === "voice-recorder" ? (
        <AudioWorkspace mode="recorder" />
      ) : id === "transcribe-audio" ? (
        <AudioWorkspace mode="transcribe" />
      ) : id === "audio-to-video" ? (
        <AudioWorkspace mode="video" />
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
      ) : id === "create-pdf-form" ? (
        <PdfEditor mode="create-form" />
      ) : id === "redact-pdf" ? (
        <PdfEditor mode="redact" />
      ) : id === "ocr-pdf" ? (
        <PdfEditor mode="ocr" />
      ) : id === "verify-pdf-signature" ? (
        <PdfEditor mode="verify" />
      ) : (
        <JsonTool />
      )}
      {id === "color-utility" ? (
        <ColorTutorial />
      ) : id === "image-compressor" ? (
        <ImageCompressorTutorial />
      ) : id === "image-resizer" ? (
        <ImageResizerTutorial />
      ) : id === "image-converter" ? (
        <ImageConverterTutorial />
      ) : id === "animation-converter" ? (
        <AnimationConverterTutorial />
      ) : id === "video-editor" ? (
        <VideoEditorTutorial />
      ) : id === "video-converter" ? (
        <VideoConverterTutorial />
      ) : id === "video-compressor" ? (
        <VideoCompressorTutorial />
      ) : id === "video-trimmer" ? (
        <VideoTrimmerTutorial />
      ) : id === "crop-video" ? (
        <CropVideoTutorial />
      ) : id === "change-video-speed" ? (
        <VideoSpeedTutorial />
      ) : id === "mute-video" ? (
        <MuteVideoTutorial />
      ) : id === "add-music-to-video" ? (
        <MusicTutorial />
      ) : id === "add-text-to-video" ? (
        <TextTutorial />
      ) : id === "video-to-gif" ? (
        <GifTutorial />
      ) : id === "merge-videos" ? (
        <MergeTutorial />
      ) : id === "add-subtitles-to-video" ? (
        <SubtitlesTutorial />
      ) : id === "audio-editor" ? (
        <AudioEditorTutorial />
      ) : id === "audio-converter" ? (
        <AudioConverterTutorial />
      ) : id === "audio-trimmer" ? (
        <AudioTrimmerTutorial />
      ) : id === "ringtone-maker" ? (
        <RingtoneTutorial />
      ) : id === "normalize-audio" ? (
        <NormalizeTutorial />
      ) : id === "volume-booster" ? (
        <BoosterTutorial />
      ) : id === "split-audio" ? (
        <SplitterTutorial />
      ) : id === "join-audio" ? (
        <JoinerTutorial />
      ) : id === "change-audio-speed" ? (
        <SpeedTutorial />
      ) : id === "remove-background-noise" ? (
        <NoiseTutorial />
      ) : id === "edit-audio-tags" ? (
        <TagsTutorial />
      ) : id === "voice-recorder" ? (
        <RecorderTutorial />
      ) : id === "transcribe-audio" ? (
        <TranscribeTutorial />
      ) : id === "audio-to-video" ? (
        <VideoTutorial />
      ) : id === "audio-extractor" ? (
        <AudioExtractorTutorial />
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
      ) : id === "create-pdf-form" ? (
        <PdfCreateFormTutorial />
      ) : id === "redact-pdf" ? (
        <PdfRedactTutorial />
      ) : id === "ocr-pdf" ? (
        <PdfOcrTutorial />
      ) : id === "verify-pdf-signature" ? (
        <PdfVerifyTutorial />
      ) : (
        <JsonTutorial />
      )}
    </div>
  )
}
