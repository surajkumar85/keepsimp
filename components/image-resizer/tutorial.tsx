import { ToolTutorial, type TutorialContent } from "@/components/tool-tutorial"

const content: TutorialContent = {
  video: "image-resizer-tutorial",
  duration: { iso: "PT1M30S", label: "1 min 30 s" },
  uploadDate: "2026-10-10",
  name: "How to use the KeepSimp image resizer",
  description:
    "A short tour of resizing a batch of images with presets, smart cropping, print sizes and responsive sets in your browser.",
  intro:
    "Watch the tour, or follow the same steps below. Every option is explained underneath.",
  steps: [
    {
      title: "Add your images",
      text: "Drop up to 50 images, choose them, paste with ⌘V or Ctrl+V, or try the samples. JPEG, PNG, WebP, AVIF, HEIC, GIF, BMP, TIFF, ICO, SVG and JPEG XL all work.",
    },
    {
      title: "Choose a size",
      text: "Type a width and height, pick a preset for social, web, screens, print or icons, or resize by one side, a percentage or megapixels.",
    },
    {
      title: "Decide how it fits",
      text: "Crop to fill, fit with padding, fit inside or stretch. For crops, drag each picture in the preview, pick a position, or use Smart focus.",
    },
    {
      title: "Print sizes and several sizes",
      text: "Switch units to inches, cm or mm with a print resolution, or export a responsive set of widths with ready-to-paste srcset HTML.",
    },
    {
      title: "Set the output",
      text: "Keep the original format or convert to WebP, AVIF, JPEG or PNG, choose a quality, and name files with placeholders.",
    },
    {
      title: "Download",
      text: "Save one image, or everything as a ZIP. Your images never leave your device.",
    },
  ],
  options: [
    {
      term: "Dimensions",
      detail:
        "Set both sides for an exact frame, or just one to keep each image's own proportions. Keep proportions fills in the other side from the selected image. Swap exchanges width and height.",
    },
    {
      term: "Width, Height, Longest side, Shortest side",
      detail:
        "Every image gets the same value on that side and keeps its proportions. Longest side is the usual choice for mixed portrait and landscape photos.",
    },
    {
      term: "Percent and Megapixels",
      detail:
        "Scale everything by the same percentage, or to a total pixel count such as 2 megapixels.",
    },
    {
      term: "Presets",
      detail:
        "Recommended sizes for social posts, link previews, screens, prints and icons. Social sizes come from public guides and can change, so check the platform if a size matters. Story presets show the areas apps usually cover.",
    },
    {
      term: "Units and print resolution",
      detail:
        "Pixels, percent, inches, centimetres or millimetres. Physical units use the print resolution: 4 × 6 in at 300 DPI is 1200 × 1800 px. JPEG and PNG files store that resolution; WebP and AVIF cannot.",
    },
    {
      term: "Fit",
      detail:
        "Crop to fill trims what does not fit. Fit with padding shows the whole picture on a white, black, transparent, custom or blurred background. Fit inside and Cover at least keep proportions without cropping or padding. Stretch can distort.",
    },
    {
      term: "Focus",
      detail:
        "For crops, choose one of nine positions, drag the picture inside the frame, or use the arrow keys (hold Shift for bigger steps). Smart focus looks for detail, colour and skin tones in each image. Dragging adjusts only the selected image.",
    },
    {
      term: "Allow enlarging",
      detail:
        "Turn it off to leave images that are already smaller than the target untouched. Enlarging adds pixels, not detail.",
    },
    {
      term: "Several sizes",
      detail:
        "Makes one file per width from every image, up to 12 widths, and writes the img and srcset HTML for the selected image.",
    },
    {
      term: "Format, quality and file names",
      detail:
        "Balanced searches for the smallest file that still measures close to the resized image; High, Small file, Lossless (PNG and WebP) and Custom are also available. File names accept {name}, {width}, {height}, {format}, {index} and {preset}.",
    },
    {
      term: "Advanced options",
      detail:
        "Resampling (Auto, Lanczos, Magic Kernel Sharp, Mitchell, Catmull-Rom, Bilinear, Nearest for pixel art), sharpening after shrinking, and rounding sizes to even numbers or multiples of 8.",
    },
    {
      term: "Limits and privacy",
      detail:
        "Up to 50 images per batch, each up to 50 MB and 50 megapixels; outputs up to 16,383 px per side. Animated files use their first frame. Everything runs in your browser, and metadata such as location is removed.",
    },
  ],
  guideHref: "/blog/compress-images-without-uploading/",
}

export function ImageResizerTutorial() {
  return <ToolTutorial content={content} />
}
