import { ToolTutorial, type TutorialContent } from "@/components/tool-tutorial"

const content: TutorialContent = {
  name: "How to use the KeepSimp PDF compressor",
  description:
    "Make PDFs smaller in your browser: see what their size is spent on, bring pictures down to the size they are shown at, reach a size such as 200 KB, and compare any page before and after. Text stays text, and nothing is uploaded.",
  intro: "Follow the steps below. Every option is explained underneath.",
  steps: [
    {
      title: "Add your PDFs",
      text: "Drop one PDF or several, choose them from your device or paste them. A locked file asks for its password; a damaged one is repaired where possible.",
    },
    {
      title: "See what makes it big",
      text: "The file's size is shown part by part: pictures, fonts, text and drawings, hidden data and the rest, with the heaviest pictures and the pages they are on.",
    },
    {
      title: "Choose how much to compress",
      text: "Lossless changes nothing you can see. Balanced makes pictures smaller so that they still look the same. Strong goes further, for screens and email. Or name a size the file has to come out under.",
    },
    {
      title: "Compress",
      text: "Press Compress PDF. Pictures are taken one at a time, and each is only swapped for a smaller one that has been read back and checked.",
    },
    {
      title: "Compare before and after",
      text: "Pages are drawn both ways and compared for you. Drag the divider across any page to look yourself, at up to twice its size.",
    },
    {
      title: "Download",
      text: "Read the result in the reader if you like, then download it, or all files as one ZIP. If a file cannot be made smaller, the page says so and keeps your original.",
    },
  ],
  options: [
    {
      term: "What makes it big",
      detail:
        "Every stored part of the file is counted: pictures, fonts, the text and drawings of the pages, private data left by the app that made the file, attached files, page thumbnails, document details and colour profiles. What is left is the file's structure: bookmarks, links, forms and tags.",
    },
    {
      term: "Lossless",
      detail:
        "Nothing visible changes. Identical parts are stored once and unused ones are dropped, the file is packed into compressed streams, fonts stored whole are cut down to the letters in use, page thumbnails and private app data are taken out, and pictures stored without loss are packed tighter. Each repacked picture is read back and must match pixel for pixel.",
    },
    {
      term: "Balanced",
      detail:
        "Everything Lossless does, and pictures with more than about 190 pixels per inch at the size they are shown are brought down to 150. Photographs are saved as JPEG at the lowest quality that still measures as looking the same. Drawings, charts and screenshots stay lossless, so their edges stay sharp. A JPEG that is already at a modest quality is left alone, so quality is not lost twice.",
    },
    {
      term: "Strong",
      detail:
        "As Balanced, down to 96 pixels per inch and a lower quality. Good for reading on a screen and for sending by email. Fine print inside photographs may soften, so compare a page before you download. Not meant for printing.",
    },
    {
      term: "To a size",
      detail:
        "For forms and inboxes with a limit. Choose 100 KB, 200 KB, 500 KB, 1, 2, 5, 10 or 25 MB, or type a size in KB or MB. The only way to know what a file weighs at some setting is to write it, so the file is written up to six times, from gentle to harsh, and the gentlest result that fits is kept. It stops where pictures are still easy to read (72 dpi). If the size cannot be reached, you get the smallest readable result and are told how far over it is. “Go further” lets pictures get blurry when the size matters more.",
    },
    {
      term: "Several files",
      detail:
        "Every file gets a row with what it came to. What is chosen applies to all of them. Press a file's name to see its breakdown and its pages before and after. One file that cannot be read does not stop the others. “Download all” makes one ZIP on your device; a file that could not be made smaller is in it as it was.",
    },
    {
      term: "What is never changed",
      detail:
        "Pages are not turned into pictures. Text stays sharp and can be selected, searched and read aloud. Links, bookmarks, form fields, notes, layers, accessibility tags, attached files and page numbers stay as they are. A locked file keeps its password.",
    },
    {
      term: "Pictures that are left alone",
      detail:
        "Black-and-white pictures, pictures with more than eight bits per colour, pictures in unusual colour spaces and pictures whose see-through parts depend on exact colours are not touched. CMYK pictures stay CMYK. A picture is only ever swapped for one that is smaller.",
    },
    {
      term: "The check",
      detail:
        "Pages with changed pictures are drawn from the original and from the result and compared. With many such pages, a spread of them is compared and the page says how many. Pages that changed more than the level allows are named, so you can look at them first.",
    },
    {
      term: "Before and after",
      detail:
        "One page under a divider: the original on the left, the result on the right. Drag the divider or use the arrow keys, step through the pages, and switch to 100% or 200% to look closely.",
    },
    {
      term: "Already small",
      detail:
        "When a level cannot make the file at least one percent smaller, no new file is made and the page says so. Files that are mostly text, or whose pictures are already small, often cannot shrink further.",
    },
    {
      term: "Signed and archive files",
      detail:
        "Compressing changes the file, so a digital signature is no longer valid in the result. A PDF/A archive file may no longer pass an archive check. The page tells you before you compress.",
    },
    {
      term: "Private by design",
      detail:
        "The file is read and compressed on your device. Nothing is uploaded, there is no account and there are no limits on how many files you compress. Once the page has loaded, it works offline.",
    },
  ],
}

export function PdfCompressorTutorial() {
  return <ToolTutorial content={content} />
}
