import type { BlogPost } from "./blog"

/** The post that goes through every tool on the site, with a link to each. */
export const overviewPost: BlogPost = {
  slug: "free-online-tools-no-upload",
  title: "Eight free tools that never ask for your files.",
  searchTitle:
    "Free online PDF, image and JSON tools that work without uploading",
  description:
    "Every KeepSimp tool in one place: compress, merge and split PDFs, compress, resize and convert images, convert GIFs, and format JSON. Free, no sign-up, and your files stay on your device.",
  keywords: [
    "free online tools",
    "no upload",
    "PDF tools",
    "image tools",
    "compress PDF",
    "merge PDF",
    "split PDF",
    "resize image",
    "convert image",
    "GIF converter",
    "JSON formatter",
    "privacy",
  ],
  category: "Start here",
  readingTime: "5 min read",
  image: "/images/tools-overview.svg",
  imageAlt:
    "Eight tiles, one for each KeepSimp tool: three for PDFs, four for images and animations, and one for JSON",
  tool: "",
  intro:
    "Most online tools work the same way: you upload a file, wait, and download the result, often after a sign-up or a limit of two files a day. KeepSimp works differently. Each tool runs inside your browser, on your own computer or phone, so the file never leaves it. There is no account, no watermark and no daily limit. Here is every tool we have today, what it is good for, and where to read more.",
  sections: [
    {
      id: "how",
      title: "How can a website work without uploading?",
      paragraphs: [
        "A modern browser can do real work. When you open a KeepSimp tool, the page loads the same kind of engine a desktop app uses, and runs it on your device. Your file is read from your disk into the page, changed there, and saved back to your disk. Nothing is sent to a server, because there is no server doing the work.",
        "That has practical upsides beyond privacy. There is no upload to wait for, so large files start at once. There are no limits to sell around. And once a tool has loaded, it keeps working without an internet connection: you can install the site as an app and use it on a plane.",
      ],
      links: [
        { label: "Open all the tools", href: "/dashboard/" },
        { label: "How we handle privacy", href: "/privacy/" },
      ],
    },
    {
      id: "pdf-compressor",
      title: "PDF compressor: make a PDF smaller.",
      paragraphs: [
        "For the file that bounces off an inbox, or the form that says 200 KB. The compressor first shows what makes your PDF big, then shrinks its pictures to the size they are shown at. Text stays real text: sharp, selectable and searchable.",
        "You can pick a level, or name a size and get the best quality that fits. Scanned pages can be rebuilt as sharp letters over soft paper, which is far smaller than a picture of the page. Before you download, any page can be compared before and after.",
      ],
      links: [
        { label: "Compress a PDF", href: "/dashboard/pdf-compressor/" },
        {
          label: "Guide: a smaller PDF, with its words still sharp",
          href: "/blog/compress-pdfs-without-uploading/",
        },
        {
          label: "Guide: compress a PDF to 200 KB or less",
          href: "/blog/compress-pdf-to-200kb/",
        },
      ],
    },
    {
      id: "pdf-merger",
      title: "PDF merger: join files and arrange pages.",
      paragraphs: [
        "Put several PDFs into one, in the order you want. You can pick only some pages, turn them, drag single pages around, and add pictures as pages. Links, bookmarks and form fields come along. A contents page, page numbers and a password are optional.",
      ],
      links: [
        { label: "Merge PDFs", href: "/dashboard/pdf-merger/" },
        {
          label: "Guide: one PDF from many, without the upload",
          href: "/blog/merge-pdfs-without-uploading/",
        },
      ],
    },
    {
      id: "pdf-splitter",
      title: "PDF splitter: take out just the pages you need.",
      paragraphs: [
        "Cut a PDF where you can see the pages, or let a rule do it: every few pages, at bookmarks, by size, at blank pages in a stack of scans, or wherever a number on the page changes. Take pages out as a new file, or remove them. Each part carries only its own pictures and fonts, so parts are as small as they should be.",
      ],
      links: [
        { label: "Split a PDF", href: "/dashboard/pdf-splitter/" },
        {
          label: "Guide: just the pages you need",
          href: "/blog/split-pdfs-without-uploading/",
        },
      ],
    },
    {
      id: "image-compressor",
      title: "Image compressor: lighter photos that look the same.",
      paragraphs: [
        "Make a photo smaller for a website, an email or a form, and see the original and the result side by side before you save. The tool finds the lowest quality that still looks the same, so you do not have to guess a number.",
      ],
      links: [
        { label: "Compress an image", href: "/dashboard/image-compressor/" },
        {
          label: "Guide: a lighter image, without the upload",
          href: "/blog/compress-images-without-uploading/",
        },
      ],
    },
    {
      id: "image-resizer",
      title: "Image resizer: the right size for where it is going.",
      paragraphs: [
        "Resize one image or fifty at once: by pixels, by percent, or in centimetres and inches for print. Presets cover social posts, screens, icons and paper sizes. When the shape has to change, you choose what stays in the frame.",
      ],
      links: [
        { label: "Resize images", href: "/dashboard/image-resizer/" },
        {
          label: "Guide: resize images without losing the important part",
          href: "/blog/resize-images-without-uploading/",
        },
      ],
    },
    {
      id: "image-converter",
      title: "Image converter: from one format to the next.",
      paragraphs: [
        "Turn a phone's HEIC photo into a JPEG, a PNG into WebP or AVIF for a faster website, or a logo into an icon file. Several images and several formats can be done in one go, and the tool can show you how large each format would be before you choose.",
      ],
      links: [
        { label: "Convert images", href: "/dashboard/image-converter/" },
        {
          label: "Guide: JPEG, PNG or WebP, which format when",
          href: "/blog/jpeg-png-webp-which-format/",
        },
      ],
    },
    {
      id: "animation-converter",
      title: "Animation converter: GIFs that fit where they go.",
      paragraphs: [
        "Convert between GIF, animated WebP and APNG, and to and from short videos where your browser can. Trim, change the speed, resize, and fit a file under the size limit of the chat or site it is meant for.",
      ],
      links: [
        {
          label: "Convert an animation",
          href: "/dashboard/animation-converter/",
        },
        {
          label: "Guide: GIF, WebP, APNG or video",
          href: "/blog/gif-webp-apng-or-video/",
        },
      ],
    },
    {
      id: "json-formatter",
      title: "JSON formatter: read, check and reshape data.",
      paragraphs: [
        "For developers and anyone handed a wall of JSON. Format and repair it, browse it as a tree or a table, search it with JSONPath, compare two documents, check it against a schema, and convert it to YAML, CSV or TypeScript types. Large numbers are kept exactly, which many formatters get wrong.",
      ],
      links: [
        { label: "Format JSON", href: "/dashboard/json-formatter/" },
        {
          label: "Guide: format JSON without losing precision",
          href: "/blog/format-json-without-losing-precision/",
        },
      ],
    },
    {
      id: "next",
      title: "What is coming next.",
      paragraphs: [
        "Video and audio tools are being built: converting, compressing and trimming video, and pulling the sound out of a clip. They are listed on the tools page as coming soon, and will work the same way as everything else here: in your browser, with nothing uploaded.",
      ],
      links: [
        { label: "See what is ready and what is coming", href: "/dashboard/" },
      ],
    },
  ],
  sources: [
    {
      title: "WebAssembly: what lets a browser run this kind of work, MDN",
      url: "https://developer.mozilla.org/en-US/docs/WebAssembly",
    },
    {
      title:
        "Progressive web apps: installing a site and using it offline, MDN",
      url: "https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps",
    },
  ],
}

