import { ToolTutorial, type TutorialContent } from "@/components/tool-tutorial"

const content: TutorialContent = {
  name: "How to use the KeepSimp PDF editor",
  description:
    "Add text, pictures, shapes and drawings to a PDF in your browser. Every change is made in the real file and can be undone, the result is checked before you download it, and nothing is uploaded.",
  intro:
    "Follow the steps below. Every tool and option is explained underneath.",
  steps: [
    {
      title: "Open a PDF",
      text: "Drop a PDF, choose it from your device or paste it. A locked file asks for its password; a damaged one is repaired where possible. The editor opens over the page, with your file in one column.",
    },
    {
      title: "Pick a tool",
      text: "The tools are in the row under the title. The first group adds things to a page: text, box, ellipse, line, arrow, draw, cover, stamp, call-out, measure and a picture. The second marks and comments: highlight, underline, strike out, squiggle, a highlighter pen and notes. Each has a letter on the keyboard, shown when you rest the pointer on it.",
    },
    {
      title: "Add what you need",
      text: "Click a page with the text tool and type. Drag out shapes and lines. Draw with a mouse, a pen or a finger. A picture lands in the middle of the page you are reading.",
    },
    {
      title: "Move, resize and turn",
      text: "With the select tool, drag a thing to move it; guides show when it lines up with the page or with another thing. Pull a handle to resize it, and the round handle above it to turn it. The arrow keys nudge by one point, or ten with Shift.",
    },
    {
      title: "Change the look",
      text: "The second row shows the look of what is selected: font, size, bold, italic and alignment for text; colours and thickness for shapes; how see-through it is.",
    },
    {
      title: "Download",
      text: "Press Download. The file is written, read back and checked, then saved by your browser. You can read the result in the reader, and go on editing afterwards.",
    },
  ],
  options: [
    {
      term: "Text",
      detail:
        "Three font families come with the site: a sans, a serif and a mono, each with bold and italic. They are as wide, letter for letter, as Arial, Times New Roman and Courier New. The font is put inside your file, cut down to the letters you used, so the text looks the same everywhere and can be selected and searched. Press Enter with a text box selected, or double-click it, to change its words.",
    },
    {
      term: "Pictures",
      detail:
        "PNG, JPEG, WebP, AVIF, GIF and BMP. A PNG or JPEG goes into the file as it is, without being saved again; other kinds are kept without loss. See-through parts stay see-through.",
    },
    {
      term: "Cover",
      detail:
        "A filled box that hides what is under it. It only covers: the words underneath are still in the file and can be copied out by anyone. Do not use it to hide private information. Redaction, which removes what is under it, comes in a later version.",
    },
    {
      term: "Signing, dates and ticks",
      detail:
        "Sign opens a window where your signature is drawn, typed in a hand of your choice, or taken from a picture with the paper removed; it lands in the middle of the page to be dragged into place. One button adds today's date. The tick tool marks the boxes of a paper form with ticks, crosses or dots, one press each. A signature made here is like ink on paper, not a certificate.",
    },
    {
      term: "Stamps",
      detail:
        "A word or two in capitals inside a frame: Approved, Draft, Final, Confidential, Paid, Void, or words of your own. Click to place one, or drag it out; resize and turn it like any shape. Its words are real text in the file. For a stamp that is a picture, such as a company seal, add the picture instead.",
    },
    {
      term: "Call-outs",
      detail:
        "Words in a frame with an arrow to what they are about. Drag from the thing you want to point at to where the words should go, then type. The round handle at the arrow's end moves what it points at; the words stay where they are when you do, and the other way round.",
    },
    {
      term: "Measuring",
      detail:
        "Drag along something to see how long it is: in millimetres, centimetres, metres, inches, feet or points. A page drawn at full size is measured as it is. For a plan drawn to a scale, type the scale (50 for one to fifty) and the line says the length in the world. The label is part of the line and changes when you pull an end.",
    },
    {
      term: "Comments",
      detail:
        "Highlight, underline, strike out and squiggle are laid on words by dragging across them; the highlighter pen marks anything, also on a scan. A note is placed with one press and typed in the list of comments, where every comment of the file can be read, answered and deleted, the ones it came with included. On download they are kept as comments, drawn into the page, or left out.",
    },
    {
      term: "Undo and redo",
      detail:
        "Everything can be undone, back to the file as you opened it, with Ctrl or ⌘ Z, and done again with Ctrl or ⌘ Shift Z. The buttons say what they would undo.",
    },
    {
      term: "Keyboard",
      detail:
        "Tab moves through the things on a page. Delete removes what is selected, Ctrl or ⌘ C, X, V and D copy, cut, paste and duplicate, and the square brackets move a thing forward or back. V, T, B, O, L, A, D, C, X, K, Q and R choose a tool, and G opens the signature window. Escape puts the tool down.",
    },
    {
      term: "Keep what you added editable",
      detail:
        "Off, the things you added become part of the page, like everything else on it. On, they stay separate things in the file, so this editor can move and change them when you open the file again. Other apps show them as stamps and may let a reader move or delete them.",
    },
    {
      term: "The check",
      detail:
        "Before the file is handed to you, the text you added is read back out of it, and pages you did not change are drawn and compared with the original, pixel for pixel. If something does not match, the page says which pages to look at.",
    },
    {
      term: "Password",
      detail:
        "The result can be locked with AES-256, with limits on printing, copying and changes and an optional second password that lifts them. A file that came with a password keeps it unless you set a new one.",
    },
    {
      term: "Leaving the page",
      detail:
        "The file lives in this tab only. If you close the tab or the file with changes that have not been downloaded, you are asked first.",
    },
  ],
  guideHref: "/blog/edit-pdfs-without-uploading/",
}

