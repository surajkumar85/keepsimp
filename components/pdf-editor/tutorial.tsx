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
      text: "The tools are in the row under the title: select, text, box, ellipse, line, arrow, draw, cover, and a button that adds a picture. Each has a letter on the keyboard, shown when you rest the pointer on it.",
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
      term: "Undo and redo",
      detail:
        "Everything can be undone, back to the file as you opened it, with Ctrl or ⌘ Z, and done again with Ctrl or ⌘ Shift Z. The buttons say what they would undo.",
    },
    {
      term: "Keyboard",
      detail:
        "Tab moves through the things on a page. Delete removes what is selected, Ctrl or ⌘ C, X, V and D copy, cut, paste and duplicate, and the square brackets move a thing forward or back. V, T, B, O, L, A, D and C choose a tool. Escape puts the tool down.",
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

export function PdfEditorTutorial() {
  return <ToolTutorial content={content} />
}
