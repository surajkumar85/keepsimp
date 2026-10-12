import type { BlogPost } from "./blog"

/** The post that goes through every tool on the site, with a link to each. */
export const overviewPost: BlogPost = {
  slug: "free-online-tools-no-upload",
  title: "Nine free tools that never ask for your files.",
  searchTitle:
    "Free online PDF, image and JSON tools that work without uploading",
  description:
    "Every KeepSimp tool in one place: edit, annotate, compress, merge and split PDFs, resize and convert images, convert GIFs, and format JSON. Free, no sign-up, your files stay with you.",
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
    "privacy",
  ],
  category: "Start here",
  readingTime: "5 min read",
  image: "/images/tools-overview.svg",
  imageAlt:
    "Nine tiles, one for each KeepSimp tool: four for PDFs, four for images and animations, and one for JSON",
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
        "The text you add is real text in a font that travels inside the file, so it looks the same everywhere and can be searched. Before the download, the result is read back and checked. Changing the words that are already in a file comes in a later version.",
        "It signs, too: draw your signature, type it or use a photo of it, and fill in the blanks, boxes and date of a form that has no fields.",
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
        "It also marks and comments: highlights, underlines, notes and replies, which have a guide of their own. It does not yet change the words that are already in a file or fill in form fields. Those are being built and will arrive as later versions of the same editor. We would rather say so here than let you find out halfway through a job.",
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
        "Take the text tool, click where the words should start, and type. The line you type sits where you clicked, so filling in a paper form is a matter of clicking each blank and typing. Choose a sans, a serif or a mono font, a size, bold or italic, a colour and an alignment. A box that is too wide or too narrow can be pulled by its side, and the lines break again to fit.",
        "The three fonts are as wide, letter for letter, as Arial, Times New Roman and Courier New, so your words sit the way they would in the document's own program. The font goes into the file, cut down to the letters you used. That is why your text looks the same on every device, and why it is real text that can be selected and found by a search, not a picture of text.",
      ],
    },
    {
      id: "pictures-and-shapes",
      title: "Pictures, shapes and a pen.",
      paragraphs: [
        "A picture lands in the middle of the page you are reading, and from there you drag it into place. PNG and JPEG files go into the PDF as they are, without being saved again, so nothing is lost; a PNG keeps its see-through parts. That makes a scan of your signature with a clear background a tidy way to sign a page. It is a picture of a signature, not a digital signature that proves who signed.",
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
        "This works on any PDF, also one that is only a picture of a form. Forms with real fields to tab through are coming to the same page.",
      ],
    },
    {
      id: "what-kind",
      title: "What kind of signature is this?",
      paragraphs: [
        "It is the electronic equivalent of signing paper: your mark, placed on the page by you. For letters, consent forms, applications and most agreements between people, that is what is being asked for.",
        "It is not a certificate signature, the kind made with a digital certificate that proves who signed and that the file has not been changed since. Some filings and regulated contracts require that. If yours does, this is not it; a later version of the editor will sign with certificates. Whether a signature is enough for a particular document depends on the document and where you are, so ask whoever is receiving it when it matters.",
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