const annotating: TutorialContent = {
  name: "How to annotate a PDF with KeepSimp",
  description:
    "Highlight, underline and strike out text in a PDF, add notes and reply to comments, in your browser. The comments are ones every PDF program reads, and nothing is uploaded.",
  intro:
    "Follow the steps below. Every tool and option is explained underneath.",
  steps: [
    {
      title: "Open a PDF",
      text: "Drop a PDF, choose it from your device or paste it. A locked file asks for its password. The file opens over the page with the highlighter in hand, and any comments it already has are counted in the bar.",
    },
    {
      title: "Mark the words",
      text: "Drag across the words to highlight them, or press a single word. Underline, strike out and squiggle work the same way. Pick the colour in the second row before or after.",
    },
    {
      title: "Mark a scan",
      text: "A scanned page is a picture, with no words to take hold of. Take the highlighter pen and draw over what matters; choose how thick it is.",
    },
    {
      title: "Add a note",
      text: "Take the note tool and press where the note belongs. The list of comments opens with the note ready to be typed. Drag a note's icon to move it.",
    },
    {
      title: "Read and answer",
      text: "The list shows every comment page by page, with the words each mark lies on. Type under a comment to say something about it, reply to it, or delete it. Pressing a comment takes the pages to it.",
    },
    {
      title: "Download",
      text: "Press Download. Choose whether the comments stay comments, become part of the page, or are left out. The file is checked before it is handed to you.",
    },
  ],
  options: [
    {
      term: "Highlight, underline, strike out, squiggle",
      detail:
        "These lie on the words themselves, so they follow the text line by line and stay sharp at any zoom. They are the PDF's own kinds of mark, so other PDF programs show them too, and those with a list of comments list them there. Keys: H, U, S and W.",
    },
    {
      term: "Highlighter pen",
      detail:
        "A wide see-through stroke, for scans and for anything that is not text: a figure, a signature, a part of a drawing. Three thicknesses. Key: P.",
    },
    {
      term: "Notes and replies",
      detail:
        "A note is a small icon on the page with words in the list. Anyone who opens the file can read it and reply. Replies are kept under the comment they answer, with who wrote them and when. Key: N.",
    },
    {
      term: "Your name",
      detail:
        "Typed once at the top of the list, it signs the comments you make from then on. It is kept on this device only and can be left empty: comments are then not signed.",
    },
    {
      term: "Comments a file already has",
      detail:
        "They are listed with yours and can be read, answered and deleted. Marks on words, notes and pen strokes can be given another colour. Other kinds, such as a stamp or a call-out made in another program, keep the look they came with.",
    },
    {
      term: "Keep as comments, part of the page, or leave out",
      detail:
        "Kept, comments stay separate from the page: they can be hidden, answered and removed in any program. As part of the page, marks are drawn into it for good, which is right for a final copy; a note keeps its icon, and its words are no longer shown. Left out, the download has no comments at all.",
    },
    {
      term: "Find in comments",
      detail:
        "Type a word to see only the comments that hold it, in what they say, the words they mark, their replies or their author.",
    },
    {
      term: "Undo, and leaving",
      detail:
        "Every mark, note, reply and deletion can be undone with Ctrl or ⌘ Z. The file lives in this tab only; closing it with changes that were not downloaded asks first.",
    },
  ],
  guideHref: "/blog/annotate-pdfs-without-uploading/",
}

