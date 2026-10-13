export type BlogPost = {
  slug: string
  /** The heading of the article, in the site's own voice. */
  title: string
  /**
   * The page title search engines and browser tabs show: the question a
   * person types, in plain words. The heading is used when this is left out.
   */
  searchTitle?: string
  description: string
  /** What the article is about, as the phrases people search for. Shown as its topics. */
  keywords?: string[]
  category: string
  readingTime: string
  image: string
  imageAlt: string
  /** The tool the article goes with, by its id; empty for an article about all of them. */
  tool: string
  toolAnchor?: string
  intro: string
  sections: {
    id: string
    title: string
    paragraphs: string[]
    example?: { label: string; code: string }
    /** Where to go from here: a tool or another article on this site, or a page elsewhere. */
    links?: { label: string; href: string }[]
  }[]
  sources: { title: string; url: string }[]
}

export const posts: readonly BlogPost[] = [
  overviewPost,
  {
    slug: "compress-images-without-uploading",
    searchTitle: "How to compress images online without uploading them",
    keywords: [
      "compress image",
      "image compressor",
      "reduce image size",
      "compress JPEG",
      "compress PNG",
      "compress photo online free",
      "no upload",
    ],
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
  resizePost,
  {
    slug: "jpeg-png-webp-which-format",
    searchTitle: "JPEG, PNG or WebP: which image format to use and when",
    keywords: [
      "JPEG vs PNG",
      "WebP vs JPEG",
      "AVIF",
      "image format",
      "convert image",
      "HEIC to JPG",
      "PNG to WebP",
    ],
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
    searchTitle: "GIF, WebP, APNG or video: which to use for animations",
    keywords: [
      "GIF converter",
      "GIF to MP4",
      "video to GIF",
      "animated WebP",
      "APNG",
      "compress GIF",
      "GIF for Discord",
    ],
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
    searchTitle: "How to merge PDF files online for free, without uploading",
    keywords: [
      "merge PDF",
      "combine PDF",
      "join PDF files",
      "PDF merger",
      "merge PDF online free",
      "rearrange PDF pages",
      "no upload",
    ],
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
    slug: "split-pdfs-without-uploading",
    searchTitle: "How to split a PDF online for free, without uploading",
    keywords: [
      "split PDF",
      "PDF splitter",
      "extract pages from PDF",
      "remove pages from PDF",
      "split PDF by size",
      "split scanned PDF",
      "no upload",
    ],
    title: "Just the pages you need, without the upload.",
    description:
      "How to split a PDF in your browser: cut it where you can see, at bookmarks, by size or at blank pages, and get parts that are no larger than they should be.",
    category: "A little know-how",
    readingTime: "6 min read",
    image: "/images/pdf-split-guide.svg",
    imageAlt:
      "One long PDF cut at two places into three smaller files, each with its own pages",
    tool: "pdf-splitter",
    intro:
      "Splitting a PDF is the opposite of merging one, and it goes wrong in its own ways. The parts come out nearly as large as the whole. The cut lands one page off. A stack of scans has to be parted by hand. And most online splitters want the document uploaded first. This guide goes through the ways to split with the KeepSimp PDF splitter, which does the work in your browser.",
    sections: [
      {
        id: "why-local",
        title: "Why split on your own device?",
        paragraphs: [
          "People split the documents they would least like to share: one payslip out of a year's worth, one signed page out of a contract, one patient's letters out of a scan. An upload service receives the whole file to hand back a piece of it.",
          "A PDF can be split entirely in the browser. The file is read from your disk into the page's memory, the parts are written there, and they are saved back to your disk. Nothing crosses the network, and it works without a connection once the page has loaded.",
        ],
      },
      {
        id: "see",
        title: "Cut where you can see.",
        paragraphs: [
          "Typing page numbers from memory is how a cut lands one page off. Look at the pages instead. The splitter shows every page as a small picture with a pair of scissors between each two; press where a part should end. Each part is listed with its pages straight away, so a slip shows before anything is written.",
          "When small pictures are not enough, open the file in the reader. Scroll, zoom, search for the heading you are after, and cut after the page you are on.",
          "Rules save the pressing when a file is regular: a cut after every few pages, or the file in so many equal parts, or every page on its own. Typed ranges such as 1-3, 4-10, 11- do the same from the keyboard, and may overlap when two parts need the same page.",
        ],
      },
      {
        id: "structure",
        title: "Let the document say where its parts are.",
        paragraphs: [
          "A report or a book usually carries bookmarks, and they already mark where chapters begin. Splitting at bookmarks makes a file of each chapter and names it after the chapter. Bookmarks can sit under one another, so choose the level: the top level for parts, the next for chapters.",
          "Files without bookmarks often still have a pattern. When every document in a pack starts with the same words, such as Invoice or Dear, a new part can start at each page that holds them. When a number sits in the same corner of every page, the splitter can read that corner and start a new part whenever the number changes, naming each part after it. Both read the text a PDF holds; a scan holds pictures of text and cannot be read this way.",
        ],
      },
      {
        id: "scans",
        title: "Part a stack of scans.",
        paragraphs: [
          "Scanning a pile of documents in one go leaves one long file. If a blank sheet sat between the documents, the blank pages are the cuts. A scanned blank page is never perfectly white, so the splitter measures how much of each page holds marks, and you choose how strict to be: nothing at all, dust and a lone page number, or also punch holes and a short line. It marks what it found, and you can turn any page round before splitting.",
          "A book laid open on a scanner gives two pages on every sheet. Those can be cut down the middle first, left page then right, or the other way for books read from right to left. Nothing is redrawn: each half is the same scan seen through half its frame.",
          "Double-sided originals scanned one side at a time come out as fronts and backs in turn. Odd and even pages part them into two files.",
        ],
      },
      {
        id: "size",
        title: "Split by size when there is a limit.",
        paragraphs: [
          "Email and upload forms set limits: 10 MB here, 25 MB there. Splitting by size makes parts that each stay under the limit and hold as many pages as fit.",
          "How large a set of pages will be as its own file cannot be read off the original, because fonts and pictures that pages share are counted once per part. A splitter that guesses can overshoot. The reliable way is to write a part, weigh it, and try again with more or fewer pages, which is what the KeepSimp splitter does. A single page that is over the limit by itself gets a part of its own and says so; making it smaller would mean compressing its pictures, which is a different job.",
        ],
      },
      {
        id: "small",
        title: "Why parts are often too large, and how to avoid it.",
        paragraphs: [
          "Split a 10 MB file into ten parts and you may get ten files of nearly 10 MB each. The reason is in how PDFs are built. A page does not contain its fonts and pictures; it points at a list of them. Many programs give every page of a file the same list, holding everything in the file. A splitter that copies a page with its list copies all of it.",
          "The fix is to read what each page really draws and give it a list with only that. Then a part carries its own pictures and the fonts its pages use, and the parts together weigh about what the original did. If your parts look too large, this step is what your tool is missing.",
          "Fonts set a floor. A font that two parts both use has to travel with both, so parts of a text-heavy file can add up to a little more than the original.",
        ],
      },
      {
        id: "kept",
        title: "Know what a part keeps.",
        paragraphs: [
          "A good split copies pages exactly: text stays text and pictures are not compressed again. Links to pages inside the same part keep working; links to pages that went into another part have nowhere to lead and are removed. Bookmarks follow their pages, and notes and fillable fields stay where they are.",
          "A digital signature cannot survive. It covers the exact bytes of the file it was made for, and a part is a different file. A careful tool keeps the picture of the signature and tells you. A password on the original has to be entered before its pages can be read, and the parts have no password unless you set one.",
          "Name the parts so they sort. A pattern such as the file's name and a part number, with zeros in front of the number, keeps part 2 before part 10 in any folder.",
        ],
      },
    ],
    sources: [
      {
        title: "I split my PDF but the resulting files are so big, PDFsam",
        url: "https://blog.pdfsam.org/pdf-format/i-split-my-pdf-but-the-resulting-files-are-so-big/1910/",
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
    slug: "compress-pdfs-without-uploading",
    searchTitle: "How to compress a PDF online without losing quality",
    keywords: [
      "compress PDF",
      "PDF compressor",
      "reduce PDF size",
      "compress PDF online free",
      "compress scanned PDF",
      "PDF without losing quality",
      "no upload",
    ],
    title: "A smaller PDF, with its words still sharp.",
    description:
      "How to make a PDF smaller in your browser: find out what makes it big, shrink its pictures without blurring its text, reach a size limit, and handle scans properly.",
    category: "A little know-how",
    readingTime: "7 min read",
    image: "/images/pdf-compress-guide.svg",
    imageAlt:
      "A bar showing that most of a PDF is pictures, and the same file after compressing at a fifth of its size",
    tool: "pdf-compressor",
    intro:
      "A PDF is too big when it bounces off an inbox, or a form says 200 KB and yours is 3 MB. The quick fix many tools reach for is to turn every page into a picture, which makes the file smaller and the text fuzzy, and leaves nothing to select or search. There are better ways. This guide goes through them with the KeepSimp PDF compressor, which does the work in your browser.",
    sections: [
      {
        id: "why-local",
        title: "Why compress on your own device?",
        paragraphs: [
          "The files people need to shrink are often the ones they would least like to hand over: a passport scan for a visa form, payslips for a landlord, a signed contract. An upload service receives the whole document to give a smaller one back.",
          "A PDF can be compressed entirely in the browser. The file is read from your disk into the page's memory, changed there, and saved back to your disk. Nothing crosses the network, there is no limit on size or number, and it works without a connection once the page has loaded.",
        ],
      },
      {
        id: "where",
        title: "First, find out where the size is.",
        paragraphs: [
          "A PDF is a container. It holds the text and drawings of its pages, the fonts they are set in, pictures, and often things nobody sees: small previews of every page, data the design app stored so it could reopen its own file, attachments. Which of these is large decides what will help.",
          "The compressor shows this as soon as a file is added: one bar cut into pictures, fonts, text and the rest, with the heaviest pictures and the pages they are on. In most large files the pictures are nine tenths of the size. In a file saved from a design app with its editing data kept, half the file can be data that no reader ever uses, and it comes out with no visible change at all.",
          "A file that is mostly text is already small. Text and drawings are stored as instructions, not pixels, and compress very well. If the bar shows almost no pictures, expect little.",
        ],
      },
      {
        id: "pictures",
        title: "Shrink the pictures, not the pages.",
        paragraphs: [
          "A picture in a PDF has two sizes: how many pixels it holds, and how large it is drawn on the page. A phone photograph has thousands of pixels each way; placed at the width of a column it shows perhaps 150 of them per inch on a screen and could use 300 on a good printer. The rest is weight that cannot be seen.",
          "So the first step is to bring each picture down to the size it is shown at, and no further. 150 pixels per inch suits screens and office printers. 96 is enough for reading on a screen. A picture drawn in two places has to serve the larger one.",
          "The second step is how the picture is saved. Photographs are saved as JPEG, and the question is at what quality. Too high wastes space; too low shows blocks and bands, first in skies and soft backgrounds. The compressor measures how alike the result is to the original and uses the lowest quality that still measures the same, with a floor under it for the smooth areas that measuring alone gets wrong.",
          "Charts, logos and screenshots are different. They have flat colour and hard edges, and JPEG leaves a haze round every edge. They are kept without loss, which for flat colour is often smaller than a JPEG anyway.",
        ],
      },
      {
        id: "text",
        title: "Keep text as text.",
        paragraphs: [
          "If a compressed PDF comes back with words you can no longer select, the tool turned its pages into pictures. The text is now a photograph of text: blurry when you zoom, invisible to search, silent to a screen reader, and useless for copying a number out of.",
          "There is no need. Compressing pictures leaves the text exactly where it was, as sharp at any zoom as before. Links keep working, bookmarks keep their places, and form fields can still be filled in. Check for this in whatever tool you use: select a word in the result.",
        ],
      },
      {
        id: "size",
        title: "When a form names a size.",
        paragraphs: [
          "Upload forms set limits such as 100 KB, 200 KB or 2 MB. The only way to know what a file will weigh at some setting is to write it. So the compressor writes it a few times, from gentle settings to harsh ones, and keeps the gentlest result that fits. You lose as little as the limit takes, not as much as the tool's strongest setting does.",
          "Some limits cannot be met with pictures that are still easy to read. Then you are told how far over the result is, and can choose to go further and accept blurry pictures, or split the file. If the text and fonts alone are over the limit, no picture setting will get there, and the page says so.",
        ],
      },
      {
        id: "scans",
        title: "Scans are a case of their own.",
        paragraphs: [
          "A scanned page is one large picture of paper with print on it. Saved as a JPEG it is heavy, and making it smaller blurs the print first, which is the one thing on the page that has to stay sharp.",
          "The better way takes the page apart. The print becomes a black-and-white layer at the scan's full sharpness, which packs very small. The paper behind it becomes a soft, low-resolution colour picture: paper has no fine detail to lose. The ink keeps its colour, so a red stamp stays red. Put back together the page looks like the scan, at a fraction of its size, and the letters are crisper than a JPEG would leave them. This is how archives store millions of scanned books.",
          "For plain text, black and white alone is smaller still, like a photocopy. Photographs and shading are lost that way, so it is a choice, not a default.",
          "One caution. Black-and-white pictures in PDFs are often packed with a method that, in one of its modes, stores a single shape for letters that look alike. Scanners using it have been caught swapping one digit for another on real documents. The compressor only ever uses the mode that stores every pixel as it is.",
        ],
      },
      {
        id: "check",
        title: "Look before you send.",
        paragraphs: [
          "A smaller file is only useful if it still says what it said. Compare a page of the result with the original at full size, and look where loss shows first: small print inside pictures, faces, skies, signatures. The compressor draws pages both ways and compares them for you, and puts any page side by side under a divider you can drag.",
          "Keep the original. Compression that loses detail cannot be undone, and compressing a compressed file again loses a little more each time. A careful tool leaves a picture alone once it has saved it, and tells you when a file is already as small as it will get.",
          "Two things do not survive any change to a file. A digital signature covers the exact bytes it was made for, so it stops being valid. And a file made to an archive standard may no longer pass that standard's check. If either matters, compress first and sign or certify afterwards.",
        ],
      },
    ],
    sources: [
      {
        title: "Optimizing PDFs, Adobe Acrobat help",
        url: "https://helpx.adobe.com/acrobat/current/optimizing-pdfs-acrobat-pro.html",
      },
      {
        title: "Internet Archive PDF tools: mixed raster content",
        url: "https://archive-pdf-tools.readthedocs.io/",
      },
      {
        title:
          "Xerox scanners and photocopiers randomly alter numbers in scanned documents, D. Kriesel",
        url: "https://www.dkriesel.com/en/blog/2013/0802_xerox-workcentres_are_switching_written_numbers_when_scanning",
      },
      {
        title: "PDF write options: compression and encryption, MuPDF",
        url: "https://mupdf.readthedocs.io/en/1.28.0/reference/common/pdf-write-options.html",
      },
    ],
  },
  targetSizePost,
  editPost,
  annotatePost,
  signPost,
  formPost,
  cropPost,
  numbersPost,
  watermarkPost,
  {
    slug: "format-json-without-losing-precision",
    searchTitle:
      "JSON formatter online: format and validate without losing big numbers",
    keywords: [
      "JSON formatter",
      "JSON validator",
      "format JSON online",
      "JSON viewer",
      "JSON big numbers",
      "pretty print JSON",
    ],
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
import {
  annotatePost,
  cropPost,
  editPost,
  signPost,
  formPost,
  numbersPost,
  watermarkPost,
  overviewPost,
  resizePost,
  targetSizePost,
} from "./tool-blog"
