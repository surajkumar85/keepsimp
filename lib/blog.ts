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
    slug: "gif-webp-apng-or-video",
    title: "GIF, WebP, APNG or video? Choose how it moves.",
    description:
      "A practical guide to choosing a format for an animation: where it will play, what it shows, and how large the file may be.",
    category: "A little know-how",
    readingTime: "5 min read",
    image: "/images/coastline-display.webp",
    imageAlt: "A rocky coastline with a small house above turquoise water",
    tool: "animation-converter",
    intro:
      "An animation can be saved as a GIF, an animated WebP, an animated PNG or a short video. They all move, but they differ in where they play, how they treat colour and transparency, and how heavy they are. The right one depends on where the animation is going.",
    sections: [
      {
        id: "quick-choice",
        title: "A quick way to choose.",
        paragraphs: [
          "For a web page you control, try animated WebP first, or a video if the animation is long or photographic. For chat apps, email and anywhere you cannot be sure what the other side supports, GIF is the safe choice. For a sticker or artwork with soft, see-through edges, use WebP or APNG.",
          "Then check the destination's rules. Many places accept only certain formats and reject files over a set size. A format is only right if the place it is going will take it.",
        ],
      },
      {
        id: "gif",
        title: "GIF: plays everywhere, at a price.",
        paragraphs: [
          "GIF is the oldest of the four and works almost anywhere an image can be shown. Each frame holds at most 256 colours, and a pixel is either fully solid or fully clear, so photographs band and soft edges turn hard. Files are large for what they show.",
          "You can make a GIF lighter by using fewer colours, a lower frame rate, a smaller size or a shorter clip. In KeepSimp, the fast encoder stores only what changes between frames, and the gifski option gives each frame its own colours for the smoothest result.",
        ],
      },
      {
        id: "webp",
        title: "Animated WebP: full colour, far smaller.",
        paragraphs: [
          "Animated WebP keeps full colour and smooth transparency. Google reports that animated GIFs converted to lossy WebP are 64% smaller, and 19% smaller as lossless WebP. Every current browser plays it. Outside browsers support is patchier, so check before sending one to an app or an older device.",
          "Results depend on the content. Flat artwork is often smallest as lossless WebP, and photographs as lossy. KeepSimp tries both on the first frames at Balanced and High quality and keeps whichever is smaller.",
        ],
      },
      {
        id: "apng",
        title: "APNG: exact colour and soft edges.",
        paragraphs: [
          "An animated PNG stores every pixel exactly, with smooth transparency. That makes it a good fit for stickers and interface artwork. Files are usually larger than WebP. Software that does not know the format shows the first frame as an ordinary PNG, which is a gentle way to fail.",
          "If an exact APNG is too heavy, reducing it to a palette of up to 256 colours, as KeepSimp does at Balanced and Small file quality, often makes it much lighter while keeping soft edges.",
        ],
      },
      {
        id: "video",
        title: "Video: smallest for photographs and recordings.",
        paragraphs: [
          "A short, silent MP4 or WebM is usually far smaller than any animated image, because video formats are built to describe motion. In one test with KeepSimp's sample, a 20-frame pan across a photograph, the GIF was 627 KB, the animated WebP 225 KB and the MP4 between 18 and 36 KB depending on the browser that encoded it. Your own files will differ.",
          "Video has limits of its own. An MP4 has no transparency, a video cannot be used where only an image is accepted, and it needs a video player on the page, set to loop, mute and play inline. Use it where you control the page.",
        ],
      },
      {
        id: "fit-the-destination",
        title: "Fit the destination.",
        paragraphs: [
          "Services publish limits, and change them. At the time of writing, Discord asks for animated emoji under 256 KB and stickers as 320 by 320 pixel APNG files of at most 512 KB, and Telegram asks for video stickers as WebM files of at most three seconds and 256 KB. Check the service's own page before relying on a figure.",
          "KeepSimp's animation converter has presets for these, each with its source and the date it was checked. Set a file size limit and it lowers quality, then frame rate, then size, measuring the real file each time, and tells you what it changed.",
        ],
      },
      {
        id: "try-it",
        title: "Compare your own animation.",
        paragraphs: [
          "Add your animation, then use Compare formats. KeepSimp converts it to every format your browser can write and lists the real sizes, smallest first. Pause the preview on a frame and drag the slider to see what each format did to the picture.",
          "Keep your original. Converting to a lossy format discards detail that cannot be brought back, and converting a GIF to another format cannot restore colours the GIF never had.",
        ],
      },
    ],
    sources: [
      {
        title: "MDN: Image file type and format guide",
        url: "https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Image_types",
      },
      {
        title: "Google: WebP frequently asked questions",
        url: "https://developers.google.com/speed/webp/faq",
      },
      {
        title: "web.dev: Replace animated GIFs with video",
        url: "https://web.dev/articles/replace-gifs-with-videos",
      },
      {
        title: "Discord: emoji resource",
        url: "https://docs.discord.com/developers/resources/emoji",
      },
      {
        title: "Discord: sticker file requirements",
        url: "https://support.discord.com/hc/articles/4402687377815",
      },
      {
        title: "Telegram: video stickers",
        url: "https://core.telegram.org/stickers/webm-vp9-encoding",
      },
    ],
  },
  {
    slug: "merge-pdfs-without-uploading",
    title: "One PDF from many, without the upload.",
    description:
      "How to merge PDF files in your browser: put them in order, arrange single pages, keep links and bookmarks, and decide what a merge should carry over.",
    category: "A little know-how",
    readingTime: "6 min read",
    image: "/images/pdf-merge-guide.svg",
    imageAlt:
      "Pages from a report and an appendix joined in a chosen order into one merged PDF",
    tool: "pdf-merger",
    intro:
      "Merging PDFs sounds like one step: put the files in a row and press a button. In practice a few choices decide whether the result is pleasant to use. Which pages go where, what happens to bookmarks and fillable fields, and whether the file should be ready for a printer. Most online mergers also ask you to upload your documents first. This guide walks through the choices with the KeepSimp PDF merger, which does the work in your browser.",
    sections: [
      {
        id: "why-local",
        title: "Why merge on your own device?",
        paragraphs: [
          "The PDFs people merge are often the ones they would least like to hand to a stranger: contracts, bank statements, medical letters, applications. An upload service receives a full copy of each file, and you have its word for how long it is kept.",
          "A PDF can be merged entirely in the browser. The files are read from your disk into the page's memory, joined there, and saved back to your disk. Nothing crosses the network, so there is nothing to delete afterwards, and it works without a connection once the page has loaded.",
        ],
      },
      {
        id: "order",
        title: "Get the order right first.",
        paragraphs: [
          "Add the files and look at the list before anything else. Drag a file to move it, or use its arrow buttons. Sorting by name helps when the files are numbered; a good sort puts chapter 2 before chapter 10, which plain alphabetical order does not.",
          "You rarely need every page. Each file has a pages field: 1-3, 7 takes the first three pages and the seventh; 10- runs from page ten to the end; odd and even take every other page. A range written backwards, such as 5-1, takes those pages in reverse.",
        ],
      },
      {
        id: "pages",
        title: "Arrange single pages when the files are not enough.",
        paragraphs: [
          "Some jobs are about pages, not files: moving a signature page to the end, dropping a blank scan, turning one page that came in sideways. The Pages view shows every page of the result as a small picture. Select pages, drag them, turn them, copy or remove them, and add a blank page where one is needed. Every change can be undone.",
          "A scanner that only reads one side leaves you with two files, fronts and backs. Alternate pages deals them out in turn, and can read the second file from its end, which is how the backs come out when the stack is turned over.",
          "Pictures can join in. A photograph or a scan saved as JPG or PNG becomes a page, sized like the page before it or on a sheet of its own. A JPEG is placed as it is, without being compressed a second time.",
        ],
      },
      {
        id: "kept",
        title: "Know what a merge keeps.",
        paragraphs: [
          "A good merge copies each page exactly: text stays text, pictures are not re-compressed, and fonts come along. Links inside a document should still lead to the right page after pages have moved, and a link to a page you left out should be removed, not left pointing at nothing.",
          "Bookmarks need a decision. With several files, grouping each file's bookmarks under the file's name keeps the panel readable. A contents page at the front, with a line and a link for every file, helps readers who print or who use a viewer without a bookmark panel.",
          "Fillable fields are the awkward part. Two forms often use the same field name, and a PDF can only hold one field per name. Keeping both means renaming one. Joining them makes one field that is filled in once. Flattening prints the entries onto the page for good, which is what you want before sending a completed form.",
          "Two things cannot survive. A digital signature covers the exact bytes of the file it was made for, so it cannot stay valid inside a different file; a careful tool keeps the picture of the signature and says so. And a password on a source file has to be entered before its pages can be read.",
        ],
      },
      {
        id: "print",
        title: "Make it ready for paper, if it is going there.",
        paragraphs: [
          "Printed on both sides, a file with an odd number of pages leaves the next file starting on the back of its last sheet. A blank page after each odd file fixes that. Mixed page sizes can be fitted onto one size, A4 or Letter, so the printer does not stop to ask for other paper.",
          "File names and page numbers in the footer make a long pack easier to find your way around. Check the bottom edge of a few pages afterwards: a footer is written over whatever is already there.",
        ],
      },
      {
        id: "finish",
        title: "Check, name, and lock if you need to.",
        paragraphs: [
          "Open the result before you send it. Page through it, press a few links and bookmarks, and look at the page count. Then give it a name that will still make sense in a year.",
          "If the file is private, set a password. Current PDF encryption (AES-256) is strong, so the weak point is the password itself: make it long, and send it by a different route than the file. Limits on printing or copying are weaker. They ask viewers to behave, and not every program does, so do not rely on them to keep text from being copied.",
        ],
      },
    ],
    sources: [
      {
        title: "Digital Signatures in a PDF, Adobe",
        url: "https://www.adobe.com/devnet-docs/acrobatetk/tools/DigSigDC/Acrobat_DigitalSignatures_in_PDF.pdf",
      },
      {
        title: "MuPDF JavaScript library reference, Artifex",
        url: "https://mupdf.readthedocs.io/en/latest/reference/javascript/index.html",
      },
      {
        title: "PDF write options: compression and encryption, MuPDF",
        url: "https://mupdf.readthedocs.io/en/1.28.0/reference/common/pdf-write-options.html",
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
