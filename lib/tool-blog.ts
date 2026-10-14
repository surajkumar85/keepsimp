import type { BlogPost } from "./blog"

/** The post that goes through every tool on the site, with a link to each. */
export const overviewPost: BlogPost = {
  modified: "2026-10-13T00:00:00+05:30",
  slug: "free-online-tools-no-upload",
  title: "Ten free tools that never ask for your files.",
  searchTitle: "Free PDF, image, JSON and color tools without uploading",
  description:
    "Every KeepSimp tool together: edit, annotate, compress, merge and split PDFs, resize and convert images, convert GIFs, format JSON, and work with colors. Free, no sign-up, your files stay with you.",
  keywords: [
    "free online tools",
    "no upload",
    "PDF tools",
    "image tools",
    "edit PDF",
    "annotate PDF",
    "compress PDF",
    "merge PDF",
    "split PDF",
    "resize image",
    "convert image",
    "GIF converter",
    "JSON formatter",
    "color converter",
    "privacy",
  ],
  category: "Start here",
  readingTime: "5 min read",
  image: "/images/tools-overview.svg",
  imageAlt:
    "Tiles representing PDF, image, animation and JSON tools, with a color palette strip",
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
      id: "pdf-editor",
      title: "PDF editor: write and draw on any page.",
      paragraphs: [
        "Type on a form that has no fields to fill, add a date or a name, place a picture, or mark a page with boxes, arrows and a pen. Every change is made in the real file and can be undone, and the page you see is the page you will download.",
        "The text you add is real text in a font that travels inside the file, so it looks the same everywhere and can be searched. Before the download, the result is read back and checked. It also changes the words that are already there, a line at a time, in the line's own font, and the old words are really taken out of the file.",
        "It signs and fills in forms, too: draw your signature, type it or use a photo of it; type into a form's fields, tick its boxes and choose from its lists; and fill in a form that has no fields like paper.",
        "And it works on the pages themselves: move them, turn them, copy them, take them out, add the pages of another PDF, crop them, number them and lay a watermark over them.",
        "The same editor marks up and comments: highlight, underline or strike out words by dragging across them, place notes, and reply to the comments a file already has. These are real PDF comments, so the next person sees them as comments in their own program; for a final copy they can be drawn into the page or left out.",
      ],
      links: [
        { label: "Edit a PDF", href: "/dashboard/pdf-editor/" },
        {
          label: "Guide: write on a PDF without sending it anywhere",
          href: "/blog/edit-pdfs-without-uploading/",
        },
        {
          label: "Only marking up? Open it as the PDF annotator",
          href: "/dashboard/pdf-annotator/",
        },
        {
          label: "Guide: mark up a PDF without sending it anywhere",
          href: "/blog/annotate-pdfs-without-uploading/",
        },
        {
          label: "Only signing? Open it as Sign PDF",
          href: "/dashboard/sign-pdf/",
        },
        {
          label: "Guide: sign a PDF without sending it anywhere",
          href: "/blog/sign-pdfs-without-uploading/",
        },
        {
          label: "A form to fill in? Open it as Fill PDF form",
          href: "/dashboard/fill-pdf-form/",
        },
        {
          label: "Make a form others can fill in",
          href: "/dashboard/create-pdf-form/",
        },
        {
          label: "Guide: fill in a PDF form without sending it anywhere",
          href: "/blog/fill-pdf-forms-without-uploading/",
        },
        {
          label: "Margins to trim? Open it as Crop PDF",
          href: "/dashboard/crop-pdf/",
        },
        {
          label: "Guide: crop a PDF, and what cropping means",
          href: "/blog/crop-pdfs-without-uploading/",
        },
        {
          label: "Pages to number? Open it as Add page numbers",
          href: "/dashboard/add-page-numbers/",
        },
        {
          label: "Guide: number the pages of a PDF",
          href: "/blog/add-page-numbers-to-a-pdf/",
        },
        {
          label: "A draft to mark? Open it as Watermark PDF",
          href: "/dashboard/watermark-pdf/",
        },
        {
          label: "Guide: add a watermark to a PDF",
          href: "/blog/watermark-a-pdf-without-uploading/",
        },
        {
          label: "Something that must not be read? Open it as Redact PDF",
          href: "/dashboard/redact-pdf/",
        },
        {
          label: "Guide: redact a PDF so that it stays redacted",
          href: "/blog/redact-a-pdf-without-uploading/",
        },
        {
          label: "A scan you cannot search? Open it as OCR PDF",
          href: "/dashboard/ocr-pdf/",
        },
        {
          label: "Guide: make a scanned PDF searchable",
          href: "/blog/make-a-scanned-pdf-searchable/",
        },
        {
          label: "A signed file to check? Open it as Verify a PDF signature",
          href: "/dashboard/verify-pdf-signature/",
        },
        {
          label: "Guide: verify a PDF signature",
          href: "/blog/verify-a-pdf-signature/",
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
      id: "color-utility",
      title: "Color utility: from a swatch to a palette.",
      paragraphs: [
        "Convert color codes, make palettes and gradients, check WCAG contrast and extract colors from a local image. Browse sourced company palettes and copy their codes, or export your own palette as CSS, JSON, SVG or PNG.",
      ],
      links: [
        { label: "Open the color utility", href: "/dashboard/color-utility/" },
        {
          label: "Guide: one color, a code for every place",
          href: "/blog/convert-hex-rgb-hsl-oklch/",
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

export const editPost: BlogPost = {
  slug: "edit-pdfs-without-uploading",
  title: "Write on a PDF, without sending it anywhere.",
  searchTitle: "How to edit a PDF online for free without uploading it",
  description:
    "How to add text, pictures, shapes and drawings to a PDF in your browser: fill a form that has no fields, mark a page, and download a file that was checked. Free, with nothing uploaded.",
  keywords: [
    "edit PDF",
    "PDF editor",
    "edit PDF online free",
    "add text to PDF",
    "write on PDF",
    "add image to PDF",
    "draw on PDF",
    "type on PDF form",
    "no upload",
  ],
  category: "A little know-how",
  readingTime: "5 min read",
  image: "/images/pdf-edit-guide.svg",
  imageAlt:
    "A page of a PDF with a line of typed text selected, a red box around a paragraph, an arrow, a pen stroke and a small picture, under a row of tools",
  tool: "pdf-editor",
  intro:
    "A form arrives as a PDF with nowhere to type. A contract needs a date beside your name. A plan needs an arrow that says: this wall, not that one. These are small jobs, and most tools that do them want your file on their server first, then an account, then a subscription to take the watermark off. Here is how to do them with the KeepSimp PDF editor, on your own device, and what the editor does not do yet.",
  sections: [
    {
      id: "what-it-does",
      title: "What it does today, and what it does not.",
      paragraphs: [
        "The editor adds things to pages: text, pictures, boxes, ellipses, lines, arrows and freehand drawing. Everything you add can be moved, resized, turned, restyled, copied and deleted, and every step can be undone, all the way back to the file as you opened it.",
        "It also marks and comments, signs, and fills in a form's fields, each of which has a guide of its own.",
        "And it changes the words that are already in a file. Choose Change text, click a paragraph or a line and type. The old letters are taken out of the page, not covered, and the new ones are written in the very font they were written in, at the same size, colour and place. A paragraph flows again within its width: a longer sentence pushes the words after it onto the next lines, set as the paragraph was, to one edge or to both, and links move with the words they lie over. A file often carries only the letters it uses; a letter its font does not have is set in the closest font the editor has, and you are told which before you press Enter. To change a word everywhere, use Find and replace: every place is shown on its page with what it will say, and Replace all changes them in one step that one undo takes back. A line can also be made larger or smaller, given another colour, set in another font (one of the editor's, or a font file of your own), and dragged somewhere else. What it does not do yet: a paragraph that grows needs empty room under it, since nothing below it is moved, and the editor says so when there is none; which lines form a paragraph is judged by how they look, so a list is sometimes taken for one, and a switch in the bar goes back to single lines; and text in scripts whose letters join can be taken out but not retyped. We would rather say so here than let you find out halfway through a job.",
        "The pages themselves can be changed too. Pages opens a list of small pages beside the file: choose one or several, then drag them to another place, turn them, copy them, take them out, or add an empty page between two. Links and bookmarks follow their pages. When a page is taken out, the links and bookmarks that led to it and the form fields that were on it go with it, the download says how many, and the page's content is no longer anywhere in the file. The pages of another PDF can be added between them, also from a locked file once you have typed its password, and any pages you choose can be saved as a file of their own. Crop and page size lays a frame over a page: drag its edges or type the numbers, and the page, the chosen pages or all pages show only what is inside; the same tool makes pages the size of an A4 or a Letter sheet. Cropping hides what is outside the frame and leaves it in the file, so it is no way to remove something for good. Numbers and watermarks puts page numbers, a header or footer, Bates numbers or a watermark on all pages or on the ones you name, each as a thing you can still move or delete. And Details and bookmarks changes the file's title and author, its bookmarks, and the numbers it gives its own pages.",
      ],
      links: [
        { label: "Open the PDF editor", href: "/dashboard/pdf-editor/" },
        {
          label: "Guide: highlights, notes and replies",
          href: "/blog/annotate-pdfs-without-uploading/",
        },
      ],
    },
    {
      id: "type",
      title: "Type where you need words.",
      paragraphs: [
        "Take the text tool, click where the words should start, and type. The line you type sits where you clicked, so filling in a paper form is a matter of clicking each blank and typing. Choose a sans, a serif or a mono font, or a font of your own from a file on your device, a size, bold or italic, a colour and an alignment. A box that is too wide or too narrow can be pulled by its side, and the lines break again to fit.",
        "The three fonts are as wide, letter for letter, as Arial, Times New Roman and Courier New, so your words sit the way they would in the document's own program. The font goes into the file, cut down to the letters you used. That is why your text looks the same on every device, and why it is real text that can be selected and found by a search, not a picture of text.",
      ],
    },
    {
      id: "pictures-and-shapes",
      title: "Pictures, shapes and a pen.",
      paragraphs: [
        "A picture lands in the middle of the page you are reading, and from there you drag it into place. PNG and JPEG files go into the PDF as they are, without being saved again, so nothing is lost; a PNG keeps its see-through parts. That makes a scan of your signature with a clear background a tidy way to sign a page. It is a picture of a signature, not a digital signature that proves who signed.",
        "The pictures a page already has can be changed too. Choose Pictures of the page and every picture gets a frame: drag one to move it, drag its corner to make it larger or smaller, and use the bar to turn it, to put another picture in its place, or to take it out. Nothing is saved again, so a photograph keeps the quality it had. Cutting a picture to a part hides the rest of it; the whole picture stays in the file, and the editor says so. A picture that is taken out is gone from the file.",
        "Links are edited the same way. Choose Links and every link on the page gets a frame: pick one to see where it leads and type another address or a page number, drag it to where it belongs, or take it away. Drag a box on the page to make a new one. The editor takes web, e-mail and telephone addresses and nothing else, and it does not visit them: where a link leads is yours to check.",
        "Boxes, ellipses, lines and arrows are for pointing things out. Draw with a mouse, a pen or a finger for anything looser. Guides appear when a thing lines up with the middle or the edge of the page, or with something else on it.",
        "Three more tools are for marking up. A stamp says Approved, Draft, Paid or words of your own in a frame. A call-out puts a few words in a box with an arrow to what they are about. A measuring line says how long something is, in the unit you choose, and by the scale of a plan when the page is one.",
      ],
    },
    {
      id: "cover",
      title: "Covering is not removing.",
      paragraphs: [
        "The cover tool puts a filled box over part of a page, white by default. It is useful for hiding an old date before you type a new one. But it only covers. The words under it are still in the file, and anyone can select the area, copy it and paste what was there.",
        "Many editors call this whiteout or even redaction, and people have published court papers and reports that way with the names still inside. Do not use a cover for anything private. True redaction, which takes the words and the pixels out of the file and proves it, is one of the versions to come.",
      ],
    },
    {
      id: "what-you-see",
      title: "What you see is the file.",
      paragraphs: [
        "Many browser editors draw your changes on a layer of their own and only write the PDF at the end, which is when surprises happen: a font that changed, a picture that moved. Here every change is made in the real document on your device, and the page is drawn again from that document. The screen cannot disagree with the download, because it is the download.",
        "Before the file is handed to you it is checked. The text you added is read back out of the result, and pages you did not touch are drawn and compared with the original, pixel for pixel. Links, bookmarks, form fields and accessibility tags stay as they were. You can read the result in the built-in reader before you save it.",
      ],
    },
    {
      id: "later",
      title: "Finish now, or come back to it.",
      paragraphs: [
        "By default the things you add become part of the page, like everything else on it, which is what you want before sending a file to someone. If you expect to change them again, turn on Keep what you added editable. They are then stored as separate things, and when you open the file in the editor another day they can be moved, restyled and deleted as before.",
        "The file lives only in the tab while you work, and the page asks before you leave with changes you have not downloaded. A password can be set on the result if it should not be opened by just anyone.",
      ],
      links: [
        {
          label: "Join the edited file with others: the PDF merger",
          href: "/dashboard/pdf-merger/",
        },
        {
          label: "Make the result smaller: the PDF compressor",
          href: "/dashboard/pdf-compressor/",
        },
      ],
    },
    {
      id: "private",
      title: "Your documents stay with you.",
      paragraphs: [
        "The PDFs people edit are contracts, applications, medical forms and school papers. With KeepSimp they are opened and changed on your own device and are never uploaded. There is no account, no watermark and no limit on files or pages, and once the page has loaded the editor works without a connection.",
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
      title: "Edit PDFs in Firefox: what a browser's own editor can do",
      url: "https://www.firefox.com/features/pdf-editor/",
    },
    {
      title: "Liberation Fonts, the open fonts the editor embeds",
      url: "https://github.com/liberationfonts/liberation-fonts",
    },
    {
      title:
        "Sanitization of documents: why a box drawn over text does not remove it, Wikipedia",
      url: "https://en.wikipedia.org/wiki/Sanitization_(classified_information)",
    },
  ],
}

export const annotatePost: BlogPost = {
  slug: "annotate-pdfs-without-uploading",
  title: "Mark it up, and keep it to yourself.",
  searchTitle: "How to annotate a PDF online for free without uploading it",
  description:
    "How to highlight, underline and strike out text in a PDF, add notes and reply to comments in your browser, and download real comments or a clean final copy. Free, nothing uploaded.",
  keywords: [
    "annotate PDF",
    "highlight PDF",
    "PDF annotator",
    "add comments to PDF",
    "underline PDF",
    "strikethrough PDF",
    "sticky notes PDF",
    "review PDF online free",
    "no upload",
  ],
  category: "A little know-how",
  readingTime: "4 min read",
  image: "/images/pdf-annotate-guide.svg",
  imageAlt:
    "A page of a PDF with a sentence highlighted, a word struck out and a note, beside a list of comments with a reply",
  tool: "pdf-annotator",
  intro:
    "A draft arrives and someone wants your thoughts by Friday. A contract needs a second pair of eyes. A paper needs reading with a pen in hand. Marking up a PDF is the oldest job there is to do with one, and the files it is done to are rarely ones to hand to a stranger's server. Here is how to do it with the KeepSimp PDF annotator, on your own device.",
  sections: [
    {
      id: "marks",
      title: "Marks that lie on the words.",
      paragraphs: [
        "Take the highlighter and drag across the words, as if you were selecting them. The mark follows the text line by line, from the word you started on to the word you ended on. Press a single word to mark just that word. Underline, strike out and squiggle work the same way, and each remembers its colour.",
        "Because the mark is tied to the words and not painted on top, it stays sharp at any zoom and prints cleanly. The list of comments shows the words each mark lies on, so a long document can be skimmed by its highlights alone.",
      ],
      links: [
        { label: "Open the PDF annotator", href: "/dashboard/pdf-annotator/" },
      ],
    },
    {
      id: "scans",
      title: "When the page is a scan.",
      paragraphs: [
        "A scanned page is a photograph of paper. There are no words in it to take hold of, which is why highlighting fails in so many tools without saying why. Here the bar tells you, and offers the highlighter pen instead: a wide, see-through stroke you draw by hand, over a line, a figure or a signature. It works with a mouse, a pen or a finger.",
      ],
    },
    {
      id: "notes",
      title: "Notes, and the talk under them.",
      paragraphs: [
        "A note is a small icon on the page with your words behind it. Press where it belongs and type. Drag the icon if it covers something.",
        "Files that have been round a team already carry comments. They are all listed, page by page, with who wrote them and when, as far as the file says. You can answer any of them, and your reply is kept under the comment it answers. Type your name once at the top of the list and your comments are signed with it; leave it empty and they are not.",
      ],
    },
    {
      id: "real-comments",
      title: "Real comments, not a drawing of them.",
      paragraphs: [
        "Some tools turn your marks into part of the page the moment you save, or worse, turn the whole page into a picture. The next reader then cannot hide your highlights, answer your notes, or remove them from the final copy.",
        "The annotator writes the PDF's own kinds of comment, the same ones Acrobat and Preview write. Another program shows them as comments, and one with a comments list puts them in it. The text of the file is not touched, so it can still be selected and searched.",
      ],
    },
    {
      id: "final-copy",
      title: "A final copy, your way.",
      paragraphs: [
        "When you download, you choose what becomes of the comments. Keep them as comments while the document is still being discussed. Make them part of the page for a copy where the marks must stay, such as an exhibit; a note then keeps its icon, and its words are no longer shown. Or leave them out, and send a clean copy without the discussion in it, the file's earlier comments included.",
        "Before the file is handed to you it is checked: the comments are counted in the result, and pages you did not touch are compared with the original.",
      ],
      links: [
        {
          label: "Add text, pictures and shapes too: the PDF editor",
          href: "/dashboard/pdf-editor/",
        },
        {
          label: "Send only some pages: the PDF splitter",
          href: "/dashboard/pdf-splitter/",
        },
      ],
    },
    {
      id: "private",
      title: "Your documents stay with you.",
      paragraphs: [
        "Drafts, contracts and reviews are opened and marked on your own device and are never uploaded. There is no account, no watermark and no limit on files or pages, and once the page has loaded it works without a connection.",
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
      title: "Annotate a PDF in Preview on Mac, Apple Support",
      url: "https://support.apple.com/guide/preview/annotate-a-pdf-prvw11580/mac",
    },
    {
      title: "PDF: annotations as part of the file format, Wikipedia",
      url: "https://en.wikipedia.org/wiki/PDF#Annotation",
    },
    {
      title: "Edit PDFs in Firefox: what a browser's own editor can do",
      url: "https://www.firefox.com/features/pdf-editor/",
    },
  ],
}

export const signPost: BlogPost = {
  slug: "sign-pdfs-without-uploading",
  title: "Sign it, and keep it to yourself.",
  searchTitle: "How to sign a PDF online for free without uploading it",
  description:
    "How to sign a PDF in your browser: draw, type or photograph your signature, place it, fill in the blanks and the date, and download. Free, with no account and nothing uploaded.",
  keywords: [
    "sign PDF",
    "sign PDF online free",
    "add signature to PDF",
    "electronic signature PDF",
    "draw signature",
    "fill and sign PDF",
    "signature from photo",
    "sign PDF without printing",
    "no upload",
  ],
  category: "A little know-how",
  readingTime: "4 min read",
  image: "/images/pdf-sign-guide.svg",
  imageAlt:
    "A form in a PDF with a typed name, two ticked boxes, a date and a handwritten signature on its line, beside a pad a signature is drawn on",
  tool: "sign-pdf",
  intro:
    "The form says print, sign, scan and return. You have no printer, and the scanner is a phone held over a kitchen table. There is a shorter way, and it does not need to pass your signature and your tenancy agreement through a website's servers on the way. Here is how to sign a PDF with KeepSimp, on your own device.",
  sections: [
    {
      id: "three-ways",
      title: "Three ways to make a signature.",
      paragraphs: [
        "Draw it. A pad opens with a line to sign on; use a mouse, a trackpad, a pen or a finger. It is kept as lines, not as a picture, so it stays sharp however large you make it.",
        "Type it. Write your name and choose one of four hands. This is the tidy option, and the only one that needs no steady hand.",
        "Photograph it. Sign a sheet of plain paper, take a picture, and choose the photo. The paper is taken out of the picture and only the ink is kept, so the signature sits on the form without a grey rectangle around it. A light, evenly lit background works best; if the ink cannot be told from the paper, you are told so.",
      ],
      links: [{ label: "Open Sign PDF", href: "/dashboard/sign-pdf/" }],
    },
    {
      id: "place",
      title: "Put it on the line.",
      paragraphs: [
        "The signature lands in the middle of the page you are reading. Drag it to where it belongs and pull a corner to size it. For a second place, a witness line or the next page, press Sign again.",
        "Initials work the same way and are kept apart from your signature, for contracts that want every page initialled.",
      ],
    },
    {
      id: "fill",
      title: "Fill in what the form asks.",
      paragraphs: [
        "Most things that need signing need a few more things as well. The text tool types into the blanks: click where the words go and type. The tick tool marks boxes with a tick, a cross or a dot, one press each. A button adds today's date.",
        "This works on any PDF, also one that is only a picture of a form. A form with real fields to tab through is filled in on the same page: click a field and type.",
      ],
    },
    {
      id: "what-kind",
      title: "What kind of signature is this?",
      paragraphs: [
        "It is the electronic equivalent of signing paper: your mark, placed on the page by you. For letters, consent forms, applications and most agreements between people, that is what is being asked for.",
        "It is not a certificate signature, the kind made with a digital certificate that proves who signed and that the file has not been changed since. Some filings and regulated contracts require that. If yours does, the editor can do that too: turn on “Sign with a certificate” when you download, choose your certificate file and type its password. It is read on your device and never kept. Whether a signature is enough for a particular document depends on the document and where you are, so ask whoever is receiving it when it matters.",
      ],
    },
    {
      id: "remember",
      title: "Remembered only if you ask.",
      paragraphs: [
        "By default nothing is kept: close the tab and your signature is gone with it. A switch in the signature window keeps it in this browser's own storage for next time, on this device only, and a button forgets it. It is off each time until you turn it on. Leave it off at a shared computer.",
      ],
    },
    {
      id: "private",
      title: "Your documents stay with you.",
      paragraphs: [
        "The file is opened and signed on your own device and is never uploaded; neither is your signature. There is no account, no watermark and no limit on how many documents you sign, and once the page has loaded it works without a connection.",
      ],
      links: [
        {
          label: "Add text, pictures and comments too: the PDF editor",
          href: "/dashboard/pdf-editor/",
        },
        {
          label: "Every KeepSimp tool in one place",
          href: "/blog/free-online-tools-no-upload/",
        },
      ],
    },
  ],
  sources: [
    {
      title: "Electronic signature: kinds and legal standing, Wikipedia",
      url: "https://en.wikipedia.org/wiki/Electronic_signature",
    },
    {
      title: "Fill out and sign PDF forms in Preview on Mac, Apple Support",
      url: "https://support.apple.com/guide/preview/fill-out-and-sign-pdf-forms-prvw35725/mac",
    },
    {
      title:
        "SIL Open Font License, under which the handwriting fonts are used",
      url: "https://openfontlicense.org/",
    },
  ],
}

export const formPost: BlogPost = {
  slug: "fill-pdf-forms-without-uploading",
  title: "Fill it in, and send only what you mean to.",
  searchTitle: "How to fill in a PDF form online for free without uploading it",
  description:
    "How to fill in a PDF form in your browser: type into its fields, tick boxes, choose from lists, sign and download, as a form or made final. Free, with no account and nothing uploaded.",
  keywords: [
    "fill PDF form",
    "fill in PDF form online free",
    "fillable PDF",
    "PDF form filler",
    "type on a PDF form",
    "flatten PDF form",
    "fill and sign PDF",
    "PDF form without Acrobat",
    "no upload",
  ],
  category: "A little know-how",
  readingTime: "4 min read",
  image: "/images/pdf-form-guide.svg",
  imageAlt:
    "A form in a PDF with a name typed into a field, an empty field framed in red, a round button chosen, a list with one line picked and a ticked box, beside a note that two fields are still empty",
  tool: "fill-pdf-form",
  intro:
    "An application, a tax form, a consent form from a school: it arrives as a PDF, and it asks for your name, your address, your date of birth and sometimes your bank. That is exactly the file you would rather not hand to a website you found a minute ago. Here is how to fill it in with KeepSimp, where the form never leaves your device.",
  sections: [
    {
      id: "two-kinds",
      title: "Two kinds of form, and how to tell.",
      paragraphs: [
        "Some PDF forms have real fields: boxes the file itself knows about, each with a name, that a program can type into. Others only look like forms. They are a picture of lines and boxes, made to be printed.",
        "Open the file and you will see which you have. Real fields are tinted, and a line above the page counts them. A form without fields says so, and is filled in like paper instead; more on that below.",
      ],
      links: [
        { label: "Open Fill PDF form", href: "/dashboard/fill-pdf-form/" },
      ],
    },
    {
      id: "fill",
      title: "Type, tick and choose.",
      paragraphs: [
        "Click a field and type. Tab goes to the next field, along each row and then down the page, so a long form can be filled in without touching the mouse. Tick boxes and round buttons are pressed. Drop-downs and lists are chosen from, and a list takes several choices where the form allows it.",
        "A field the form marks as a date opens your device's calendar and writes the day the way the form wants it. A field with a limit, such as six boxes for a postcode, takes no more than fits.",
        "Each field you fill in can be undone. What you see on the page is drawn from the file itself, so the page shows what the next person will see.",
      ],
    },
    {
      id: "missing",
      title: "See what is still missing.",
      paragraphs: [
        "Fields the form says must be filled in have a red frame until they are. The line above the page says how many are still empty, and a button takes you to the next one, on whichever page it is.",
        "Nothing stops you from downloading a form with gaps. Sometimes that is what you want: fill in your part, and send it on for someone else to finish.",
      ],
    },
    {
      id: "final",
      title: "Keep it a form, or make it final.",
      paragraphs: [
        "When you download, you choose. Keep as fields gives a form that can still be filled in and changed, here or in any other program. That is right for a form that goes on to someone else, or one you may need to correct.",
        "Part of the page draws what the fields hold into the page and takes the fields away. Nothing can be changed afterwards, and the form looks the same in every program. That is right for the copy you send in or keep for your records.",
        "Either way the result is read back before it is saved, and the check under the download button says what was found.",
      ],
    },
    {
      id: "paper",
      title: "Forms that are only a picture.",
      paragraphs: [
        "A form without fields is filled in like paper. The text tool types wherever you click. The tick tool places a tick, a cross or a dot in a box, one press each. A button adds today's date, and Sign places your signature: drawn, typed, or taken from a photo with the paper removed.",
      ],
      links: [
        {
          label: "Guide: sign a PDF without sending it anywhere",
          href: "/blog/sign-pdfs-without-uploading/",
        },
      ],
    },
    {
      id: "honest",
      title: "What it does not do.",
      paragraphs: [
        "A form can carry small programs that work out a total or tidy a phone number as you type. KeepSimp never runs anything a file brings with it, so those fields hold what you typed and a total stays as it was: fill it in yourself. The editor tells you when a form has such fields.",
        "A few forms, mostly from governments, are of a kind called XFA that only Adobe's programs can fill in. The editor says so when it meets one. A place for a certificate signature is left alone while you fill in the form; to sign into it with your own certificate, turn on “Sign with a certificate” when you download.",
      ],
    },
    {
      id: "private",
      title: "Your answers stay with you.",
      paragraphs: [
        "The form is opened and filled in on your own device and is never uploaded. There is no account, no watermark and no limit on how many forms you fill in, and once the page has loaded it works without a connection.",
      ],
      links: [
        {
          label: "Add text, pictures and comments too: the PDF editor",
          href: "/dashboard/pdf-editor/",
        },
        {
          label: "Every KeepSimp tool in one place",
          href: "/blog/free-online-tools-no-upload/",
        },
      ],
    },
  ],
  sources: [
    {
      title: "PDF: interactive forms (AcroForms and XFA), Wikipedia",
      url: "https://en.wikipedia.org/wiki/PDF",
    },
    {
      title: "XFA, the form kind that only some programs read, Wikipedia",
      url: "https://en.wikipedia.org/wiki/XFA",
    },
    {
      title: "Fill out and sign PDF forms in Preview on Mac, Apple Support",
      url: "https://support.apple.com/guide/preview/fill-out-and-sign-pdf-forms-prvw35725/mac",
    },
  ],
}

export const cropPost: BlogPost = {
  slug: "crop-pdfs-without-uploading",
  title: "Trim the page, and know what trimming means.",
  searchTitle: "How to crop a PDF online for free without uploading it",
  description:
    "How to crop a PDF in your browser: drag a frame or type the numbers, for one page or all, or make pages A4 or Letter size. And why a cropped page still holds what was cut off. Free, no upload.",
  keywords: [
    "crop PDF",
    "crop PDF online free",
    "trim PDF margins",
    "cut PDF page",
    "resize PDF pages",
    "PDF to A4",
    "PDF to Letter size",
    "crop box",
    "no upload",
  ],
  category: "A little know-how",
  readingTime: "4 min read",
  image: "/images/pdf-crop-guide.svg",
  imageAlt:
    "A page of a PDF with wide margins and a frame drawn round its text; outside the frame the page is shaded, and four numbers say how much is cut off each edge",
  tool: "crop-pdf",
  intro:
    "A scan with a black border. A paper with margins so wide that the text is small on a phone. A slide that was exported with half a page of nothing under it. Cropping fixes all three, and most tools that offer it want your file on their server first. Here is how to do it with KeepSimp, on your own device, and one thing about cropping that is worth knowing before you rely on it.",
  sections: [
    {
      id: "frame",
      title: "Drag a frame, or type the numbers.",
      paragraphs: [
        "Open the PDF and a frame lies over the first page. Drag an edge inwards and the part that will be hidden is shaded. If you would rather be exact, type how many points to cut off the left, the top, the right and the bottom; a point is a 72nd of an inch, so 72 is an inch and about 28 is a centimetre.",
        "The edges are also buttons. Tab goes from one to the next, the arrow keys move an edge a point at a time, or ten with Shift, and Enter crops. A whole file can be cropped without a mouse.",
      ],
      links: [{ label: "Open Crop PDF", href: "/dashboard/crop-pdf/" }],
    },
    {
      id: "pages",
      title: "One page, some pages, or all of them.",
      paragraphs: [
        "The same cut can go on this page, on all pages, or on the pages you choose in the list of pages. What is cut off is counted from each page's own edges as you see it, so one cut fits pages of different sizes, and pages that the file shows turned.",
        "Press another page and the frame moves there. Undo takes a crop back, and Show whole shows a page's whole sheet again, also one that came cropped from somewhere else.",
      ],
    },
    {
      id: "hides",
      title: "Cropping hides. It does not remove.",
      paragraphs: [
        "A page of a PDF has a sheet and, on it, the part that is shown. Cropping makes that part smaller, and that is all it does, here and in every other program. The words and pictures outside the frame are still in the file. Anyone can show the whole sheet again, and a search still finds the words.",
        "That is what you want when you are tidying margins. It is not what you want when the thing outside the frame is a name, an account number or a signature. For that, the content has to be taken out of the file, not hidden. The editor says this while you crop, and again when you download.",
      ],
    },
    {
      id: "size",
      title: "Make every page one size.",
      paragraphs: [
        "A file put together from several places often has pages of several sizes, and a printer does something different with each. Resize makes pages the size of an A4 or a Letter sheet. What is on a page is made smaller or larger to fit and put in the middle; nothing is stretched, and a page that lies on its side gets a sheet on its side.",
        "Links, notes and the fields of a form move and scale with their page, so a resized form can still be filled in.",
      ],
    },
    {
      id: "private",
      title: "Your file stays with you.",
      paragraphs: [
        "The file is opened and cropped on your own device and is never uploaded. There is no account, no watermark and no limit on pages, and once the page has loaded it works without a connection. Before the download, the result is read back and checked.",
      ],
      links: [
        {
          label: "Move, turn and take out pages too: the PDF editor",
          href: "/dashboard/pdf-editor/",
        },
        {
          label: "Every KeepSimp tool in one place",
          href: "/blog/free-online-tools-no-upload/",
        },
      ],
    },
  ],
  sources: [
    {
      title: "Paper size: A4 and Letter, Wikipedia",
      url: "https://en.wikipedia.org/wiki/Paper_size",
    },
    {
      title: "Crop PDF pages, Adobe Acrobat help",
      url: "https://helpx.adobe.com/acrobat/using/crop-pdf-pages.html",
    },
    {
      title: "PDF: the page and its boxes, Wikipedia",
      url: "https://en.wikipedia.org/wiki/PDF",
    },
  ],
}

export const numbersPost: BlogPost = {
  slug: "add-page-numbers-to-a-pdf",
  title: "Number the pages, where you want the numbers.",
  searchTitle: "How to add page numbers to a PDF online for free",
  description:
    "How to add page numbers to a PDF in your browser: choose how they are written and where, skip the cover, add a header, a footer or Bates numbers. Free, with no account and nothing uploaded.",
  keywords: [
    "add page numbers to PDF",
    "number PDF pages",
    "PDF page numbers online free",
    "PDF header and footer",
    "Bates numbering",
    "Bates stamp PDF",
    "page x of y",
    "paginate PDF",
    "no upload",
  ],
  category: "A little know-how",
  readingTime: "4 min read",
  image: "/images/pdf-numbers-guide.svg",
  imageAlt:
    "Three pages of a PDF in a row, each with its number at the foot, Page 1 of 3 to Page 3 of 3, beside a panel where the way a number is written and its place are chosen",
  tool: "add-page-numbers",
  intro:
    "A report goes to print and someone asks which page the table is on. A bundle of documents goes to a lawyer and every page needs a number nobody can argue about. A thesis must be numbered from the third page on. Each is a small job, and each can be done on your own device, without sending the file anywhere. Here is how.",
  sections: [
    {
      id: "numbers",
      title: "Page numbers, four ways.",
      paragraphs: [
        "Open the PDF and the panel for numbers is beside the pages. Choose how a number is written: 1, Page 1, 1 of 12, or Page 1 of 12. Choose where: at the top or the foot of the page, to the left, in the middle or to the right. Set the size and how far from the edge it stands, and press Add.",
        "The numbers are on the pages at once, drawn from the file itself, so what you see is what you will download.",
      ],
      links: [
        {
          label: "Open Add page numbers",
          href: "/dashboard/add-page-numbers/",
        },
      ],
    },
    {
      id: "skip",
      title: "Skip the cover, start where you like.",
      paragraphs: [
        "Leave Pages empty and every page is numbered. Type 2- and the first page is left out; the second page is then number 1, or whatever you set as the first number. Type 1-3, 7 to name pages, or odd or even to take every other one, as for a book whose numbers stand on the outer edge.",
        "To number front matter with one run and the rest with another, add twice: once for the first pages, once for the others.",
      ],
    },
    {
      id: "header",
      title: "A header or a footer of your own.",
      paragraphs: [
        "Header or footer writes a line of your own on every page: a title, a case name, the word Confidential. Four things in braces stand for something else. {page} is the page's number, {pages} is how many there are, {date} is today's date and {name} is the file's name. So “{name}, page {page} of {pages}” writes itself differently on each page.",
      ],
    },
    {
      id: "bates",
      title: "Bates numbers.",
      paragraphs: [
        "Lawyers number every page of every document in a case with one run of numbers, so that a page can be named without doubt: ACME-000120, ACME-000121. The numbers have a fixed count of figures and usually a few letters in front.",
        "Bates numbers does this. Type what stands before and after the number, how many figures it has, and the number to start at. To carry on from one file to the next, start the second file where the first one stopped.",
      ],
    },
    {
      id: "things",
      title: "Each number can still be changed.",
      paragraphs: [
        "Every number is a piece of text on its page. With the select tool you can move one that sits on top of something, restyle it, retype it or delete it. One undo takes the whole lot away.",
        "The text is real text in a font that travels inside the file, so it looks the same everywhere, can be searched, and is read back from the result before your browser saves it.",
        "One thing to do in the right order: numbers are written as the pages lie when you press Add. If pages are to be moved, added or taken out, do that first.",
      ],
    },
    {
      id: "private",
      title: "Your file stays with you.",
      paragraphs: [
        "The file is opened and numbered on your own device and is never uploaded. There is no account, no watermark and no limit on pages, and once the page has loaded it works without a connection.",
      ],
      links: [
        {
          label: "Put the pages in order first: the PDF editor",
          href: "/dashboard/pdf-editor/",
        },
        {
          label: "Every KeepSimp tool in one place",
          href: "/blog/free-online-tools-no-upload/",
        },
      ],
    },
  ],
  sources: [
    {
      title: "Bates numbering, Wikipedia",
      url: "https://en.wikipedia.org/wiki/Bates_numbering",
    },
    {
      title: "Page numbering, Wikipedia",
      url: "https://en.wikipedia.org/wiki/Page_numbering",
    },
    {
      title:
        "Add headers, footers and Bates numbering to PDFs, Adobe Acrobat help",
      url: "https://helpx.adobe.com/acrobat/using/add-headers-footers-pdfs.html",
    },
  ],
}

export const watermarkPost: BlogPost = {
  slug: "watermark-a-pdf-without-uploading",
  title: "Mark it as a draft, without sending it anywhere.",
  searchTitle: "How to add a watermark to a PDF online for free",
  description:
    "How to add a watermark to a PDF in your browser: DRAFT, Confidential or a logo, as faint and as large as you like, on all pages or some. And what a watermark does not do. Free, no upload.",
  keywords: [
    "watermark PDF",
    "add watermark to PDF",
    "PDF watermark online free",
    "draft watermark",
    "confidential stamp PDF",
    "logo on PDF",
    "text watermark",
    "image watermark",
    "no upload",
  ],
  category: "A little know-how",
  readingTime: "3 min read",
  image: "/images/pdf-watermark-guide.svg",
  imageAlt:
    "A page of a PDF with the word DRAFT written faintly across it from corner to corner, beside a panel with the words of the watermark and two sliders, for how solid and how large it is",
  tool: "watermark-pdf",
  intro:
    "A contract goes out for comments and must not be taken for the final one. A price list goes to one customer and should say whose copy it is. A photographer's proofs need a name across them. A watermark does all of that, and the files that need one are exactly the files you would rather not upload to a website to get it. Here is how to add one on your own device.",
  sections: [
    {
      id: "words",
      title: "Words across the page.",
      paragraphs: [
        "Open the PDF and the panel for watermarks is beside the pages. Type the words: DRAFT, Confidential, Copy for Ada Lovelace. They are laid over the middle of each page, from the lower left corner to the upper right, as large as the share of the page you set.",
        "Two sliders do most of the work. How solid makes it faint enough to read through, or strong enough that it cannot be missed. How large takes it from a small mark to the whole width of the page. It can be grey, red, blue or black, and level instead of slanted.",
      ],
      links: [
        { label: "Open Watermark PDF", href: "/dashboard/watermark-pdf/" },
      ],
    },
    {
      id: "picture",
      title: "Or a picture.",
      paragraphs: [
        "Use a picture instead and choose a logo: PNG, JPEG, WebP or AVIF. See-through parts of a PNG stay see-through. The picture is put into the file once, however many pages show it, so a logo on three hundred pages does not make the file three hundred logos larger.",
      ],
    },
    {
      id: "pages",
      title: "All pages, or the ones you name.",
      paragraphs: [
        "Leave Pages empty for every page, or type the pages: 2- leaves a cover alone, 1-3, 7 names them, odd and even take every other page. Press Add, and the watermark is on the pages at once. One undo takes it off all of them.",
        "On each page the watermark is a thing of its own. If it covers a signature on page four, select it there and move it, make it smaller or delete it; the other pages are not touched.",
      ],
    },
    {
      id: "honest",
      title: "What a watermark does not do.",
      paragraphs: [
        "A watermark tells whoever reads the page something. It does not lock anything. The text under it can still be selected and copied, and a program that edits PDFs can take a watermark off again. The page under it is not changed.",
        "If the point is that a file must not be opened, lock it with a password: the download options do that. If the point is that something must not be read at all, a watermark over it is the wrong tool, and so is a box drawn over it.",
      ],
    },
    {
      id: "private",
      title: "Your file stays with you.",
      paragraphs: [
        "The file is opened and marked on your own device and is never uploaded. There is no account, no limit on pages, and no watermark of ours on the result: only yours. Once the page has loaded it works without a connection, and the result is read back and checked before your browser saves it.",
      ],
      links: [
        {
          label: "Number the pages as well: Add page numbers",
          href: "/dashboard/add-page-numbers/",
        },
        {
          label: "Every KeepSimp tool in one place",
          href: "/blog/free-online-tools-no-upload/",
        },
      ],
    },
  ],
  sources: [
    {
      title: "Watermark, Wikipedia",
      url: "https://en.wikipedia.org/wiki/Watermark",
    },
    {
      title: "Add watermarks to PDFs, Adobe Acrobat help",
      url: "https://helpx.adobe.com/acrobat/using/add-watermarks-pdfs.html",
    },
    {
      title: "PDF: security and what a password protects, Wikipedia",
      url: "https://en.wikipedia.org/wiki/PDF",
    },
  ],
}

export const redactPost: BlogPost = {
  slug: "redact-a-pdf-without-uploading",
  title: "A black box is not a redaction.",
  searchTitle:
    "How to redact a PDF online for free, so the text is really gone",
  description:
    "How to redact a PDF in your browser so that names, numbers and pictures are removed from the file, not covered. Why a black box fails, how to check, and what else a file gives away.",
  keywords: [
    "redact PDF",
    "redact PDF online free",
    "black out text in PDF",
    "remove sensitive information from PDF",
    "permanently remove text from PDF",
    "PDF redaction tool",
    "redact scanned PDF",
    "remove PDF metadata",
    "no upload",
  ],
  category: "A little know-how",
  readingTime: "4 min read",
  image: "/images/pdf-redact-guide.svg",
  imageAlt:
    "A page of a PDF with three of its lines replaced by black boxes and a fourth framed in red, waiting to be applied, beside a panel that says three places were emptied and one mark is not applied yet",
  tool: "redact-pdf",
  intro:
    "Court papers, government reports and company filings have all gone out with black boxes over the names, and with the names still underneath: select the page, copy, paste, and there they are. The box was drawn on top of the words and the words were never taken out. A file that needs redacting is also the last file you want to send to a website to have it done. Here is how to do it properly on your own device.",
  sections: [
    {
      id: "why",
      title: "Why a black box fails.",
      paragraphs: [
        "A PDF page is a list of instructions: write these letters here, draw this picture there. A black rectangle is one more instruction at the end of the list. It hides what is under it on the screen and on paper, and it leaves every earlier instruction in the file. Anyone can select through it, search for it, or open the file in a program that shows the list.",
        "The same goes for a highlighter set to black, for white text on white, and for a picture cropped to a part: the rest of the picture is still stored. Redacting means changing the list itself, so that the letters, the pixels and the lines are no longer in it.",
      ],
    },
    {
      id: "mark",
      title: "Mark first.",
      paragraphs: [
        "Open the PDF and drag over what has to go. Area marks the box you draw, which is what a picture, a signature or a scanned page needs. Words marks the words between the two ends of the drag, like selecting text. Each mark is a red frame, and nothing is taken out yet.",
        "For a name that is written forty times, type it and press Mark all: every place on every page is marked in one step. There are buttons for e-mail addresses, phone numbers and card numbers, and a card number is only marked when its check figure is right. With Shape on, ###-##-#### marks every number written that way: # stands for a figure and @ for a letter.",
        "Then look the pages over. Press a mark to take it away again. A search finds what is written as text within a line; it cannot read a scan, and it does not join what a line break parts, so the looking over is not a formality.",
      ],
      links: [{ label: "Open Redact PDF", href: "/dashboard/redact-pdf/" }],
    },
    {
      id: "apply",
      title: "Then apply.",
      paragraphs: [
        "Press Apply and what is under each mark leaves the file. The letters are removed from the page's instructions; the others on the line stay where they were. Where a mark lies over a picture, those pixels are blanked in the picture itself, so the picture cannot be pulled out of the file whole. Drawings under a mark are deleted. A link, a note or a form field under a mark goes with it, because what they say is in the file too. This also reaches words nobody sees: the hidden text under a scan that has been through OCR, and text on a layer that is switched off.",
        "A black box is then drawn where each thing was, so a reader can see that something was taken out. Until you download, Undo brings everything back.",
      ],
    },
    {
      id: "check",
      title: "It looks again, and tells you.",
      paragraphs: [
        "After applying, the page is read back: if a letter can still be read under a mark, the change is refused. Each place is also looked at as a picture before its box is drawn. If something is still drawn there, it is a drawing that reaches beyond the mark, a long line or a table border, and the page says so. Whole drawings takes such a drawing out whole.",
        "The download says how many places were emptied, and it warns you when a mark was left unapplied, because what is under that mark is still in the file. You can check for yourself too: open the result, select all, copy, and paste it somewhere. What you took out should not be there.",
      ],
    },
    {
      id: "besides",
      title: "What else a file gives away.",
      paragraphs: [
        "The pages are not all of a PDF. It carries a title and an author, the name of the program that made it and when, sometimes attached files, sometimes scripts. The download options leave these out when you ask. Bookmarks can name what you removed from the page they lead to; the Details panel is where they are renamed or deleted. Comments can be left out of the download as well.",
        "Two things this cannot do. It cannot know what a picture shows, so a face or a signature has to be marked by hand. And it cannot take anything out of a signed file and keep the signature valid: a signature covers the file as it was, so the file is written anew and the signature no longer holds.",
      ],
    },
    {
      id: "private",
      title: "Your file stays with you.",
      paragraphs: [
        "The file is opened and changed on your own device and is never uploaded: not the original, not the marks, not the result. There is no account and no limit on pages, and once the page has loaded it works without a connection.",
      ],
      links: [
        {
          label: "Lock a file with a password: the PDF editor",
          href: "/dashboard/pdf-editor/",
        },
        {
          label: "Every KeepSimp tool in one place",
          href: "/blog/free-online-tools-no-upload/",
        },
      ],
    },
  ],
  sources: [
    {
      title: "Sanitization (classified information), Wikipedia",
      url: "https://en.wikipedia.org/wiki/Sanitization_(classified_information)",
    },
    {
      title: "Removing sensitive content from PDFs, Adobe Acrobat help",
      url: "https://helpx.adobe.com/acrobat/using/removing-sensitive-content-pdfs.html",
    },
    {
      title: "Luhn algorithm, the check figure of a card number, Wikipedia",
      url: "https://en.wikipedia.org/wiki/Luhn_algorithm",
    },
  ],
}

export const ocrPost: BlogPost = {
  slug: "make-a-scanned-pdf-searchable",
  title: "A scan you can search.",
  searchTitle: "How to OCR a PDF online for free and make a scan searchable",
  description:
    "How to make a scanned PDF searchable in your browser: its words are recognised on your device and laid unseen over the pages, which look the same. What OCR misreads, and how to check.",
  keywords: [
    "OCR PDF",
    "OCR PDF online free",
    "make scanned PDF searchable",
    "searchable PDF",
    "scanned PDF to text",
    "copy text from scanned PDF",
    "PDF text recognition",
    "OCR without upload",
    "OCR Arabic Chinese Japanese PDF",
  ],
  category: "A little know-how",
  readingTime: "4 min read",
  image: "/images/pdf-ocr-guide.svg",
  imageAlt:
    "A scanned page with the word invoice found by a search on two of its lines, beside a panel that says 1,204 words were recognised on 3 pages, 94% sure on average",
  tool: "ocr-pdf",
  intro:
    "A scanner hands over pictures of pages. They look like text, but a search finds nothing, a word cannot be selected or copied, and a screen reader has nothing to read. OCR, optical character recognition, reads the words in the picture and puts them in the file. Here is how to do it on your own device, without sending a contract or a bank statement to someone else's server.",
  sections: [
    {
      id: "what",
      title: "What OCR adds to a file.",
      paragraphs: [
        "Each page is drawn as a picture and read by Tesseract, an open-source recogniser that runs here in your browser. It finds the lines, the words in them and where each word stands. Those words are then written into the page in a font that draws nothing, each one stretched to the width it has in the picture.",
        "So the page looks exactly as it did, pixel for pixel, and under the picture lies text in the right places. Search finds a word and shows it where you see it; dragging across a line selects it; copying gives you the words. Any PDF reader can do this with the result, not only this one.",
      ],
    },
    {
      id: "how",
      title: "How to do it.",
      paragraphs: [
        "Open the scanned PDF in OCR PDF. Leave Pages empty to read them all, or type the ones you want, such as 1-3 or odd. Choose the language the pages are written in, and press Recognise text. Each page takes a few seconds, longer on a phone, and Stop keeps what has been read so far. The first time, the recogniser (about 1 MB) and the language (a few megabytes) are loaded from this site; they are then kept, so they work offline afterwards.",
        "A page that already has text is left as it is: it was read before, or it was never a scan. The panel names such pages, and a switch reads them anyway. When the run is done, the panel says how many words were found and how sure the recogniser was of them on average. One undo takes all of them away.",
      ],
      links: [{ label: "Open OCR PDF", href: "/dashboard/ocr-pdf/" }],
    },
    {
      id: "misreads",
      title: "What it gets wrong.",
      paragraphs: [
        "Clean, straight scans of printed pages read well. Faint photocopies, small print, handwriting, and photographs of a page taken at an angle read worse: a 1 can come out as an l, a name can lose a letter. The recogniser says how sure it is of every word, and the panel counts the words it was unsure of. Search for the names and numbers that matter before you rely on them.",
        "Choose the language the pages are written in: 31 are offered, from Arabic, Chinese and Hindi to Russian, Thai and most languages of Europe, and the one your browser says you read comes first. A page read in the wrong language comes out as poor text, so pick the right one; a second language helps pages that mix two. Arabic and Hebrew are written right to left and Chinese, Japanese and Thai without spaces, as they should be, so a search for a phrase finds it.",
      ],
    },
    {
      id: "check",
      title: "Checked before you download.",
      paragraphs: [
        "When you download, the words that were laid are read back out of the written file, and the check says whether every one was found. Pages you did not read are compared with the original, so nothing else changed. Open the result in any PDF reader and search it: the words are there.",
      ],
    },
    {
      id: "redact",
      title: "Then redact by search.",
      paragraphs: [
        "A scan's words cannot be found by a search, so redacting a scan used to mean dragging boxes over everything by hand. Once its words are recognised, Mark all and the buttons for e-mail addresses, phone numbers and card numbers find them in the scan too. Applying the marks takes the recognised words out and blanks the pixels of the picture under each mark. A misread word is a word the search misses, so look the pages over as well.",
      ],
      links: [
        { label: "Open Redact PDF", href: "/dashboard/redact-pdf/" },
        {
          label: "Guide: redact a PDF so that it stays redacted",
          href: "/blog/redact-a-pdf-without-uploading/",
        },
      ],
    },
    {
      id: "private",
      title: "Your file stays with you.",
      paragraphs: [
        "The file is opened, read and changed on your own device and is never uploaded: not the pages, not the words found in them. There is no account and no limit on pages.",
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
      title: "Optical character recognition, Wikipedia",
      url: "https://en.wikipedia.org/wiki/Optical_character_recognition",
    },
    {
      title: "Tesseract, the open-source OCR engine",
      url: "https://github.com/tesseract-ocr/tesseract",
    },
    {
      title: "Tesseract.js, Tesseract in the browser",
      url: "https://github.com/naptha/tesseract.js",
    },
  ],
}

export const verifyPost: BlogPost = {
  published: "2026-10-14",
  modified: "2026-10-14",
  slug: "verify-a-pdf-signature",
  title: "Is the signature still good?",
  searchTitle: "How to verify a digital signature in a PDF online for free",
  description:
    "Check the digital signatures in a PDF in your browser: whether each still holds, whose certificate made it, and what was added to the file after it was signed. Nothing is uploaded.",
  keywords: [
    "verify PDF signature",
    "check PDF digital signature",
    "validate PDF signature online",
    "PDF signature valid",
    "has this PDF been changed",
    "PDF tampered",
    "who signed this PDF",
  ],
  category: "A little know-how",
  readingTime: "4 min read",
  image: "/images/pdf-verify-guide.svg",
  imageAlt:
    "A signed contract beside a panel that says the signature holds over the file as it was signed, names the certificate it was made with, and says a field was filled in after it",
  tool: "verify-pdf-signature",
  intro:
    "A PDF can carry a digital signature: a seal made with a certificate over the bytes of the file. It answers two questions, whether the file is still what was signed and whose certificate signed it, but only if something checks it. Here is how to check one on your own device, and how to read the answer.",
  sections: [
    {
      id: "what",
      title: "What a signature proves, and what it does not.",
      paragraphs: [
        "When a file is signed, a fingerprint of its bytes is sealed with the signer's private key. Checking it means working out the fingerprint again and opening the seal with the certificate that travels with it. If even one byte that was signed has changed since, the two no longer agree, and the signature does not hold.",
        "What it cannot tell you by itself is whether the name on the certificate is true. Anybody can make a certificate in any name. A certificate is believed because someone you trust issued it: a company's own authority, or one of the issuers Adobe's programs list. KeepSimp shows who issued it, and says plainly when a certificate signed itself, but it keeps no list of whom to trust. That judgement is yours.",
      ],
    },
    {
      id: "how",
      title: "How to check one.",
      paragraphs: [
        "Open the PDF in Verify a PDF signature. A list of its signatures opens beside the pages. For each one it says whether it holds, whose certificate made it and who issued that, the time it gives, and the reason and place if it gives them. A signature that shows on a page has a button that goes to it. A locked file asks for its password first.",
        "Signatures of the kinds adbe.pkcs7.detached, ETSI.CAdES.detached and adbe.pkcs7.sha1 are checked, which covers what Acrobat, most other programs and KeepSimp make. Older kinds and document time stamps are listed, with a note that they were not checked.",
      ],
      links: [
        {
          label: "Open Verify a PDF signature",
          href: "/dashboard/verify-pdf-signature/",
        },
      ],
    },
    {
      id: "after",
      title: "Changed after it was signed.",
      paragraphs: [
        "A signed file can be added to without breaking its signature. The additions are written after it, as a second version of the file, and the signature still covers the first. That is how a form is signed by one person and filled in or signed by the next. It is also how a page could be made to look different after signing while the signature still holds over the version that was signed.",
        "So the list also says what was added after each signature. It opens the file as it was signed beside the file as it is and compares them: fields filled in or changed, by name; comments added or taken away; pages added or taken out; pages that now look different; signatures added later. A signature that covers the whole file says that nothing has changed since.",
      ],
    },
    {
      id: "time",
      title: "The time it gives.",
      paragraphs: [
        "The time a signature shows comes from the clock of the device that made it. Unless an independent time-stamping authority sealed that time too, it is the signer's word. The list says when a certificate was not valid at the time the signature gives, but that time is not proved either way.",
      ],
    },
    {
      id: "sign",
      title: "Sign one yourself.",
      paragraphs: [
        "The same page is the PDF editor. You can fill in a form, add a comment or sign with your own certificate (a .p12 or .pfx file), and download with Keep it valid on: your changes are written after the signatures that are there, and they still hold over what they signed.",
      ],
      links: [
        {
          label: "Guide: sign a PDF",
          href: "/blog/sign-pdfs-without-uploading/",
        },
      ],
    },
    {
      id: "private",
      title: "Your file stays with you.",
      paragraphs: [
        "The file is opened and its signatures checked on your own device. Nothing is uploaded, and no one is asked over the network about the certificate. There is no account and no limit.",
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
      title: "Validate digital signatures in Acrobat, Adobe",
      url: "https://helpx.adobe.com/acrobat/desktop/e-sign-documents/manage-digital-signatures/validate-digital-sign.html",
    },
    {
      title: "Digital signature, Wikipedia",
      url: "https://en.wikipedia.org/wiki/Digital_signature",
    },
    {
      title: "ETSI EN 319 142-1: PAdES, signatures in PDF",
      url: "https://www.etsi.org/deliver/etsi_en/319100_319199/31914201/01.01.01_60/en_31914201v010101p.pdf",
    },
  ],
}

export const createFormPost: BlogPost = {
  sources: [
    {
      title: "PDF forms and their field types, pdf-lib",
      url: "https://pdf-lib.js.org/docs/api/classes/pdfform",
    },
    {
      title: "Acrobat JavaScript API reference",
      url: "https://opensource.adobe.com/dc-acrobat-sdk-docs/library/jsapiref/JS_API_AcroJS.html",
    },
  ],
  published: "2026-10-14",
  modified: "2026-10-14",
  slug: "create-a-fillable-pdf-form",
  title: "Make a form people can fill in.",
  searchTitle: "How to create a fillable PDF form online for free",
  description:
    "Turn a PDF into a form with text fields, checkboxes, radio groups, lists and dates. Move, resize and name its fields on your device, without uploading the file.",
  keywords: [
    "create fillable PDF",
    "PDF form creator",
    "add PDF form fields",
    "PDF checkbox",
    "fillable PDF online free",
    "make PDF form",
  ],
  category: "A little know-how",
  readingTime: "3 min read",
  image: "/images/pdf-create-form-guide.svg",
  imageAlt:
    "A PDF with a name field, a checkbox and two radio choices beside field settings",
  tool: "create-pdf-form",
  intro:
    "A blank line is room to write on paper. A field is room someone can fill in on a computer. KeepSimp adds those fields to the PDF itself, so the form can be filled here or in another PDF reader. The file stays on your device.",
  sections: [
    {
      id: "make",
      title: "Start with the page you have.",
      paragraphs: [
        "Open Create a fillable PDF form and choose your PDF. Pick a field type and press Add field. Text and multiline text take words; checkboxes take ticks; a radio group lets someone choose one option. Dropdowns and lists keep choices together. A date uses yyyy-mm-dd. A signature place is an empty place, and proves nothing about who signed.",
      ],
      links: [
        {
          label: "Create a fillable PDF form",
          href: "/dashboard/create-pdf-form/",
        },
      ],
    },
    {
      id: "place",
      title: "Give each field its place.",
      paragraphs: [
        "New fields begin in the part of the page you can see. Drag a frame to move it and pull a handle to resize. A keyboard works too: the arrows move one point, Shift moves ten, and Alt with an arrow resizes. Each move is a change you can undo.",
        "A radio group has one field name and several places. Its choices are placed in a column to start. You can move and resize each choice separately. Deleting one removes the whole group, so no half-group is left in the file.",
      ],
    },
    {
      id: "names",
      title: "A name for the file, a hint for the person.",
      paragraphs: [
        "Field names must be unique. Field settings offers one, which you can change. A new name has no dots: dots separate levels in an existing form's names. A tooltip is the label a person hears or sees while filling it. Required marks a field that ought to be filled; it does not prevent someone from downloading an unfinished form.",
        "A text field can have a character limit, with zero meaning unlimited. A dropdown or list needs choices, one per line. Radio groups need at least two. A list can allow several choices. Save field properties applies a selected field's name, tooltip, requirement and text limit together.",
      ],
    },
    {
      id: "fill",
      title: "Try your form before you share it.",
      paragraphs: [
        "Download with fields kept as fields. Open that PDF in Fill PDF form, enter a name, tick a checkbox, choose a radio option and use the lists. Download that filled copy too. The values and appearances are in the file, and the fields can still be filled again. Making fields part of the page on download takes that ability away.",
        "PDF viewers differ, so check your result in the programs the people receiving it use. This version creates ordinary AcroForm fields. It does not create XFA forms or calculations, and suggested fields are judged by the lines and boxes a page draws, so check each before you add it. Dates carry a fixed formatting action for external readers, which KeepSimp reads as text and never runs. An empty signature place is only a place: it can be signed into with a certificate at download, here or in another program.",
      ],
      links: [
        { label: "Fill PDF form", href: "/dashboard/fill-pdf-form/" },
        {
          label: "Sign PDF with a mark on the page",
          href: "/dashboard/sign-pdf/",
        },
      ],
    },
    {
      id: "local",
      title: "Keep the file where it belongs.",
      paragraphs: [
        "Your PDF is opened, changed and downloaded on your device. No account or upload is needed. A draft is saved in this browser only when you turn on Keep a draft on this device. Nothing is kept by default.",
      ],
      links: [{ label: "What stays on your device", href: "/privacy/" }],
    },
  ],
}
