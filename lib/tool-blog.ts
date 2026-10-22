import type { BlogPost } from "./blog"

/** The post that goes through every tool on the site, with a link to each. */
export const overviewPost: BlogPost = {
  modified: "2026-10-15T00:00:00+05:30",
  slug: "free-online-tools-no-upload",
  title: "Eleven free tools that never ask for your files.",
  searchTitle: "Free PDF, image, audio, JSON and color tools without uploading",
  description:
    "Every KeepSimp tool: edit, compress, merge and split PDFs, resize and convert images, convert GIFs and audio, format JSON and pick colors. Free, no sign-up, your files stay with you.",
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
    "audio converter",
    "extract audio from video",
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
      id: "audio-editor",
      title:
        "Audio editor: sound cut, faded, as loud as it should be and in the format you need.",
      paragraphs: [
        "Trim to the millisecond on a waveform you can zoom, cut parts out, fade in and out, silence a part or change its volume, with every edit undoable and your file never changed. Convert many files at once between MP3, M4A (AAC), Opus, FLAC, WAV and iPhone ringtones, or take the sound out of a video, exactly as it is. Tags and cover art come along, MP3 and AAC files are as long as the sound with no gap at the start, and every file is opened again and listened to before you download it.",
      ],
      links: [
        {
          label: "Open the audio editor",
          href: "/dashboard/audio-editor/",
        },
        {
          label: "Guide: why a converted MP3 starts late, and how to avoid it",
          href: "/blog/gapless-mp3-and-aac/",
        },
        {
          label: "Audio to convert? Open it as the Audio converter",
          href: "/dashboard/audio-converter/",
        },
        {
          label: "Guide: convert audio without uploading it",
          href: "/blog/convert-audio-without-uploading/",
        },
        {
          label: "A video's sound? Open it as the Audio extractor",
          href: "/dashboard/audio-extractor/",
        },
        {
          label: "Guide: take the sound out of a video",
          href: "/blog/extract-audio-from-video/",
        },
        {
          label: "Only a part? Open it as the Audio trimmer",
          href: "/dashboard/audio-trimmer/",
        },
        {
          label: "Guide: trim audio without uploading it",
          href: "/blog/trim-audio-without-uploading/",
        },
        {
          label: "A ringtone? Open it as the Ringtone maker",
          href: "/dashboard/ringtone-maker/",
        },
        {
          label: "Guide: make an iPhone or Android ringtone",
          href: "/blog/make-a-ringtone/",
        },
        {
          label: "Files of different loudness? Open it as Normalize audio",
          href: "/dashboard/normalize-audio/",
        },
        {
          label: "Guide: normalize audio loudness",
          href: "/blog/normalize-audio-loudness/",
        },
        {
          label: "Too quiet? Open it as the Volume booster",
          href: "/dashboard/volume-booster/",
        },
        {
          label: "Guide: make audio louder without clipping",
          href: "/blog/make-audio-louder/",
        },
        {
          label: "A long recording? Open it as the Audio splitter",
          href: "/dashboard/split-audio/",
        },
        {
          label: "Guide: split audio into parts",
          href: "/blog/split-audio-into-parts/",
        },
        {
          label: "Several files? Open it as Join audio",
          href: "/dashboard/join-audio/",
        },
        {
          label: "Guide: join audio files into one",
          href: "/blog/join-audio-files/",
        },
        {
          label: "Faster or slower? Open it as Change audio speed",
          href: "/dashboard/change-audio-speed/",
        },
        {
          label: "Guide: change speed and pitch",
          href: "/blog/change-audio-speed-and-pitch/",
        },
        {
          label: "A noisy recording? Open it as Remove background noise",
          href: "/dashboard/remove-background-noise/",
        },
        {
          label: "Guide: remove background noise",
          href: "/blog/remove-background-noise-from-audio/",
        },
        {
          label: "Wrong title or no cover? Open it as Edit audio tags",
          href: "/dashboard/edit-audio-tags/",
        },
        {
          label: "Guide: edit audio tags and cover art",
          href: "/blog/edit-audio-tags-and-cover-art/",
        },
        {
          label: "Nothing recorded yet? Open it as the Voice recorder",
          href: "/dashboard/voice-recorder/",
        },
        {
          label: "Guide: record audio online",
          href: "/blog/record-audio-online/",
        },
        {
          label: "Need the words? Open it as Transcribe audio",
          href: "/dashboard/transcribe-audio/",
        },
        {
          label: "Guide: transcribe audio on your device",
          href: "/blog/transcribe-audio-on-your-device/",
        },
        {
          label: "Sharing where only video goes? Open it as Audio to video",
          href: "/dashboard/audio-to-video/",
        },
        {
          label: "Guide: turn audio into a video",
          href: "/blog/turn-audio-into-video/",
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
        "What it cannot tell you by itself is whether the name on the certificate is true. Anybody can make a certificate in any name. A certificate is believed because someone you trust issued it: a company's own authority, or one of the issuers Adobe's programs list. KeepSimp shows who issued it, and says plainly when a certificate signed itself. It keeps no list of whom to trust of its own: you add the certificates of the issuers you trust, such as your company's, and each signature says whether its certificate goes back to one of them, through certificates that each issued the next. Add only a certificate you got from someone you trust, never one taken from the file you are checking.",
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

export const audioConvertPost: BlogPost = {
  published: "2026-10-15",
  modified: "2026-10-15",
  slug: "convert-audio-without-uploading",
  title: "A new format, with nothing lost on the way.",
  searchTitle:
    "How to convert audio files online for free (MP3, M4A, FLAC, WAV)",
  description:
    "Convert audio between MP3, M4A, Opus, FLAC and WAV in your browser, many files at once, with tags and cover art. Which format and bitrate to choose. Nothing is uploaded.",
  keywords: [
    "audio converter",
    "convert audio online free",
    "WAV to MP3",
    "FLAC to MP3",
    "M4A to MP3",
    "MP3 to WAV",
    "AIFF to MP3",
    "convert to Opus",
    "audio converter no upload",
  ],
  category: "A little know-how",
  readingTime: "4 min read",
  image: "/images/audio-convert-guide.svg",
  imageAlt:
    "A list of three sound files, each converted to MP3 with a tick beside it, and a panel with the formats MP3, M4A, Opus, FLAC and WAV",
  tool: "audio-converter",
  intro:
    "A recording comes off a phone as M4A, an album was ripped to FLAC, a podcast host wants MP3, an editing program wants WAV. Converting is easy to do badly: most sites want the file uploaded, some cap you at a few a day, and many write MP3s with a moment of silence at the start. Here is how to do it on your own device, and how to choose.",
  sections: [
    {
      id: "which",
      title: "Which format to choose.",
      paragraphs: [
        "MP3 plays on everything, from car stereos to old phones: choose it when you do not know where the file will go. M4A (AAC) sounds as good as MP3 in a smaller file and plays on every phone and computer. Opus is the best for its size, voice above all, and plays in browsers, Android, VLC and recent Apple devices.",
        "FLAC and WAV keep every sample: nothing is thrown away. FLAC is about half the size of WAV and keeps tags; WAV is what editing programs and some hardware expect. Converting a lossy file (MP3, AAC) to FLAC or WAV makes it larger but not better: what was lost stays lost.",
      ],
    },
    {
      id: "how",
      title: "How to convert.",
      paragraphs: [
        "Open the Audio converter and drop your files: MP3, M4A, Opus, Ogg, FLAC, WAV, AIFF, or videos. Choose a format and a quality. Each file is converted as soon as it is read; listen to the original or the result, and download one file or all of them in a ZIP.",
        "Balanced is right for most music: 192 kbit/s for MP3, 160 for AAC, 96 for Opus. High keeps more for music you care about; Small is fine for speech. A file size limit makes the converter choose the highest bitrate that fits, and say which.",
      ],
      links: [
        {
          label: "Open the Audio converter",
          href: "/dashboard/audio-converter/",
        },
      ],
    },
    {
      id: "same",
      title: "When not to convert at all.",
      paragraphs: [
        "“Same as the file” keeps a file's own sound and only changes what holds it: an M4A's AAC stays AAC, an Opus file stays Opus. Nothing is decoded or encoded again, so nothing is lost, and it takes a moment. It is the best way to take the sound out of a video.",
      ],
      links: [
        {
          label: "Guide: take the sound out of a video",
          href: "/blog/extract-audio-from-video/",
        },
      ],
    },
    {
      id: "checked",
      title: "Checked before you download.",
      paragraphs: [
        "Every file the converter writes is opened again and decoded from beginning to end. Its length, sample rate and channels are held against what you asked, an MP3's size against its bitrate, and a result that came out silent is caught. MP3 and AAC files say in their headers how long the sound is, so they do not start with a gap.",
      ],
      links: [
        {
          label: "Guide: why a converted MP3 starts late",
          href: "/blog/gapless-mp3-and-aac/",
        },
      ],
    },
    {
      id: "private",
      title: "Your files stay with you.",
      paragraphs: [
        "Files are read and written in your browser and never uploaded. There is no account and no limit on how many you convert.",
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
      title: "Web audio codec guide, MDN",
      url: "https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Audio_codecs",
    },
    {
      title: "LAME MP3 encoder",
      url: "https://lame.sourceforge.io/",
    },
    {
      title: "Opus codec",
      url: "https://opus-codec.org/",
    },
  ],
}

export const audioExtractPost: BlogPost = {
  published: "2026-10-15",
  modified: "2026-10-15",
  slug: "extract-audio-from-video",
  title: "Keep the sound, leave the picture.",
  searchTitle: "How to extract audio from a video online for free (MP4 to MP3)",
  description:
    "Take the sound out of an MP4, MOV, WebM or MKV video in your browser, exactly as it is, or as MP3, M4A, FLAC or WAV. Nothing is uploaded.",
  keywords: [
    "extract audio from video",
    "MP4 to MP3",
    "video to audio",
    "MOV to MP3",
    "WebM to MP3",
    "get audio from video",
    "rip audio from video",
    "extract audio without upload",
  ],
  category: "A little know-how",
  readingTime: "3 min read",
  image: "/images/audio-extract-guide.svg",
  imageAlt:
    "A video frame with a waveform coming out of it, beside a panel that says the sound was taken out as it is, without being encoded again",
  tool: "audio-extractor",
  intro:
    "A lecture recorded on a phone, a song in a video, an interview you only need to hear. The sound is already inside the video file; taking it out should not cost quality, an upload or a sign-up.",
  sections: [
    {
      id: "as-it-is",
      title: "As it is: the best way.",
      paragraphs: [
        "A video's sound is stored in its own track, usually as AAC in an MP4 or MOV, or Opus in a WebM. The Audio extractor copies that track into a sound file of its own, an M4A for AAC or an Ogg for Opus, without decoding and encoding it again. Nothing is lost, the file is as small as it can be, and it is done in a moment.",
      ],
      links: [
        {
          label: "Open the Audio extractor",
          href: "/dashboard/audio-extractor/",
        },
      ],
    },
    {
      id: "mp3",
      title: "When you need MP3.",
      paragraphs: [
        "Some players and sites only take MP3. Choose MP3 and the sound is encoded again, at 192 kbit/s by default, which is plenty for speech and fine for music. FLAC or WAV are for editing programs: they are larger, and they cannot bring back what the video's own encoding left out.",
        "Some films carry sound that phones cannot play, such as AC-3 surround. It is written as AAC, mixed down to stereo, and the page says so.",
      ],
      links: [
        {
          label: "Guide: convert audio and choose a format",
          href: "/blog/convert-audio-without-uploading/",
        },
      ],
    },
    {
      id: "private",
      title: "Your video stays with you.",
      paragraphs: [
        "The video is read in your browser and never uploaded, however large it is. Many videos can be done at once, and the sound of each is opened again and listened to before you download it.",
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
      title: "Media container formats, MDN",
      url: "https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Containers",
    },
    {
      title: "Mediabunny, reading and writing media in the browser",
      url: "https://mediabunny.dev/",
    },
  ],
}

export const audioTrimPost: BlogPost = {
  published: "2026-10-15",
  modified: "2026-10-15",
  slug: "trim-audio-without-uploading",
  title: "Just the part you want, with no click at the cut.",
  searchTitle:
    "How to trim or cut an MP3 online for free, without uploading it",
  description:
    "Cut a song, a voice note or a podcast to the part you want, to the millisecond, with fades in and out, in your browser. Every edit can be undone. Nothing is uploaded.",
  keywords: [
    "trim audio",
    "cut MP3 online",
    "audio cutter",
    "MP3 cutter",
    "trim audio without upload",
    "fade in fade out",
    "cut part of a song",
    "remove part of audio",
  ],
  category: "A little know-how",
  readingTime: "4 min read",
  image: "/images/audio-trim-guide.svg",
  imageAlt:
    "A waveform with a part of it selected between two handles, and buttons to keep it, cut it out or fade it",
  tool: "audio-trimmer",
  intro:
    "A voice note with a minute of fumbling at the start, a song you only need the chorus of, an interview with a cough in the middle. Trimming should take seconds, without uploading the recording or being stopped after a few files a day.",
  sections: [
    {
      id: "how",
      title: "How to trim.",
      paragraphs: [
        "Open the Audio trimmer and drop the file. Drag across the waveform to choose a part, or type its start and end to the millisecond. Keep only this keeps the part and drops the rest; Cut out takes the part away and closes the gap. Play the selection, loop it, zoom in on the waveform to find the very place, then download.",
        "The trimmer works on MP3, M4A, Opus, Ogg, FLAC, WAV, AIFF and the sound of videos. It writes the result in the file's own format unless you choose another.",
      ],
      links: [
        { label: "Open the Audio trimmer", href: "/dashboard/audio-trimmer/" },
      ],
    },
    {
      id: "click",
      title: "Why a cut can click, and why ours does not.",
      paragraphs: [
        "Sound is a wave. Cut it at a moment when the wave is far from the middle and the two sides of the cut do not meet: you hear a click. Some editors move each cut to where the wave crosses the middle. This one fades the sound out and in over four thousandths of a second at every place it was cut, which is too short to hear as a fade and enough to take the click away.",
        "For a gentler start or end, choose a part and press Fade in or Fade out. Even fades at a steady rate, Smooth keeps more of the sound until late, and S-curve starts and ends softly.",
      ],
    },
    {
      id: "steps",
      title: "Every edit can be undone.",
      paragraphs: [
        "Your file is never changed. Each edit is kept as a step in a list, and the result is written from your file and the steps: undo, redo or start again at any time. Silence a part, or make a part louder or quieter, in the full Audio editor.",
        "MP3 and AAC store sound in blocks of about a fortieth of a second, so a trimmed file is encoded again to cut it exactly where you chose. FLAC and WAV keep every sample.",
      ],
      links: [
        { label: "Open the Audio editor", href: "/dashboard/audio-editor/" },
        {
          label: "Guide: why a converted MP3 starts late, and ours does not",
          href: "/blog/gapless-mp3-and-aac/",
        },
      ],
    },
    {
      id: "private",
      title: "Your recordings stay with you.",
      paragraphs: [
        "Files are read and written in your browser and never uploaded. Each written file is opened again and listened to, and its length held against the length of what you kept, before you download it.",
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
      title: "Fade (audio engineering), Wikipedia",
      url: "https://en.wikipedia.org/wiki/Fade_(audio_engineering)",
    },
    {
      title: "Zero crossing, Wikipedia",
      url: "https://en.wikipedia.org/wiki/Zero_crossing",
    },
  ],
}

export const ringtonePost: BlogPost = {
  published: "2026-10-15",
  modified: "2026-10-15",
  slug: "make-a-ringtone",
  title: "Your song, when the phone rings.",
  searchTitle:
    "How to make a ringtone for iPhone (M4R) or Android from any song, free",
  description:
    "Make an iPhone ringtone (M4R, up to 40 seconds) or an Android ringtone (MP3) from any song in your browser, faded at the end, and put it on your phone. Nothing is uploaded.",
  keywords: [
    "ringtone maker",
    "make iPhone ringtone",
    "MP3 to M4R",
    "custom ringtone",
    "Android ringtone",
    "iPhone alert tone",
    "M4R converter",
  ],
  category: "A little know-how",
  readingTime: "3 min read",
  image: "/images/audio-ringtone-guide.svg",
  imageAlt:
    "A phone ringing beside a waveform with forty seconds of it chosen, faded at its end, and a panel that says iPhone ringtone, M4R",
  tool: "ringtone-maker",
  intro:
    "A ringtone is a short piece of a song in the format a phone wants. An iPhone wants an M4R file of at most 40 seconds, or 30 for an alert tone; an Android phone takes an MP3. Here is how to make one from a song you have, on your own device.",
  sections: [
    {
      id: "how",
      title: "How to make one.",
      paragraphs: [
        "Open the Ringtone maker and drop a song. Choose the part you like by dragging across the waveform, or put the playhead where it should start. Choose iPhone ringtone, iPhone alert tone or Android ringtone and press Make the ringtone: the part is kept, cut to the longest the phone takes, faded in briefly at its start and out over two seconds at its end, and written as M4R or MP3.",
        "Listen to it, move the part or undo and try again, then download it.",
      ],
      links: [
        {
          label: "Open the Ringtone maker",
          href: "/dashboard/ringtone-maker/",
        },
      ],
    },
    {
      id: "iphone",
      title: "Putting it on an iPhone.",
      paragraphs: [
        "With a Mac, connect the iPhone, open it in Finder and drag the M4R file onto its window. With Windows, use iTunes or the Apple Devices app and drag the file onto the iPhone under Tones. The ringtone then appears in Settings, under Sounds & Haptics. An M4R is AAC sound in the MP4 format, with its own name so that the iPhone offers it as a tone.",
      ],
    },
    {
      id: "android",
      title: "Putting it on an Android phone.",
      paragraphs: [
        "Copy the MP3 to the phone, into its Ringtones folder, or open Settings, Sound, Ringtone and add it from there. The menus differ a little from one maker to another.",
      ],
    },
    {
      id: "private",
      title: "On your device.",
      paragraphs: [
        "The song is read and the ringtone written in your browser; nothing is uploaded and there is no account. Use songs you have the right to use.",
      ],
      links: [
        {
          label: "Guide: trim audio without uploading it",
          href: "/blog/trim-audio-without-uploading/",
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
      title: "Ringtone, Wikipedia",
      url: "https://en.wikipedia.org/wiki/Ringtone",
    },
    {
      title: "MP4 file format, Wikipedia",
      url: "https://en.wikipedia.org/wiki/MP4_file_format",
    },
  ],
}

export const normalizePost: BlogPost = {
  published: "2026-10-20",
  modified: "2026-10-20",
  slug: "normalize-audio-loudness",
  title: "Every file as loud as the next.",
  searchTitle: "How to normalize audio loudness to −14 LUFS online for free",
  description:
    "What LUFS and true peak are, which loudness to choose for Spotify, podcasts or broadcast, and how to normalize many audio files at once in your browser, without clipping. Nothing is uploaded.",
  keywords: [
    "normalize audio",
    "loudness normalization",
    "LUFS",
    "-14 LUFS",
    "podcast loudness -16 LUFS",
    "EBU R128",
    "true peak",
    "normalize mp3 volume",
  ],
  category: "A little know-how",
  readingTime: "5 min read",
  image: "/images/audio-normalize-guide.svg",
  imageAlt:
    "Three waveforms of different heights brought to the same loudness, with a meter that reads −14 LUFS and peaks under −1 dBTP",
  tool: "normalize-audio",
  intro:
    "Play a playlist of files from different places and the volume jumps from one to the next. Turning the quiet ones up by their highest peak does not help: how loud a sound seems depends on all of it, not on its loudest moment. Loudness normalization measures what people hear and brings every file to the same figure.",
  sections: [
    {
      id: "lufs",
      title: "LUFS: loudness as people hear it.",
      paragraphs: [
        "ITU-R BS.1770 measures loudness the way the ear weighs sound: it filters out the lowest bass, lifts the treble a little, averages the energy over 400 ms blocks and leaves out the silences and the very quiet parts. The result is in LUFS (loudness units relative to full scale), and a file at −14 LUFS sounds as loud as another at −14.",
        "True peak is the highest the wave reaches, between the samples too, in dBTP. A file can have every sample under full scale and still clip when it is played or encoded, because the wave rises between them.",
      ],
    },
    {
      id: "which",
      title: "Which loudness to choose.",
      paragraphs: [
        "Spotify plays music at about −14 LUFS and turns louder tracks down to it. Apple asks for podcasts at about −16 LUFS, with true peaks no higher than −1 dB. European broadcasters use −23 LUFS (EBU R 128), and US television −24 (ATSC A/85). For your own playlists, any figure works as long as every file has the same.",
      ],
    },
    {
      id: "how",
      title: "How to normalize.",
      paragraphs: [
        "Open Normalize audio, drop your files and choose a loudness. Each file is measured as it will be written, made louder or quieter to reach the target, and a limiter keeps its true peaks under the ceiling, −1 dBTP unless you choose another. The file written is measured again, and the page says what it reached.",
        "When a quiet file must be made much louder, the limiter lowers its loudest moments; if the ceiling keeps it from the target, the page says how loud it got rather than letting it clip.",
      ],
      links: [
        { label: "Open Normalize audio", href: "/dashboard/normalize-audio/" },
      ],
    },
    {
      id: "private",
      title: "On your device.",
      paragraphs: [
        "Files are read, measured and written in your browser and never uploaded. There is no account and no limit on how many you normalize.",
      ],
      links: [
        {
          label: "Guide: make a quiet recording louder",
          href: "/blog/make-audio-louder/",
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
      title:
        "ITU-R BS.1770, algorithms to measure loudness and true-peak level",
      url: "https://www.itu.int/rec/R-REC-BS.1770",
    },
    {
      title: "Loudness normalization, Spotify for Artists",
      url: "https://support.spotify.com/us/artists/article/loudness-normalization/",
    },
    {
      title: "Audio requirements, Apple Podcasts",
      url: "https://podcasters.apple.com/support/893-audio-requirements",
    },
    {
      title: "EBU R 128, loudness normalisation",
      url: "https://tech.ebu.ch/publications/r128",
    },
  ],
}

export const boostPost: BlogPost = {
  published: "2026-10-20",
  modified: "2026-10-20",
  slug: "make-audio-louder",
  title: "Louder, without the crackle.",
  searchTitle:
    "How to increase the volume of an audio file online without clipping",
  description:
    "Make a quiet recording, song or video's sound louder in your browser. Why turning it up can make it crackle, and how a limiter stops that. Nothing is uploaded.",
  keywords: [
    "volume booster",
    "increase audio volume",
    "make mp3 louder",
    "amplify audio",
    "boost quiet recording",
    "audio clipping",
    "make voice recording louder",
  ],
  category: "A little know-how",
  readingTime: "3 min read",
  image: "/images/audio-boost-guide.svg",
  imageAlt:
    "A quiet waveform made louder, its loudest moments held under a dashed ceiling instead of being cut flat",
  tool: "volume-booster",
  intro:
    "A voice note recorded across the room, a lecture from the back row, a song that was mastered quietly. Turning the volume up on the phone only goes so far; making the file itself louder fixes it everywhere it is played.",
  sections: [
    {
      id: "clipping",
      title: "Why louder can crackle.",
      paragraphs: [
        "A digital file cannot go above full scale. Make a sound louder and its loudest moments reach that limit and are cut flat, which you hear as crackling or distortion: clipping. Most of a recording may have room to spare while a few moments, a laugh, a cough, a drum, do not.",
      ],
    },
    {
      id: "limiter",
      title: "A limiter lowers only the loudest moments.",
      paragraphs: [
        "The Volume booster makes the whole file louder by the decibels you choose and, looking 5 ms ahead, lowers the gain smoothly for the moments that would go over the ceiling, then lets it rise again over a tenth of a second. Everything else is simply louder. The page says how much louder the file was made and how much the limiter took off.",
        "6 dB doubles the height of the waveform; 10 dB sounds about twice as loud. To bring several files to the same loudness instead, normalize them.",
      ],
      links: [
        {
          label: "Open the Volume booster",
          href: "/dashboard/volume-booster/",
        },
        {
          label: "Guide: normalize audio loudness",
          href: "/blog/normalize-audio-loudness/",
        },
      ],
    },
    {
      id: "private",
      title: "On your device.",
      paragraphs: [
        "Files are read and written in your browser and never uploaded, and each one is opened again and measured before you download it.",
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
      title: "Clipping (audio), Wikipedia",
      url: "https://en.wikipedia.org/wiki/Clipping_(audio)",
    },
    {
      title: "Dynamic range compression and limiting, Wikipedia",
      url: "https://en.wikipedia.org/wiki/Dynamic_range_compression",
    },
  ],
}

export const splitPost: BlogPost = {
  published: "2026-10-20",
  modified: "2026-10-20",
  slug: "split-audio-into-parts",
  title: "One long recording, in parts you can find.",
  searchTitle: "How to split an audio file into parts online for free",
  description:
    "Split a long recording, podcast, lecture or mix into parts in your browser: every few minutes, into equal parts, at markers or at its pauses. Nothing is uploaded.",
  keywords: [
    "split audio",
    "audio splitter",
    "split mp3 into parts",
    "split audio by silence",
    "cut audio into segments",
    "split podcast",
    "split long recording",
  ],
  category: "A little know-how",
  readingTime: "3 min read",
  image: "/images/audio-split-guide.svg",
  imageAlt:
    "A long waveform with markers along it, and below it a list of numbered parts, each with a tick and a download button",
  tool: "split-audio",
  intro:
    "A two-hour lecture, a recorded meeting, a DJ mix, an audiobook chapter: some players skip badly through long files, some sites take only short ones, and finding your place is easier in parts. Splitting should not mean uploading the recording or cutting it by hand ten times.",
  sections: [
    {
      id: "how",
      title: "How to split.",
      paragraphs: [
        "Open the Audio splitter and drop the file. Choose how to split it: every few minutes, into a number of equal parts, at markers, or at its pauses. The parts are listed with their times before anything is written; press Split and each part is written, checked and named in order, ready to download one by one or as a ZIP.",
      ],
      links: [
        { label: "Open the Audio splitter", href: "/dashboard/split-audio/" },
      ],
    },
    {
      id: "markers",
      title: "At markers, or at the pauses.",
      paragraphs: [
        "To choose the places yourself, play the file and press M (or Add a marker) where each part should start. To let the sound choose, split at pauses: every pause longer than half a second, one or two seconds ends a part at its middle, and the pauses can be left out of the parts altogether, which suits a talk or a set of songs.",
        "You can trim, fade and normalise the file first: the parts are made from it as you edited it, and each part is cut to the sample.",
      ],
      links: [
        {
          label: "Guide: trim audio without uploading it",
          href: "/blog/trim-audio-without-uploading/",
        },
      ],
    },
    {
      id: "private",
      title: "On your device.",
      paragraphs: [
        "The file is read and the parts written in your browser; nothing is uploaded and there is no account. The file itself is never changed.",
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
      title: "Audio file format, Wikipedia",
      url: "https://en.wikipedia.org/wiki/Audio_file_format",
    },
  ],
}

export const joinPost: BlogPost = {
  published: "2026-10-20",
  modified: "2026-10-20",
  slug: "join-audio-files",
  title: "Many recordings, one file, no jumps between.",
  searchTitle: "How to join or merge audio files into one online for free",
  description:
    "Join MP3, M4A, WAV and other sound files into one in your browser, in your order, straight on, with silence or crossfades, with chapters. Nothing is uploaded.",
  keywords: [
    "join audio files",
    "merge mp3",
    "combine audio files",
    "audio joiner",
    "crossfade songs",
    "merge audio with chapters",
    "concatenate mp3",
  ],
  category: "A little know-how",
  readingTime: "3 min read",
  image: "/images/audio-join-guide.svg",
  imageAlt:
    "Three numbered files with arrows to move them, joined into one waveform with chapter marks where each begins",
  tool: "join-audio",
  intro:
    "Voice notes recorded in pieces, the songs of a mix, the chapters of an audiobook, the takes of a podcast: joining them should keep their order, not jump in loudness from one to the next, and leave a way to find each part again.",
  sections: [
    {
      id: "how",
      title: "How to join.",
      paragraphs: [
        "Open Join audio and drop the files. Put them in order with the arrows, choose how they meet (straight on, a moment of silence, or a crossfade) and the format, and press Join. The joined file is written, opened again and listened to, and offered with a player and a download.",
      ],
      links: [{ label: "Open Join audio", href: "/dashboard/join-audio/" }],
    },
    {
      id: "matching",
      title: "Files that do not match.",
      paragraphs: [
        "Files of different sample rates and channels are made the same. Recordings of different loudness can be made to match: choose Normalize loudness, and each file is measured and brought to the same loudness before it is joined, with one limiter over the whole so nothing clips. Each file joins as you edited it, so trim each one first if it needs it.",
      ],
      links: [
        {
          label: "Guide: normalize audio loudness",
          href: "/blog/normalize-audio-loudness/",
        },
      ],
    },
    {
      id: "chapters",
      title: "A chapter for each file.",
      paragraphs: [
        "An MP3 or M4A gets a chapter where each file begins, named after it, so a player can jump from one to the next. MP3 chapters are read by most players and podcast apps; the M4A kind is read by VLC, FFmpeg and foobar2000, while Apple's own apps read another kind.",
      ],
    },
    {
      id: "private",
      title: "On your device.",
      paragraphs: [
        "Files are read and joined in your browser and never uploaded. There is no account and no limit on how many you join, up to 50 at once.",
      ],
      links: [
        {
          label: "Guide: split audio into parts",
          href: "/blog/split-audio-into-parts/",
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
      title: "ID3v2 Chapter Frame Addendum",
      url: "https://id3.org/id3v2-chapters-1.0",
    },
  ],
}

export const speedPost: BlogPost = {
  published: "2026-10-20",
  modified: "2026-10-20",
  slug: "change-audio-speed-and-pitch",
  title: "Faster or slower, the notes where they were.",
  searchTitle: "How to speed up or slow down audio without changing pitch",
  description:
    "Change the speed of a recording, song or podcast without changing its pitch, or the pitch without changing its length, in your browser. Also tape speed, reverse and karaoke. Nothing is uploaded.",
  keywords: [
    "change audio speed",
    "speed up audio without changing pitch",
    "slow down audio",
    "pitch shifter",
    "change pitch of song",
    "reverse audio",
    "karaoke vocal remover",
  ],
  category: "A little know-how",
  readingTime: "4 min read",
  image: "/images/audio-speed-guide.svg",
  imageAlt:
    "A waveform stretched shorter at 1.25 times, the same notes, beside chips for the speed and a slider for the pitch",
  tool: "change-audio-speed",
  intro:
    "A lecture to get through faster, a solo to learn slowly, a song to sing a tone lower. Playing a file faster as a tape does raises its pitch; keeping the notes where they are means rebuilding the sound, and doing it on your own device means no upload and no waiting in a queue.",
  sections: [
    {
      id: "how",
      title: "How to change the speed.",
      paragraphs: [
        "Open Change audio speed and drop your files. Choose a speed from half to twice as fast; with Keep the pitch on, the notes stay where they are. The file is written in its own format unless you choose another, checked, and ready to download.",
      ],
      links: [
        {
          label: "Open Change audio speed",
          href: "/dashboard/change-audio-speed/",
        },
      ],
    },
    {
      id: "how-it-works",
      title: "How the pitch stays put.",
      paragraphs: [
        "The sound is cut into overlapping pieces of 40 milliseconds and laid out again closer together (faster) or further apart (slower). Each piece is taken from where its waveform best matches the one before it, so they join without a beat: the method is called WSOLA. Speech and most music sound natural up to about one and a half times; at the extremes a little flutter can be heard.",
        "To change the pitch and keep the length, the sound is stretched by the pitch's ratio and then played faster or slower by it, up or down by up to an octave. With Keep the pitch off, the file plays as a tape would: faster is higher.",
      ],
    },
    {
      id: "more",
      title: "Backwards, karaoke and the channels.",
      paragraphs: [
        "The same page plays a file backwards, swaps its left and right, puts one side in both ears or sets the balance. Karaoke takes away what is in the middle of a stereo mix, where the voice often is, and keeps the bass. It is not a real vocal remover: it works on some songs, and takes away anything else in the middle too.",
      ],
    },
    {
      id: "private",
      title: "On your device.",
      paragraphs: [
        "Files are read and written in your browser and never uploaded. There is no account and no limit on how many you change.",
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
      title: "Audio time stretching and pitch scaling, Wikipedia",
      url: "https://en.wikipedia.org/wiki/Audio_time_stretching_and_pitch_scaling",
    },
    {
      title:
        "Verhelst and Roelands, an overlap-add technique based on waveform similarity (WSOLA), ICASSP 1993",
      url: "https://ieeexplore.ieee.org/document/319366",
    },
  ],
}

export const noisePost: BlogPost = {
  published: "2026-10-20",
  modified: "2026-10-20",
  slug: "remove-background-noise-from-audio",
  title: "The words kept, the noise left behind.",
  searchTitle: "How to remove background noise from audio for free",
  description:
    'Take hiss, fans, traffic, mains hum, clicks and harsh "s" sounds out of voice recordings in your browser, with RNNoise running on your device. Nothing is uploaded.',
  keywords: [
    "remove background noise from audio",
    "noise reduction",
    "denoise audio online",
    "remove hum from audio",
    "remove clicks from audio",
    "de-esser",
    "RNNoise",
  ],
  category: "A little know-how",
  readingTime: "4 min read",
  image: "/images/audio-noise-guide.svg",
  imageAlt:
    "A voice recording with noise between the words, and the same recording cleaned, quiet between the words, beside a strength slider and chips for mains hum",
  tool: "remove-background-noise",
  intro:
    "A voice note by a busy road, an interview with a fan behind it, a podcast with a buzz from a cable. Most noise removers upload the recording; this one runs a small neural network made for speech in your browser, so the recording and its noise stay on your device.",
  sections: [
    {
      id: "how",
      title: "How to take the noise out.",
      paragraphs: [
        "Open Remove background noise and drop your recordings. All of the noise RNNoise finds is taken away at first; lower the strength if voices start to sound thin or watery. Turn on hum removal, clicks or the de-esser if the recording needs them, listen to the result, and download it in its own format or another.",
      ],
      links: [
        {
          label: "Open Remove background noise",
          href: "/dashboard/remove-background-noise/",
        },
      ],
    },
    {
      id: "rnnoise",
      title: "A network that knows what speech sounds like.",
      paragraphs: [
        "RNNoise, made by Jean-Marc Valin at Xiph.org and Mozilla, listens to the sound ten milliseconds at a time and judges, band by band, how much of it is voice. What is not is turned down. It was trained on speech, so it is best at voices: on music it can take away notes and breaths you want, and the page says so. The strength mixes its result with the sound as it was.",
        "Its file is 3.1 MB to download. It comes from this site the first time you use it and is then kept, so it works offline after that.",
      ],
    },
    {
      id: "repairs",
      title: "Hum, clicks and harsh s.",
      paragraphs: [
        "Mains hum is a steady buzz at 50 Hz (60 Hz in the Americas and parts of Asia) and its harmonics. Each is taken out with a notch 3 Hz wide, so the voice beside it is left as it was.",
        "Clicks are short spikes, far louder than the sound just around them. Each is drawn over with a smooth curve, and the page says how many there were; drum hits and consonants last longer and are left alone. The de-esser turns down only the sound over 5 kHz, and only while it is too loud, as in a sharp s.",
      ],
    },
    {
      id: "private",
      title: "On your device.",
      paragraphs: [
        "Files are read, cleaned and written in your browser and never uploaded. Nothing about the noise is sent anywhere, there is no account and no limit on how many you clean.",
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
      title: "RNNoise: learning noise suppression, Jean-Marc Valin",
      url: "https://jmvalin.ca/demo/rnnoise/",
    },
    {
      title:
        "Valin, a hybrid DSP/deep learning approach to real-time full-band speech enhancement, 2018",
      url: "https://arxiv.org/abs/1709.08243",
    },
    {
      title: "Utility frequency, Wikipedia",
      url: "https://en.wikipedia.org/wiki/Utility_frequency",
    },
  ],
}

export const tagsPost: BlogPost = {
  published: "2026-10-21",
  modified: "2026-10-21",
  slug: "edit-audio-tags-and-cover-art",
  title: "The right name on every song, the sound left alone.",
  searchTitle: "How to edit MP3 tags and add album art for free",
  description:
    "Change the title, artist, album, track number, lyrics and cover of MP3, M4A, FLAC, Ogg, Opus and WAV files in your browser, many at once, without encoding the sound again. Nothing is uploaded.",
  keywords: [
    "edit mp3 tags",
    "mp3 tag editor online",
    "add album art to mp3",
    "change song title",
    "id3 tag editor",
    "edit flac tags",
    "edit m4a metadata",
  ],
  category: "A little know-how",
  readingTime: "4 min read",
  image: "/images/audio-tags-guide.svg",
  imageAlt:
    "Fields for the title, artist and album of a song beside its cover picture, with a note that the sound is kept byte for byte",
  tool: "edit-audio-tags",
  intro:
    "A song called Track 01 by Unknown artist, an album with no cover, a podcast episode with last week's title. Tags are a small part at the start or end of a file, so changing them should not mean writing the sound again; here it does not, and the files never leave your device.",
  sections: [
    {
      id: "how",
      title: "How to change the tags.",
      paragraphs: [
        "Open Edit audio tags and drop your files. Type in the fields of one file, or choose All files to give a whole album one artist and title at once; fields that differ between files say so and are left as each has them until you type. Choose a picture for the cover, then download each file, or all of them as a ZIP.",
      ],
      links: [
        {
          label: "Open Edit audio tags",
          href: "/dashboard/edit-audio-tags/",
        },
      ],
    },
    {
      id: "sound",
      title: "Why the sound is not touched.",
      paragraphs: [
        "Each kind of file keeps its tags in its own place: ID3 at the start of an MP3, an item list inside an M4A, comment and picture blocks at the start of a FLAC, a comment header in an Ogg or Opus file, and INFO and id3 chunks in a WAV. Only that part is written. The sound is byte for byte as it was, so nothing is lost, and the page listens to every result before you download it.",
        "Every tag you do not change stays as it was, including those this page does not show, such as chapters, ReplayGain or an encoder's notes. A field you empty is taken out.",
      ],
    },
    {
      id: "many",
      title: "Many files, one album.",
      paragraphs: [
        "Choose All files and what you type goes into every file. Give each its own track number afterwards, one file at a time, or leave the numbers they have.",
      ],
    },
    {
      id: "private",
      title: "On your device.",
      paragraphs: [
        "Files are read and written in your browser and never uploaded. There is no account and no limit on how many you change.",
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
      title: "ID3 tag version 2.4.0, main structure",
      url: "https://id3.org/id3v2.4.0-structure",
    },
    {
      title: "RFC 9639: Free Lossless Audio Codec (FLAC), metadata blocks",
      url: "https://www.rfc-editor.org/rfc/rfc9639.html",
    },
    {
      title:
        "RFC 7845: Ogg encapsulation for the Opus audio codec, comment header",
      url: "https://www.rfc-editor.org/rfc/rfc7845.html",
    },
  ],
}

export const recordPost: BlogPost = {
  published: "2026-10-21",
  modified: "2026-10-21",
  slug: "record-audio-online",
  title: "Press record, keep every sample.",
  searchTitle: "How to record audio online from your microphone for free",
  description:
    "Record from a microphone in your browser, with pause and a level meter and no call filters unless you want them, then trim, clean up and save it as MP3, M4A or WAV. Nothing is uploaded.",
  keywords: [
    "online voice recorder",
    "record audio online",
    "microphone recorder",
    "record voice memo",
    "free audio recorder",
    "record from microphone",
  ],
  category: "A little know-how",
  readingTime: "4 min read",
  image: "/images/audio-record-guide.svg",
  imageAlt:
    "A recording in progress at 1:24.6, with a level meter, Pause and Stop buttons, and the take's waveform",
  tool: "voice-recorder",
  intro:
    "A voice note, an interview, a guitar idea before it is gone. Many online recorders compress the sound as it comes in, or send it to a server; this one keeps exactly what the microphone gives, on your device, and hands it to the same editor as any file.",
  sections: [
    {
      id: "how",
      title: "How to record.",
      paragraphs: [
        "Open the Voice recorder and press Record; the browser asks before the microphone is used. Pause and go on as often as you like, watch the meter, and press Stop and keep. The take goes into the list of files, where it can be trimmed, cleaned of noise, made louder and saved as MP3, M4A, WAV or anything else.",
      ],
      links: [
        {
          label: "Open the Voice recorder",
          href: "/dashboard/voice-recorder/",
        },
      ],
    },
    {
      id: "raw",
      title: "The microphone as it is.",
      paragraphs: [
        "Browsers are made for calls, so by default they cancel echo, suppress noise and change the level of a microphone. Here those are off unless you turn them on: the sound is taken as the browser hands it over, 32-bit floating point at the device's own rate, so nothing is lost before you choose what to do with it.",
        "The meter shows how loud the sound is, and the page says when it reaches full scale, past which it is cut off for good: move back, or turn the input down.",
      ],
    },
    {
      id: "safe",
      title: "A take that survives a closed tab.",
      paragraphs: [
        "Turn on Keep a draft while recording, and the take is kept on your device as it is recorded. If the tab is closed or the browser crashes, the next visit offers it back, up to the last second before it stopped. The switch starts off every time, and nothing is ever sent anywhere.",
      ],
    },
    {
      id: "private",
      title: "On your device.",
      paragraphs: [
        "Recordings are made and written in your browser and never uploaded. There is no account and no limit on how many you make.",
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
      title: "MDN: MediaDevices.getUserMedia()",
      url: "https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia",
    },
    {
      title: "MDN: AudioWorkletProcessor",
      url: "https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletProcessor",
    },
  ],
}

export const transcribePost: BlogPost = {
  published: "2026-10-21",
  modified: "2026-10-21",
  slug: "transcribe-audio-on-your-device",
  title: "Every word written down, none of it sent away.",
  searchTitle: "How to transcribe audio to text for free without uploading it",
  description:
    "Turn speech in a recording, interview or video into text and subtitles with Whisper running in your browser, then search it and play along. Nothing is uploaded.",
  keywords: [
    "transcribe audio to text",
    "speech to text free",
    "whisper online",
    "audio to text without upload",
    "make subtitles srt",
    "transcribe interview",
  ],
  category: "A little know-how",
  readingTime: "4 min read",
  image: "/images/audio-transcribe-guide.svg",
  imageAlt:
    "A transcript in parts with their times beside a player, one part highlighted as it plays, and buttons to save it as text, SRT and WebVTT",
  tool: "transcribe-audio",
  intro:
    "An interview to quote, a lecture to search, a video that needs subtitles. Transcription services upload the recording and often keep it; here Whisper, OpenAI's speech recognition model, runs in your browser, so the recording stays on your device.",
  sections: [
    {
      id: "how",
      title: "How to transcribe.",
      paragraphs: [
        "Open Transcribe audio and drop your recording or video. Choose a model and press Transcribe: the text comes in as Whisper hears it, a few seconds at a time, and you can stop whenever you like and keep what was heard. Press a time to listen from there, find words, and save it as text or as SRT or WebVTT subtitles.",
      ],
      links: [
        {
          label: "Open Transcribe audio",
          href: "/dashboard/transcribe-audio/",
        },
      ],
    },
    {
      id: "models",
      title: "Which model.",
      paragraphs: [
        "Base is quick: on a laptop it takes about a third of the recording's length, and it is good with clear speech. Small is about three times slower and better with accents, noise and languages other than English. Either is downloaded from this site the first time (about 107 MB or 280 MB) and kept for working offline after that.",
        "Whisper hears about a hundred languages and finds which one by itself, or you can say which it is. It can also write what is said in English instead: a quick translation, not a careful one.",
      ],
    },
    {
      id: "honest",
      title: "What to check.",
      paragraphs: [
        "Whisper is very good and not perfect: it can mishear names, quiet words and speech over noise, and on long silence or music it can write words nobody said. Read the transcript through before you quote it or publish subtitles. Taking background noise out first can help.",
      ],
      links: [
        {
          label: "Remove background noise first",
          href: "/dashboard/remove-background-noise/",
        },
      ],
    },
    {
      id: "private",
      title: "On your device.",
      paragraphs: [
        "The recording is read and transcribed in your browser and never uploaded. There is no account and no limit on how much you transcribe.",
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
      title:
        "Radford et al., Robust speech recognition via large-scale weak supervision (Whisper), 2022",
      url: "https://arxiv.org/abs/2212.04356",
    },
    {
      title: "Transformers.js",
      url: "https://huggingface.co/docs/transformers.js",
    },
  ],
}

export const videoPost: BlogPost = {
  published: "2026-10-21",
  modified: "2026-10-21",
  slug: "turn-audio-into-video",
  title: "A sound, a picture, and a waveform that moves.",
  searchTitle: "How to turn audio into a video with a picture for free",
  description:
    "Turn a song, podcast clip or voice note into an MP4 with its cover or a picture of your own, a moving waveform and its title, in your browser, to share where only video goes. Nothing is uploaded.",
  keywords: [
    "audio to video",
    "mp3 to mp4 with picture",
    "add image to audio",
    "audiogram maker",
    "waveform video",
    "put audio on instagram",
  ],
  category: "A little know-how",
  readingTime: "3 min read",
  image: "/images/audio-video-guide.svg",
  imageAlt:
    "A square video frame with a cover picture, a title and a waveform whose first part is lit, beside chips for the shape",
  tool: "audio-to-video",
  intro:
    "Many places take video and not sound: a social post, a story, a video site. A sound becomes a video once it has a picture, and a waveform that moves as it plays tells people there is something to hear.",
  sections: [
    {
      id: "how",
      title: "How to make one.",
      paragraphs: [
        "Open Audio to video and drop your sound. Choose the shape (square, landscape or portrait), the picture (its cover, one of your own, or none), and whether to show the waveform and the title. Press Make the video: it is drawn and written on your device, checked, and ready to download as an MP4.",
      ],
      links: [
        {
          label: "Open Audio to video",
          href: "/dashboard/audio-to-video/",
        },
      ],
    },
    {
      id: "sound",
      title: "The sound you made.",
      paragraphs: [
        "The video has the sound as you set it in the editor: trimmed, cleaned of noise, made louder or anything else. Without the moving waveform the picture stands still at one frame a second, so even an hour is made in moments; with it, the playhead moves 24 times a second.",
        "Where the browser can write H.264 the video is an MP4 with AAC sound, which plays everywhere; where it cannot, it is a WebM, and the page says so.",
      ],
    },
    {
      id: "private",
      title: "On your device.",
      paragraphs: [
        "The sound and the picture are read and the video written in your browser, never uploaded. There is no account and no watermark.",
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
      title: "MDN: WebCodecs API",
      url: "https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API",
    },
  ],
}

export const gaplessPost: BlogPost = {
  published: "2026-10-15",
  modified: "2026-10-15",
  slug: "gapless-mp3-and-aac",
  title: "Why a converted MP3 starts late, and ours does not.",
  searchTitle:
    "Why does a converted MP3 start with silence? Gapless MP3 and AAC",
  description:
    "MP3 and AAC encoders add a few hundredths of a second of silence to every file. Why it happens, when it matters (loops, albums, ringtones), and how files can say how long their sound really is.",
  keywords: [
    "MP3 silence at start",
    "gapless MP3",
    "gapless playback",
    "encoder delay",
    "AAC priming",
    "LAME header",
    "audio converter gap",
  ],
  category: "A little know-how",
  readingTime: "4 min read",
  image: "/images/audio-gapless-guide.svg",
  imageAlt:
    "Two waveforms of the same sound, the upper one starting after a short flat line of silence, the lower one starting at once",
  tool: "audio-editor",
  intro:
    "Convert a WAV to MP3 and the MP3 is a little longer than the WAV: a few hundredths of a second of silence at the start, a little more at the end. Most of the time nobody notices. In a loop, between the tracks of a live album, or at the start of a ringtone, everyone does.",
  sections: [
    {
      id: "why",
      title: "Where the gap comes from.",
      paragraphs: [
        "MP3 and AAC encoders work on blocks of samples that overlap. To start cleanly, they put a run of samples before the sound (the encoder delay, or priming), and to end on a whole block they pad the end. LAME, the MP3 encoder, puts 576 samples first, and every MP3 decoder adds 529 more; AAC encoders put 1,024 or 2,112. At 44.1 kHz that is 25 to 50 milliseconds of silence at the start.",
      ],
    },
    {
      id: "fix",
      title: "How a file says how long its sound is.",
      paragraphs: [
        "An MP3 can carry the delay and the padding in a header in its first frame, the LAME header, which players such as iTunes, foobar2000 and FFmpeg read to play exactly the sound. An AAC file in MP4 or M4A says the same in an edit list: start after the priming, play this many samples.",
        "Many converters leave both out. The KeepSimp Audio editor writes them into every MP3 and AAC file it makes. Because AAC encoders differ from browser to browser, it measures the priming of the one your browser has, with a short test before the first file, rather than assume it.",
      ],
      links: [
        { label: "Open the audio editor", href: "/dashboard/audio-editor/" },
      ],
    },
    {
      id: "check",
      title: "Checked, not hoped.",
      paragraphs: [
        "Each file written is opened again and decoded, its delay and padding left out as a player leaves them out, and its length is held against the original's. A file that comes out longer than it should is reported, not handed over in silence.",
      ],
      links: [
        {
          label: "Guide: convert audio without uploading it",
          href: "/blog/convert-audio-without-uploading/",
        },
      ],
    },
    {
      id: "private",
      title: "On your device.",
      paragraphs: [
        "Files are read and written in your browser and never uploaded. There is no account and no limit on how many you convert.",
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
      title: "LAME technical FAQ: encoder delay and padding",
      url: "https://lame.sourceforge.io/tech-FAQ.txt",
    },
    {
      title: "Audio priming: handling encoder delay in AAC, Apple",
      url: "https://developer.apple.com/documentation/quicktime-file-format/appendix_g_audio_priming_handling_encoder_delay_in_aac",
    },
    {
      title: "Gapless playback, Wikipedia",
      url: "https://en.wikipedia.org/wiki/Gapless_playback",
    },
  ],
}

export const agentsPost: BlogPost = {
  published: "2026-10-21",
  modified: "2026-10-22",
  slug: "keepsimp-tools-for-ai-agents",
  title: "Ask your agent, and the work stays on your computer.",
  searchTitle: "Use KeepSimp's free tools from Claude Code or Codex (MCP)",
  description:
    "Give Claude Code, Codex or an agent in your browser KeepSimp's tools: they run in a hidden browser on your computer, read your files where they are and save results beside them.",
  keywords: [
    "mcp server",
    "claude code tools",
    "codex mcp",
    "webmcp",
    "local ai agent tools",
    "format json with ai agent",
    "convert audio with ai agent",
  ],
  category: "A little know-how",
  readingTime: "3 min read",
  image: "/images/agent-tools-guide.svg",
  imageAlt:
    "A terminal asking an agent to format a file, a KeepSimp page in a hidden browser, and the formatted file saved beside the first",
  tool: "",
  intro:
    "An agent that writes code can also format a file, check a colour, or merge, split and compress PDFs, or clean up a recording. KeepSimp's tools can be handed to it, and they still run on your device.",
  sections: [
    {
      id: "connect",
      title: "Connect it once.",
      paragraphs: [
        "The KeepSimp bridge is a small program for agents that speak the Model Context Protocol. In Claude Code, add it with: claude mcp add keepsimp -- npx -y keepsimp-mcp. Codex takes the same command in its config file. Then ask in plain words, such as: format data.json with sorted keys, or check the contrast of #777 on white.",
      ],
      links: [
        {
          label: "How to connect an agent",
          href: "/dashboard/agents/",
        },
      ],
    },
    {
      id: "how",
      title: "What happens.",
      paragraphs: [
        "The bridge opens the KeepSimp agent page in a browser of its own, hidden, on your computer. It hands the page the files your agent names, the tool runs there with the same engines as the tools' own pages, and what it made is saved next to your file. An existing file is never overwritten.",
        "It reads and writes only inside the folders your agent works in, and its browser opens the KeepSimp site and refuses every other address. Your files are never uploaded.",
      ],
    },
    {
      id: "browser",
      title: "Or in your browser.",
      paragraphs: [
        "WebMCP is a proposed standard that lets a page give its tools to an agent in the browser. Chrome is trying it out; where it is on, the agent page gives the same tools to that agent, working on the files you add to the page.",
      ],
    },
    {
      id: "tools",
      title: "The tools.",
      paragraphs: [
        "JSON: format, repair, look through, lay out as a table, query, validate against a schema, compare, patch and convert, with every number kept exactly. Colour: convert between spaces, check contrast with ΔE2000 and colour-vision previews, make palettes, mix, write gradients, give companies' published colours, find the colours of an image and read one pixel. PDF: read a file's facts and text, merge, split every way the splitter does, compress, organise pages, crop, add page numbers, headers and watermarks, change details and bookmarks, draw and comment, change the words, pictures and links a page already has, make and fill forms, redact, find and replace, add text and pictures, recognise scans and check signatures, each result checked. Images: read, compress, resize and convert with every setting of their pages, and turn animations and short videos into GIF, WebP, APNG, MP4 or WebM. Audio: read loudness, convert, trim, fade and trim silence, equalise, make ringtones, normalise, change speed, take out noise, edit tags, split, join, transcribe with Whisper and make a video of a sound. Signing and recording stay for you to do yourself.",
      ],
      links: [
        {
          label: "Open the PDF merger",
          href: "/dashboard/pdf-merger/",
        },
        {
          label: "Open the JSON workspace",
          href: "/dashboard/json-formatter/",
        },
        {
          label: "Open the colour utility",
          href: "/dashboard/color-utility/",
        },
        {
          label: "Open the audio editor",
          href: "/dashboard/audio-editor/",
        },
        {
          label: "Batches, chains and design checks",
          href: "/blog/automate-file-chores-with-an-ai-agent/",
        },
      ],
    },
  ],
  sources: [
    {
      title: "Model Context Protocol",
      url: "https://modelcontextprotocol.io/",
    },
    {
      title: "Chrome for Developers: WebMCP",
      url: "https://developer.chrome.com/docs/ai/webmcp",
    },
  ],
}

export const agentWorkflowsPost: BlogPost = {
  published: "2026-10-22",
  slug: "automate-file-chores-with-an-ai-agent",
  title: "Give your agent the chores. Keep your files at home.",
  searchTitle:
    "Automate PDF, image, audio and JSON chores with Claude Code or Codex",
  description:
    "Batches, chains of jobs and design-system checks: how to have Claude Code or Codex do file chores with KeepSimp's tools, on your own computer.",
  keywords: [
    "automate pdf tasks with ai",
    "batch process files with claude code",
    "codex mcp automation",
    "ai agent productivity",
    "check design tokens contrast",
    "batch compress pdf locally",
    "mcp file tools",
  ],
  category: "A little know-how",
  readingTime: "6 min read",
  image: "/images/agent-workflows-guide.svg",
  imageAlt:
    "A request in a terminal becoming three checked KeepSimp steps, a folder of finished PDFs beside the originals, and design tokens checked for contrast",
  tool: "",
  intro:
    "One file is quick to do by hand. Forty are an afternoon. An agent such as Claude Code or Codex can do the forty, if it has tools it can trust. With the KeepSimp bridge it uses the same engines as KeepSimp's pages, on your computer, and every result is checked before it is handed back.",
  sections: [
    {
      id: "connect",
      title: "Connect it once.",
      paragraphs: [
        "Add the bridge to your agent, then ask in plain words. It works in the folder you start the agent in. To let it reach another folder, add --allow and the folder's path to the command.",
        "The first start downloads the bridge and, when Google Chrome is not installed, a browser of about 150 MB. After that it starts in seconds.",
      ],
      example: {
        label: "Claude Code, then Codex (~/.codex/config.toml)",
        code: 'claude mcp add keepsimp -- npx -y keepsimp-mcp\n\n[mcp_servers.keepsimp]\ncommand = "npx"\nargs = ["-y", "keepsimp-mcp"]\nstartup_timeout_sec = 120\ntool_timeout_sec = 300',
      },
      links: [
        {
          label: "How the bridge works",
          href: "/blog/keepsimp-tools-for-ai-agents/",
        },
        { label: "The agent page", href: "/dashboard/agents/" },
      ],
    },
    {
      id: "batches",
      title: "Do the same thing to a whole folder.",
      paragraphs: [
        "This is where an agent saves the most time. It lists the folder itself and calls a KeepSimp tool for each file, so a job you would repeat forty times becomes one sentence. Say where the results go: they are saved there, or beside each file, and a file that is already there is never written over.",
        "Be exact about what you want. A size, a format, a loudness or a page range gives the same result for every file; a word like smaller leaves the choice to the agent.",
      ],
      example: {
        label: "Things to ask",
        code: "Compress every PDF in contracts/ to under 2 MB\nand save them in contracts/small/.\n\nResize every photo in shoot/ to 640, 1280 and 1920\npixels wide, as AVIF and WebP.\n\nConvert every WAV in interviews/ to MP3 at -16 LUFS.\n\nFormat every JSON file in fixtures/ with sorted keys.",
      },
      links: [
        {
          label: "Open the PDF compressor",
          href: "/dashboard/pdf-compressor/",
        },
        { label: "Open the image resizer", href: "/dashboard/image-resizer/" },
      ],
    },
    {
      id: "chains",
      title: "Put several jobs into one request.",
      paragraphs: [
        "A request can name steps in order, and the agent passes each result on to the next tool. A pile of scans can be recognised, have its e-mail addresses redacted, get page numbers and be compressed. A recording can have the silence at its ends trimmed and its long pauses shortened, be brought to a loudness, be written down as subtitles and become a video with its waveform.",
        "Each tool checks its own result before it hands it over: recognised words are read back, a redaction is refused while a letter can still be read under its mark, a split part must have its pages, and a sound is decoded again. When a step fails, the agent is told why in words, and nothing half-made is saved.",
      ],
      example: {
        label: "A chain, in one sentence",
        code: "For each scan in invoices/:\nmake it searchable, redact the e-mail addresses,\nnumber the pages and keep it under 1 MB.\nSave the results in invoices/done/.",
      },
      links: [
        { label: "Open OCR PDF", href: "/dashboard/ocr-pdf/" },
        { label: "Open Redact PDF", href: "/dashboard/redact-pdf/" },
        { label: "Open the audio editor", href: "/dashboard/audio-editor/" },
      ],
    },
    {
      id: "design-system",
      title: "Keep a design system honest.",
      paragraphs: [
        "Design tokens are a list of colours, and a list is something an agent can work through. Ask it to read your tokens file and check every text colour on every background it is used on. The contrast tool gives the WCAG 2 ratio with transparency counted, suggests the nearest lightness that reaches 3:1, 4.5:1 or 7:1, and shows how a pair may look with protan, deutan and tritan colour vision and in grayscale. Those are approximate previews, not a prediction of every person's vision.",
        "It can also build what the system needs: a scale of eleven tones from one brand colour, a mix of two colours in OKLab, a gradient with a fallback for older browsers, or a palette written as CSS variables, Design Tokens JSON, a Tailwind theme or a PNG strip. It can find the main colours of a logo, read one pixel of a picture, and give a company's published colours with their source. Values outside sRGB keep their wide-gamut numbers and say when they were mapped.",
        "The agent still needs your judgement. A passing ratio is one rule of readable text, not proof that a whole screen is accessible.",
      ],
      example: {
        label: "Things to ask",
        code: "Read tokens.json and check every text colour against\nevery background it is paired with, at 4.5:1.\nList the pairs that fail, with the nearest colour that passes.\n\nMake a scale of eleven tones from #00786f\nand write it as Design Tokens JSON.\n\nFind the five main colours of brand/logo.png\nand check each on white.",
      },
      links: [
        { label: "Open the colour utility", href: "/dashboard/color-utility/" },
        {
          label: "Checking contrast, explained",
          href: "/blog/check-color-contrast-wcag/",
        },
      ],
    },
    {
      id: "repeat",
      title: "Write it down, and run it again.",
      paragraphs: [
        "A request that works can be kept. Claude Code reads a project's CLAUDE.md and Codex its AGENTS.md, so a line there such as: before a release, check the contrast of tokens.json and compress the PDFs in docs/, becomes something you ask for in three words.",
        "Keep the inputs in the project and the results in a folder of their own, and the same request gives the same files each time. Look at the first results before you trust a long batch.",
      ],
    },
    {
      id: "limits",
      title: "What it will not do.",
      paragraphs: [
        "Signing a PDF, placing a signature and recording sound are not given to agents: they are a person's own acts. The bridge reads and writes only inside the folders your agent works in and those you allow, and its browser opens the KeepSimp site and refuses every other address, so your files are never uploaded.",
        "Recognising scans and transcribing can mishear, and the agent can misread what you meant. Read what it made, especially before you send it to someone else.",
      ],
    },
  ],
  sources: [
    {
      title: "Model Context Protocol",
      url: "https://modelcontextprotocol.io/",
    },
    {
      title: "keepsimp-mcp on npm",
      url: "https://www.npmjs.com/package/keepsimp-mcp",
    },
    {
      title: "W3C: WCAG 2.2, contrast (minimum)",
      url: "https://www.w3.org/TR/WCAG22/#contrast-minimum",
    },
    {
      title: "Design Tokens Community Group: format",
      url: "https://www.designtokens.org/tr/drafts/format/",
    },
  ],
}
