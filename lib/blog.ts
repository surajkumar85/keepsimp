export type BlogPost = {
  slug: string
  title: string
  description: string
  category: string
  readingTime: string
  image: string
  imageAlt: string
  tool: string
  toolAnchor?: string
  intro: string
  sections: {
    id: string
    title: string
    paragraphs: string[]
    example?: { label: string; code: string }
  }[]
  sources: { title: string; url: string }[]
}

export const posts: readonly BlogPost[] = [
  {
    slug: "compress-images-without-uploading",
    title: "A lighter image, without the upload.",
    description:
      "How to compress an image in your browser, choose useful settings, and compare the result before replacing your original.",
    category: "Images",
    readingTime: "4 min read",
    image: "/images/coastline-display.webp",
    imageAlt:
      "A coastal landscape used to compare original and optimized images",
    tool: "image-compressor",
    intro:
      "A photo can look lovely and still be larger than the place you want to put it. The useful question is not how small you can make it. It is how much detail you need for its next job: a portfolio, a message, or a website. Here is a practical way to find that balance with the KeepSimp image compressor.",
    sections: [
      {
        id: "start-with-the-original",
        title: "Start with the original, and keep it.",
        paragraphs: [
          "Work from the best version you have. Repeatedly opening a lossy file and saving it again can introduce further changes. Keep a separate original so you can make a different export later.",
          "The KeepSimp image compressor accepts JPEG, PNG, WebP, AVIF, HEIC, GIF, BMP, TIFF, SVG and JPEG XL files up to 50 MB and 50 million pixels. Animated files use their first frame. It decodes and encodes the image on your device with WebAssembly codecs running in your browser. The tool does not send the selected file to a server.",
        ],
      },
      {
        id: "choose-a-width",
        title: "Set the size for where it will live.",
        paragraphs: [
          "A smaller pixel count is often the clearest way to reduce an image's weight. For example, a picture intended for a small card usually does not need the same dimensions as a full-screen photograph. Check the space where the image will appear before choosing a width.",
          "Open Image compressor and choose, drop or paste a file. Under Size, pick a percentage, a long edge such as 1920 pixels, or exact custom dimensions; proportions stay locked unless you unlock them. You can also crop to a shape such as 1:1 or 16:9 and rotate the image. Outputs can be up to 16,383 pixels on a side. Enlarging cannot recreate detail that was never in the source.",
        ],
      },
      {
        id: "pick-quality",
        title: "Adjust quality, then look closely.",
        paragraphs: [
          "Smart compression tries several quality levels and keeps the smallest file that still measures close to your original, using a structural similarity score. Images with text and flat colour are judged by their weakest areas, so edges stay clean. Choose High quality for more detail, Smallest for lighter files, Custom to set quality yourself, or Target size to fit a limit such as 200 KB.",
          "Drag the comparison slider across the image, and zoom to 100% or 200% to inspect detail. Look for blurred lettering, halos around edges, or banding in smooth areas. If the change is distracting, choose High quality or a different format. Compare the measured size; if re-encoding cannot beat your original, KeepSimp tells you and offers the original instead.",
        ],
      },
      {
        id: "check-before-replacing",
        title: "Check the result before replacing anything.",
        paragraphs: [
          "The tool reports the output format, dimensions, file size, saving and how much detail it measured as kept. Open the downloaded file in the app or page where you plan to use it. Confirm that it displays correctly before removing a larger copy from your workflow.",
          "Compressed files leave out metadata such as camera details and location, and colours are converted to sRGB. Animation is not preserved. JPEG replaces transparency with a background colour, white by default. Keep the original, and choose PNG, WebP or AVIF when transparency matters. For archival or print work, use a workflow that explicitly preserves the properties you need.",
        ],
      },
    ],
    sources: [
      {
        title: "MDN: Canvas image export and quality",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob",
      },
      {
        title:
          "Wang et al.: Image quality assessment, from error visibility to structural similarity",
        url: "https://ece.uwaterloo.ca/~z70wang/publications/ssim.pdf",
      },
      {
        title: "MozJPEG: improved JPEG encoder",
        url: "https://github.com/mozilla/mozjpeg",
      },
    ],
  },
  {
    slug: "jpeg-png-webp-which-format",
    title: "JPEG, PNG or WebP? Pick the right fit.",
    description:
      "A practical guide to choosing an image format for photos, transparent graphics and everyday browser sharing.",
    category: "A little know-how",
    readingTime: "4 min read",
    image: "/images/private-workspace.webp",
    imageAlt: "Sage paper folders and a glass padlock on a warm tabletop",
    tool: "image-converter",
    intro:
      "An image format is a choice about what the file needs to do. A photograph, a transparent logo and a screenshot have different needs. You do not need a favorite format for everything; you need one that fits the destination and the kind of image you have.",
    sections: [
      {
        id: "quick-choice",
        title: "A quick way to choose.",
        paragraphs: [
          "For a photograph that must work with a wide range of apps, try JPEG. For a graphic that needs transparency or lossless export, try PNG. For browser use where the destination accepts it, compare a WebP export. The best choice depends on the actual result and the receiving app.",
          "Before converting, check the accepted formats of the site, editor or person receiving your file. A small file is not useful if the destination cannot open it. Keep the source so you can export another version without starting over.",
        ],
      },
      {
        id: "jpeg",
        title: "JPEG: a familiar choice for photographs.",
        paragraphs: [
          "JPEG uses lossy compression, and it does not support transparent pixels. It is a practical choice for photographic scenes when a solid background is acceptable. In KeepSimp, transparent areas take the background you choose (white, black or a custom colour) when you convert to JPEG.",
          "Choose a quality in the image converter, then inspect the before and after preview and your export. Fine lines and lettering can reveal changes more readily than natural textures, so a format suitable for a photograph may be a poor fit for a small diagram.",
        ],
      },
      {
        id: "png",
        title: "PNG: preserve crisp graphics and transparency.",
        paragraphs: [
          "PNG supports lossless compression and transparency. It is useful for interface graphics, diagrams and images whose sharp edges matter. In KeepSimp, choose Lossless to keep every pixel of a PNG; the other quality choices may reduce it to a smaller colour palette.",
          "Lossless output does not mean every part of the original file is retained. KeepSimp encodes a new file, which removes metadata and converts colors to sRGB. Resizing changes pixel data as well. Preserve the original when those properties matter.",
        ],
      },
      {
        id: "webp",
        title: "WebP: compare it for browser delivery.",
        paragraphs: [
          "WebP supports transparency and both lossy and lossless encoding. KeepSimp encodes WebP with its own copy of the libwebp encoder, so the result does not depend on your browser. File sizes vary by image; compare an actual output rather than assuming a fixed percentage saving.",
          "Add your images, select WebP and choose a quality. Compare formats encodes the selected image as JPEG, PNG, WebP, AVIF and JPEG XL and lists the real sizes, smallest first. You can also save several formats at once, with picture HTML that keeps JPEG or PNG as a fallback.",
        ],
      },
      {
        id: "make-a-comparison",
        title: "Make a small, useful comparison.",
        paragraphs: [
          "Try two formats at the same dimensions. Open both downloads, compare their visual quality, and check each file's size. Keep the version that your destination accepts and that looks right for its intended use.",
          "Do not convert a lossy image to PNG expecting lost detail to return. A format change cannot restore information already removed. Choose a workflow around what you have now, and store the best source for future edits.",
        ],
      },
    ],
    sources: [
      {
        title: "MDN: Image formats and their capabilities",
        url: "https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Image_types",
      },
    ],
  },
  {
    slug: "format-json-without-losing-precision",
    title: "Make JSON readable. Keep the details.",
    description:
      "Format and minify JSON locally while preserving large numbers, escaped strings and the order of your keys.",
    category: "Developer notes",
    readingTime: "4 min read",
    image: "/images/json-guide.svg",
    imageAlt: "A visual example of compact JSON becoming an indented document",
    tool: "json-formatter",
    intro:
      "A block of compact JSON can be valid and still difficult to read. Formatting adds space and indentation so you can inspect its structure. That should change how the document looks, while keeping the data exactly as it was written. KeepSimp's formatter takes that distinction seriously.",
    sections: [
      {
        id: "format-or-minify",
        title: "Choose formatting or minification.",
        paragraphs: [
          "Formatting puts nested values on separate lines. Choose two spaces, four spaces or tabs; minification removes whitespace between tokens. Recursive key sorting is available under More transformations, preserving the order of array items.",
          "Whitespace inside a quoted string is data. It should stay exactly where it is. The KeepSimp formatter preserves original string tokens rather than rewriting them, so escaped quotes, spaces and Unicode escape sequences are retained.",
        ],
      },
      {
        id: "large-numbers",
        title: "Keep large numbers as they were written.",
        paragraphs: [
          "A formatter that parses JSON into JavaScript values and then stringifies them can change numeric text. JavaScript numbers cannot represent every large integer exactly. For instance, the integer 9007199254740993 is beyond the maximum safe integer.",
          "KeepSimp uses a strict syntax tree and retains original tokens. The downloaded text preserves 9007199254740993, exponent notation and the spelling of numeric tokens. That does not make a downstream application's numeric parser more precise; it keeps the formatter from changing your source. Pointer selections and semantic comparisons also retain exact numbers.",
        ],
      },
      {
        id: "try-it",
        title: "Try it with a small example first.",
        paragraphs: [
          "Open JSON formatter and choose Use example, or paste your own document into Your JSON. Select Format JSON to add indentation, or Minify to remove spacing outside strings. The result appears in a separate field, leaving your input available for comparison.",
          "Download JSON saves the result with the filename you choose. Copy result uses your browser's clipboard permission; if unavailable, select the result or download it. Documents can contain up to five million characters, 100 levels and 100,000 values. Open file and drag-and-drop accept UTF-8 text files up to 10 MB, within those text limits.",
        ],
      },
      {
        id: "syntax-errors",
        title: "A readable document still needs valid syntax.",
        paragraphs: [
          "JSON requires double-quoted property names and strings. A trailing comma after the last item is invalid. The tool reports a line and column, with Go to error to place the editor cursor there. Preview repair is a separate transformation that can guess fixes; review it before accepting the result.",
          "Duplicate keys are preserved when formatting and flagged visibly. Make them unique before querying, comparing, converting or validating a schema. Use the Schema workflow to check a data contract beyond syntax; the tool does not invent your application's business rules.",
        ],
      },
      {
        id: "edit-and-transform",
        title: "Edit comfortably, and preview transformations.",
        paragraphs: [
          "The editor includes syntax highlighting, folding, line numbers, find and replace, undo and redo. Ctrl/Cmd + F opens search and Ctrl/Cmd + Z undoes an edit. Tab indents inside the editor; press Escape, then Tab to move focus out. Use result as source accepts an output explicitly, and Undo edit can restore the earlier input.",
          "More transformations can escape a document as a JSON string, unwrap one, encode or decode UTF-8 Base64 and URL text, flatten leaves into JSON Pointer keys, or redact chosen property names recursively. Redaction matches exact names without regard to case; it cannot guarantee that every secret is removed. Encoding changes representation and is not encryption.",
        ],
      },
      {
        id: "keep-it-local",
        title: "Keep the work in your tab.",
        paragraphs: [
          "Your text is processed locally and is not sent to a formatter server. It is not saved in local storage, and leaving or refreshing the page clears the editor. Theme and sidebar preferences are stored separately from the content you process.",
          "Local processing describes this tool's behavior, not a blanket guarantee about your device. Use a trusted browser and consider extensions, clipboard sharing and the sensitivity of any content you paste. Keep a separate copy of anything you need to retain.",
        ],
      },
    ],
    sources: [
      {
        title: "MDN: JavaScript's maximum safe integer",
        url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/MAX_SAFE_INTEGER",
      },
      {
        title: "Microsoft: JSON syntax tree parser",
        url: "https://github.com/microsoft/node-jsonc-parser",
      },
    ],
  },
  ...jsonPosts,
]

export function findPost(slug: string) {
  return posts.find((post) => post.slug === slug)
}
import { jsonPosts } from "./json-blog"