const signing: TutorialContent = {
  name: "How to sign a PDF with KeepSimp",
  description:
    "Sign a PDF in your browser: draw your signature, type it or use a picture of it, place it on the page, fill in the blanks and the date, and download. Nothing is uploaded.",
  intro: "Follow the steps below. Every option is explained underneath.",
  steps: [
    {
      title: "Open the PDF",
      text: "Drop the PDF, choose it from your device or paste it. A locked file asks for its password. The signature window opens as soon as the file does.",
    },
    {
      title: "Make your signature",
      text: "Draw it on the line with a mouse, a pen or a finger. Or type your name and pick one of four hands. Or choose a photo of your signature on paper: the paper is taken out and only the ink is kept.",
    },
    {
      title: "Place it",
      text: "Press Place it on the page. The signature lands in the middle of the page you are reading; drag it to the line and pull a corner to size it. Go to another page and press Sign again for the next one.",
    },
    {
      title: "Fill in the rest",
      text: "The text tool types into the blanks of a form. The tick tool marks its boxes with a tick, a cross or a dot. The calendar button adds today's date.",
    },
    {
      title: "Download",
      text: "Press Download. What you added becomes part of the page, the file is read back and checked, and your browser saves it.",
    },
  ],
  options: [
    {
      term: "Draw",
      detail:
        "A pad to sign on, in black or blue ink. It is kept as lines, not as a picture, so it stays sharp at any size and adds almost nothing to the file. Clear starts again.",
    },
    {
      term: "Type",
      detail:
        "Your name in one of four fonts that look written by hand: Great Vibes, Sacramento, Kalam and La Belle Aurore. The font is put into the file, cut down to the letters of your name.",
    },
    {
      term: "Picture",
      detail:
        "A photo or scan of your signature on light paper, as PNG, JPEG or WebP. The paper is made see-through and the picture is cut to the ink, so it sits on a form without a white patch around it. If no ink can be told from the paper, the window says so.",
    },
    {
      term: "Initials",
      detail:
        "The same three ways, for the smaller mark that goes at the foot of each page. Signature and initials are remembered apart.",
    },
    {
      term: "Remember it on this device",
      detail:
        "Off unless you turn it on, each time. On, the signature is kept in this browser's own storage for the next time you sign, on this device only. It is never sent anywhere. Forget it removes it. Do not turn it on at a computer other people use.",
    },
    {
      term: "What kind of signature this is",
      detail:
        "A picture or drawing of your signature placed on the page, as you would sign paper. That is what most forms and letters ask for. It is not a digital signature made with a certificate, which proves who signed and that the file has not changed since; that is planned for a later version.",
    },
    {
      term: "Ticks, crosses and dots",
      detail:
        "For the boxes and circles of a paper form. Choose the mark, then press each box; the tool stays in hand. A mark can be moved and resized afterwards like anything else. Key: X.",
    },
    {
      term: "Today's date",
      detail:
        "Written the way your device writes dates, as a text box you can move, restyle or retype.",
    },
    {
      term: "All tools",
      detail:
        "This page is the PDF editor, opened for signing. All tools shows the rest: pictures, shapes, stamps, highlights and notes.",
    },
  ],
  guideHref: "/blog/sign-pdfs-without-uploading/",
}

export function PdfSignerTutorial() {
  return <ToolTutorial content={signing} />
}

export function PdfEditorTutorial() {
  return <ToolTutorial content={content} />
}

export function PdfAnnotatorTutorial() {
  return <ToolTutorial content={annotating} />
}
