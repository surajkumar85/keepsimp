export type BlogPost = {
  slug: string
  title: string
  description: string
  category: string
  readingTime: string
  image: string
  imageAlt: string
  tool: string
  intro: string
  sections: { id: string; title: string; paragraphs: string[] }[]
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
          "KeepSimp accepts still JPEG, PNG and WebP images up to 20 MB and 16 million pixels. It reads the file on your device, draws the image in a local browser canvas, and creates a downloadable output. The tool does not send the selected file to a server.",
        ],
      },
      {
        id: "choose-a-width",
        title: "Set the size for where it will live.",
        paragraphs: [
          "A smaller pixel count is often the clearest way to reduce an image's weight. For example, a picture intended for a small card usually does not need the same dimensions as a full-screen photograph. Check the space where the image will appear before choosing a width.",
          "Open Image compressor, choose a file, and enter a width in pixels. The height follows the original proportions. Output is limited to 4096 pixels on either side. Increasing the width cannot recreate detail that was never in the source.",
        ],
      },
      {
        id: "pick-quality",
        title: "Adjust quality, then look closely.",
        paragraphs: [
          "For JPEG and WebP, the quality setting asks the browser to balance fidelity and file size. A quality of 80 is a useful starting experiment, not a guarantee. Gradients, text and busy textures may need a different setting. PNG does not use this lossy quality control.",
          "Download the result and inspect it at the size people will actually view it. Look for blurred lettering, halos around edges, or banding in smooth areas. If the change is distracting, increase quality or use a more suitable format. Compare the measured size; an export can be larger than its source.",
        ],
      },
      {
        id: "check-before-replacing",
        title: "Check the result before replacing anything.",
        paragraphs: [
          "The tool reports output dimensions and file size after processing. Open the downloaded file in the app or page where you plan to use it. Confirm that it displays correctly before removing a larger copy from your workflow.",
          "Canvas exports may remove metadata or color profiles, and animation is not preserved. JPEG also replaces transparency with a white background in KeepSimp. Use a still image, keep the original, and choose PNG or WebP when transparency matters. For archival or print work, use a workflow that explicitly preserves the properties you need.",
        ],
      },
    ],
    sources: [
      {
        title: "MDN: Canvas image export and quality",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob",
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
          "JPEG uses lossy compression, and it does not support transparent pixels. It is a practical choice for photographic scenes when a solid background is acceptable. In KeepSimp, transparent areas become white when you choose JPEG.",
          "Adjust width and quality in the image converter, then inspect your export. Fine lines and lettering can reveal changes more readily than natural textures, so a format suitable for a photograph may be a poor fit for a small diagram.",
        ],
      },
      {
        id: "png",
        title: "PNG: preserve crisp graphics and transparency.",
        paragraphs: [
          "PNG supports lossless compression and transparency. It is useful for interface graphics, diagrams and images whose sharp edges matter. The quality slider does not apply to PNG exports in KeepSimp.",
          "Lossless output does not mean every part of the original file is retained. KeepSimp creates a new canvas export, which can remove metadata and color profiles. Resizing changes pixel data as well. Preserve the original when those properties matter.",
        ],
      },
      {
        id: "webp",
        title: "WebP: compare it for browser delivery.",
        paragraphs: [
          "WebP supports transparency and both lossy and lossless encoding. KeepSimp's canvas-based WebP export uses the browser's encoder and a quality setting. File sizes vary by image and browser; compare an actual output rather than assuming a fixed percentage saving.",
          "Choose your image, select WebP, set the width and quality, then convert. WebP export is disabled when unavailable in your browser. KeepSimp also checks the actual output type before download, so an unexpected fallback will not produce a misleading file extension. JPEG and PNG are useful alternatives.",
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
    readingTime: "3 min read",
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
          "Formatting puts nested values on separate lines and uses two spaces of indentation. It makes objects and arrays easier to scan. Minification removes whitespace between tokens, which is useful when you need a compact document.",
          "Whitespace inside a quoted string is data. It should stay exactly where it is. The KeepSimp formatter preserves original string tokens rather than rewriting them, so escaped quotes, spaces and Unicode escape sequences are retained.",
        ],
      },
      {
        id: "large-numbers",
        title: "Keep large numbers as they were written.",
        paragraphs: [
          "A formatter that parses JSON into JavaScript values and then stringifies them can change numeric text. JavaScript numbers cannot represent every large integer exactly. For instance, the integer 9007199254740993 is beyond the maximum safe integer.",
          "KeepSimp uses the native parser to check syntax, then formats the original tokens. The downloaded text preserves 9007199254740993, exponent notation and the spelling of numeric tokens. That does not make a downstream application's numeric parser more precise; it keeps the formatter from changing your source.",
        ],
      },
      {
        id: "try-it",
        title: "Try it with a small example first.",
        paragraphs: [
          "Open JSON formatter and choose Use example, or paste your own document into Your JSON. Select Format JSON to add indentation, or Minify to remove spacing outside strings. The result appears in a separate field, leaving your input available for comparison.",
          "Download JSON saves the result as a .json file. Copy result uses your browser's clipboard permission; if that is unavailable, you can select the result or download it instead. The tool accepts up to one million characters and formats documents up to 100 levels deep.",
        ],
      },
      {
        id: "syntax-errors",
        title: "A readable document still needs valid syntax.",
        paragraphs: [
          "JSON requires double-quoted property names and strings. A trailing comma after the last item is not valid. If validation fails, the tool shows an error and keeps your input so you can fix it. Formatting is not an automatic repair tool.",
          "Duplicate keys are preserved in the text; different consumers may interpret them differently. Use unique keys when possible and check the schema expected by the application that will read the result. KeepSimp checks JSON syntax, not an application's business rules.",
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
        title: "MDN: JSON parsing",
        url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse",
      },
    ],
  },
]

export function findPost(slug: string) {
  return posts.find((post) => post.slug === slug)
}
