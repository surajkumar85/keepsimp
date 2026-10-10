import { ToolTutorial, type TutorialContent } from "@/components/tool-tutorial"

const content: TutorialContent = {
  video: {
    file: "image-converter-tutorial",
    duration: { iso: "PT1M20S", label: "1 min 20 s" },
    uploadDate: "2026-10-10",
  },
  name: "How to use the KeepSimp image converter",
  description:
    "A short tour of converting images between ten formats, comparing file sizes, exporting several formats at once, and making favicons and PDFs in your browser.",
  intro:
    "Watch the tour, or follow the same steps below. Every option is explained underneath.",
  steps: [
    {
      title: "Add your images",
      text: "Drop up to 50 images, choose them, paste with ⌘V or Ctrl+V, or try the samples. JPEG, PNG, WebP, AVIF, HEIC, GIF, BMP, TIFF, ICO, SVG and JPEG XL all work.",
    },
    {
      title: "Pick a format",
      text: "Choose JPEG, PNG, WebP, AVIF, JPEG XL, GIF, BMP, TIFF, ICO or PDF. A line under the chips says what each format is good for.",
    },
    {
      title: "See which format is smallest",
      text: "Compare formats encodes the selected image as JPEG, PNG, WebP, AVIF and JPEG XL and lists the real sizes, smallest first.",
    },
    {
      title: "Several formats at once",
      text: "Tick more than one format to save every image in each of them, with picture HTML that lets browsers pick the best one.",
    },
    {
      title: "Favicons and PDFs",
      text: "ICO packs several icon sizes into one file. PDF makes a page per image, or one document with every image.",
    },
    {
      title: "Set the options and download",
      text: "Choose a quality, a background for transparency, a size limit and file names, then download one file or everything as a ZIP.",
    },
  ],
  options: [
    {
      term: "Which format should I choose?",
      detail:
        "Photos for the web: AVIF or WebP, with JPEG as a fallback. Graphics, logos and screenshots: PNG or lossless WebP. Maximum compatibility: JPEG. Print and archiving: TIFF or PNG. Favicons: ICO. Documents: PDF. If unsure, use Compare formats.",
    },
    {
      term: "JPEG, PNG, WebP, AVIF",
      detail:
        "The web formats. JPEG has no transparency. PNG keeps sharp edges and transparency. WebP and AVIF are smaller and keep transparency; AVIF takes longer to encode.",
    },
    {
      term: "JPEG XL",
      detail:
        "Very efficient, lossy or lossless. Safari shows it today and other browsers are adding support, so on a web page keep a fallback format.",
    },
    {
      term: "GIF",
      detail:
        "A still image with at most 256 colours and on-or-off transparency. Choose fewer colours for a smaller file; dithering smooths gradients. Animations are not converted here: the first frame is used.",
    },
    {
      term: "BMP and TIFF",
      detail:
        "Uncompressed and exact, so files are large. BMP suits older Windows software; TIFF suits print and archiving. Both keep transparency and can store a print resolution.",
    },
    {
      term: "ICO",
      detail:
        "One file holding several icon sizes from 16 to 256 px. 16, 32 and 48 cover favicons. Pictures that are not square are centred on a transparent square.",
    },
    {
      term: "PDF",
      detail:
        "Fit image makes each page exactly the size of its image at the chosen resolution; A4 and US Letter centre it with margins. Combine into one PDF puts every image in a single document, in list order. Lossless quality stores exact pixels.",
    },
    {
      term: "Several formats at once",
      detail:
        "Every image is saved in each ticked format. For web formats you get a picture element listing AVIF, JPEG XL and WebP before a JPEG or PNG fallback.",
    },
    {
      term: "Quality",
      detail:
        "Balanced searches for the smallest file that still measures close to the original. High keeps more detail, Small file less. Lossless applies to PNG, WebP, JPEG XL and PDF. Custom sets the encoder quality. BMP, TIFF and ICO are always exact.",
    },
    {
      term: "Transparency",
      detail:
        "PNG, WebP, AVIF, JPEG XL, BMP, TIFF and ICO keep it. GIF keeps it as fully on or off. JPEG and PDF cannot, so transparent areas take the background colour you choose.",
    },
    {
      term: "Size, greyscale and print resolution",
      detail:
        "Limit the longest side to shrink large images (smaller ones are never enlarged), remove colour, or write a print resolution into JPEG, PNG, BMP and TIFF files.",
    },
    {
      term: "Limits and privacy",
      detail:
        "Up to 50 images per batch, each up to 50 MB and 50 megapixels. Everything runs in your browser; files are not uploaded, and metadata such as location is removed.",
    },
  ],
  guideHref: "/blog/jpeg-png-webp-which-format/",
}

export function ImageConverterTutorial() {
  return <ToolTutorial content={content} />
}