export const resizePost: BlogPost = {
  slug: "resize-images-without-uploading",
  title: "The right size, without losing the important part.",
  searchTitle:
    "How to resize images online for free, in pixels, cm or for print",
  description:
    "How to resize an image in your browser: by pixels or percent, in cm or inches for print, for social posts and websites, one image or fifty at once. Free and nothing is uploaded.",
  keywords: [
    "resize image",
    "image resizer",
    "resize image online free",
    "resize photo in cm",
    "resize image in pixels",
    "resize for Instagram",
    "passport photo size",
    "batch resize images",
    "srcset",
    "no upload",
  ],
  category: "Images",
  readingTime: "5 min read",
  image: "/images/image-resize-guide.svg",
  imageAlt:
    "One wide photograph and three smaller copies of it in different shapes, each keeping the same subject in view",
  tool: "image-resizer",
  intro:
    "Resizing sounds simple until the form says 600 by 600 pixels and your photo is wide, or a printer asks for 10 by 15 centimetres and you only know megapixels. This guide goes through the ways to resize with the KeepSimp image resizer, which does the work in your browser, so your photos are never uploaded.",
  sections: [
    {
      id: "two-questions",
      title: "Two questions decide everything.",
      paragraphs: [
        "First: how many pixels do you need? A screen shows pixels directly, so a website or a profile picture needs a width and a height in pixels. Paper is different. A printer needs enough pixels for the size of the paper, and the usual rule is 300 pixels for every inch.",
        "Second: does the shape have to change? Making a picture smaller in the same shape loses nothing important. Making a wide photo square means something has to give: part of the picture is cut away, or bars are added, or it is squashed. Knowing which one you want saves most of the frustration.",
      ],
    },
    {
      id: "pixels",
      title: "Resize by pixels or percent.",
      paragraphs: [
        "When you know the number, type it. Set a width and the height follows, so the shape is kept. Or set the longest side, which is handy for a mixed pile of upright and sideways photos: every one ends up at most that long.",
        "Percent is the quick way to halve a screenshot. Megapixels is the quick way to meet a rule such as no more than two megapixels.",
        "One switch matters more than it looks: do not enlarge. A small picture blown up to a large size only gets blurry. With enlarging off, pictures that are already small enough are left alone.",
      ],
      links: [
        { label: "Open the image resizer", href: "/dashboard/image-resizer/" },
      ],
    },
    {
      id: "print",
      title: "Resize in centimetres or inches for print.",
      paragraphs: [
        "Paper sizes are lengths, not pixels. Choose centimetres, millimetres or inches, type the size, and pick a print resolution. 300 dots per inch is the standard for photographs; 150 is fine for a poster seen from across a room.",
        "The sum behind it is simple: a 4 by 6 inch print at 300 dots per inch needs 1,200 by 1,800 pixels. The resizer does the sum and stores the resolution in JPEG and PNG files, so a print shop's software opens them at the right size.",
        "Photo sizes for documents work the same way. Look up the size your country asks for, in millimetres, enter it, and choose what stays in the frame.",
      ],
    },
    {
      id: "shape",
      title: "When the shape has to change.",
      paragraphs: [
        "There are three honest ways to fit a picture into a different shape. Crop to fill cuts away what does not fit and fills the frame. Fit with padding keeps the whole picture and adds a background at the sides: white, black, a colour, see-through, or a blurred copy of the picture itself. Stretch forces it and bends faces, so it is rarely right.",
        "If you crop, choose what stays. Drag the picture inside the frame, pick one of nine positions, or let smart focus find the part with the most going on. In a batch, the position applies to every picture, and you can still adjust one by hand.",
      ],
    },
    {
      id: "social",
      title: "Sizes for social posts, screens and icons.",
      paragraphs: [
        "Nobody remembers that a story is 1,080 by 1,920 pixels. Presets hold the common sizes for social posts, websites, screens, printed photos and app icons, so you choose by name.",
        "Sizes that platforms ask for change from time to time. Treat a preset as a good starting point and check the platform's own help page if a post looks cropped.",
      ],
    },
    {
      id: "batch",
      title: "Fifty pictures at once, and several sizes of each.",
      paragraphs: [
        "Drop a whole folder's worth. Every picture gets the same settings and its own row with the result, and everything downloads as one ZIP. A file that cannot be read says so and does not stop the others.",
        "For websites, the resizer can write several widths of every picture in one go, and gives you the HTML to paste, so phones get a small file and large screens a sharp one. File names follow a pattern you set, with the width in the name if you like.",
      ],
      links: [
        {
          label: "Then make them lighter: the image compressor",
          href: "/dashboard/image-compressor/",
        },
        {
          label: "Need another format? The image converter",
          href: "/dashboard/image-converter/",
        },
      ],
    },
    {
      id: "format",
      title: "Save in a format that suits the job.",
      paragraphs: [
        "A resized picture can keep its format or change it. JPEG is the safe choice for photographs that anyone must be able to open. WebP and AVIF are smaller for websites. PNG keeps flat graphics and see-through backgrounds exact.",
        "Keep your original. A smaller picture cannot be made large again without losing sharpness, so resize a copy.",
      ],
      links: [
        {
          label: "Guide: JPEG, PNG or WebP, which format when",
          href: "/blog/jpeg-png-webp-which-format/",
        },
        {
          label: "Guide: a lighter image, without the upload",
          href: "/blog/compress-images-without-uploading/",
        },
      ],
    },
  ],
  sources: [
    {
      title: "Responsive images, MDN",
      url: "https://developer.mozilla.org/en-US/docs/Web/HTML/Guides/Responsive_images",
    },
    {
      title: "Resizing images: fit modes explained, sharp",
      url: "https://sharp.pixelplumbing.com/api-resize",
    },
  ],
}

