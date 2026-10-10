export type Target =
  | "jpeg"
  | "png"
  | "webp"
  | "avif"
  | "jxl"
  | "gif"
  | "bmp"
  | "tiff"
  | "ico"
  | "pdf"

export interface TargetInfo {
  label: string
  extension: string
  mime: string
  /** Keeps transparent pixels. GIF keeps them as fully on or off. */
  alpha: boolean
  /** Can store every pixel exactly. */
  lossless: boolean
  /** Has a lossy mode with a quality setting. */
  lossy: boolean
  /** Sensible as a `<picture>` source or fallback on a web page. */
  web: boolean
  /** The file can record a print resolution. */
  density: boolean
  hint: string
}

export const targets: Record<Target, TargetInfo> = {
  jpeg: {
    label: "JPEG",
    extension: "jpg",
    mime: "image/jpeg",
    alpha: false,
    lossless: false,
    lossy: true,
    web: true,
    density: true,
    hint: "Photos that must open everywhere. No transparency.",
  },
  png: {
    label: "PNG",
    extension: "png",
    mime: "image/png",
    alpha: true,
    lossless: true,
    lossy: true,
    web: true,
    density: true,
    hint: "Graphics, screenshots and transparency, with sharp edges.",
  },
  webp: {
    label: "WebP",
    extension: "webp",
    mime: "image/webp",
    alpha: true,
    lossless: true,
    lossy: true,
    web: true,
    density: false,
    hint: "Small files with transparency, supported by all current browsers.",
  },
  avif: {
    label: "AVIF",
    extension: "avif",
    mime: "image/avif",
    alpha: true,
    lossless: false,
    lossy: true,
    web: true,
    density: false,
    hint: "Often the smallest for photos. Slower to encode; current browsers support it.",
  },
  jxl: {
    label: "JPEG XL",
    extension: "jxl",
    mime: "image/jxl",
    alpha: true,
    lossless: true,
    lossy: true,
    web: true,
    density: false,
    hint: "Very efficient, lossy or lossless. Safari shows it today; other browsers are adding support, so keep a fallback.",
  },
  gif: {
    label: "GIF",
    extension: "gif",
    mime: "image/gif",
    alpha: true,
    lossless: false,
    lossy: false,
    web: false,
    density: false,
    hint: "Up to 256 colours, with on-or-off transparency. A still image, not an animation.",
  },
  bmp: {
    label: "BMP",
    extension: "bmp",
    mime: "image/bmp",
    alpha: true,
    lossless: true,
    lossy: false,
    web: false,
    density: true,
    hint: "Uncompressed, for older Windows software. Files are large.",
  },
  tiff: {
    label: "TIFF",
    extension: "tiff",
    mime: "image/tiff",
    alpha: true,
    lossless: true,
    lossy: false,
    web: false,
    density: true,
    hint: "Uncompressed and exact, for print and archiving. Files are large.",
  },
  ico: {
    label: "ICO",
    extension: "ico",
    mime: "image/x-icon",
    alpha: true,
    lossless: true,
    lossy: false,
    web: false,
    density: false,
    hint: "A favicon or Windows icon holding several sizes in one file.",
  },
  pdf: {
    label: "PDF",
    extension: "pdf",
    mime: "application/pdf",
    alpha: false,
    lossless: true,
    lossy: true,
    web: false,
    density: false,
    hint: "A document with one image per page, or every image in one file.",
  },
}

/** Display order of the format chips. */
export const targetOrder: Target[] = [
  "jpeg",
  "png",
  "webp",
  "avif",
  "jxl",
  "gif",
  "bmp",
  "tiff",
  "ico",
  "pdf",
]

/** Formats the SSIM-guided compressor pipeline encodes directly. */
export type CompressorTarget = "jpeg" | "png" | "webp" | "avif"
export const isCompressorTarget = (
  target: Target
): target is CompressorTarget =>
  target === "jpeg" ||
  target === "png" ||
  target === "webp" ||
  target === "avif"

/** Formats worth comparing for use on a web page. */
export const comparable: Target[] = ["jpeg", "png", "webp", "avif", "jxl"]

export const sortTargets = (list: Target[]) =>
  targetOrder.filter((target) => list.includes(target))