export const targetSizePost: BlogPost = {
  slug: "compress-pdf-to-200kb",
  title: "Under 200 KB, and still easy to read.",
  searchTitle: "How to compress a PDF to 200 KB, 100 KB or 1 MB for free",
  description:
    "How to compress a PDF to 100 KB, 200 KB, 500 KB or 1 MB for a job, visa or exam form. Name the size and get the best quality that fits, free, in your browser, with nothing uploaded.",
  keywords: [
    "compress PDF to 200kb",
    "compress PDF to 100kb",
    "compress PDF to 1mb",
    "reduce PDF size",
    "PDF size reducer",
    "compress PDF online free",
    "compress scanned PDF",
    "PDF for online form",
    "no upload",
  ],
  category: "A little know-how",
  readingTime: "4 min read",
  image: "/images/pdf-size-guide.svg",
  imageAlt:
    "A PDF of 3.2 MB beside a limit marked at 200 KB, and the same PDF fitted just under the limit",
  tool: "pdf-compressor",
  intro:
    "Application forms love a size limit. Upload your certificate, under 200 KB. Your ID, under 100 KB. Your file is 3 MB, the deadline is tonight, and the first tool you find wants an account. Here is how to hit a size with the KeepSimp PDF compressor, and what to do when a file will not go that small.",
  sections: [
    {
      id: "name-the-size",
      title: "Name the size and let the tool find the quality.",
      paragraphs: [
        "Most compressors offer low, medium and high, and leave you to try each until one happens to fit. That is backwards. You know the limit, so say it.",
        "In the compressor, choose To a size and pick 100 KB, 200 KB, 500 KB, 1 MB or any size you type. The only way to know what a file weighs at some setting is to write it, so the tool writes yours a few times, from gentle settings to harsh ones, and keeps the gentlest result that fits. A file that only needs to lose a little loses only a little.",
      ],
      links: [
        {
          label: "Compress a PDF to a size",
          href: "/dashboard/pdf-compressor/",
        },
      ],
    },
    {
      id: "what-gives",
      title: "What gives way, and what does not.",
      paragraphs: [
        "Pictures give way first, because that is where the size is. They are brought down to the size they are shown at and saved at a lower quality, step by step, until the file fits.",
        "Text does not give way. It stays real text, as sharp as before, and can still be selected and searched. Many quick tools reach a small size by turning every page into one blurry picture. A form's reviewer then has to squint at your name. This one never does that.",
      ],
    },
    {
      id: "scans",
      title: "Scanned documents: use the scan settings.",
      paragraphs: [
        "A scanned certificate or ID is a picture of a page, and it is the hardest kind of file to get under a small limit. Two settings help a great deal.",
        "Text and paper rebuilds each scanned page as sharp black-and-white letters over a soft colour background. It is usually several times smaller than the scan, and the letters are crisper. Stamps and signatures keep their colour.",
        "Black and white goes further, like a photocopy. For a page of plain print it is tiny and perfectly readable. Do not use it for photographs or ID cards with a picture on them: shading is lost.",
      ],
      links: [
        {
          label: "More on scans and how compression works",
          href: "/blog/compress-pdfs-without-uploading/",
        },
      ],
    },
    {
      id: "wont-fit",
      title: "When it will not fit.",
      paragraphs: [
        "Some files cannot reach a size while staying easy to read, and a good tool tells you so. You get the smallest readable result and how far over it is, with three ways forward.",
        "Go further lets pictures get blurry, if the limit matters more than how they look. Check the result before you send it.",
        "Send fewer pages. If the form only needs the first page of a ten-page statement, take that page out with the PDF splitter and compress it alone.",
        "Scan again at a lower setting. A phone scan at full camera size is far more than a form needs. Black and white at 150 to 200 dots per inch is plenty for a page of print.",
      ],
      links: [
        {
          label: "Take out just the pages you need: the PDF splitter",
          href: "/dashboard/pdf-splitter/",
        },
      ],
    },
    {
      id: "check",
      title: "Check it before you upload it.",
      paragraphs: [
        "Open the result and read the smallest print on it: a date, a registration number, a signature. The compressor puts any page side by side with the original under a divider you can drag, so the comparison takes seconds.",
        "Keep your original file. If the form rejects the compressed one, or you need a better copy later, you will want to start again from the real thing.",
      ],
    },
    {
      id: "private",
      title: "Your documents stay with you.",
      paragraphs: [
        "The files that need a size limit are IDs, certificates and bank statements. With KeepSimp they are compressed on your own device and are never uploaded. There is no account, no watermark and no limit on how many files you compress.",
      ],
      links: [
        {
          label: "Every KeepSimp tool in one place",
          href: "/blog/free-online-tools-no-upload/",
        },
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
  ],
}
