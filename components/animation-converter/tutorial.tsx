import { ToolTutorial, type TutorialContent } from "@/components/tool-tutorial"

const content: TutorialContent = {
  name: "How to use the KeepSimp animation converter",
  description:
    "Convert animated GIF, WebP and APNG files in your browser, with trimming, speed, looping and a frame-by-frame comparison.",
  intro: "Follow these steps. Every option is explained underneath.",
  steps: [
    {
      title: "Add your animations",
      text: "Drop up to 20 animated GIF, APNG or WebP files, choose them, paste with ⌘V or Ctrl+V, or try the samples.",
    },
    {
      title: "Pick a format",
      text: "WebP for small files on the web, GIF to play everywhere, APNG for exact colour and soft transparency.",
    },
    {
      title: "Keep the part you want",
      text: "Drag the two handles on the strip of frames, or type a start and an end. Trimming applies to the selected animation only.",
    },
    {
      title: "Set speed, frame rate and looping",
      text: "Speed it up or slow it down, drop frames for a smaller file, reverse it, make a boomerang, and choose how many times it plays.",
    },
    {
      title: "Check a frame",
      text: "Pause the preview, step to any frame and drag the slider across the original and the result.",
    },
    {
      title: "Download",
      text: "Download one file or the whole batch as a ZIP. The facts line shows the size and how much smaller it is.",
    },
  ],
  options: [
    {
      term: "Which format should I choose?",
      detail:
        "WebP is the best default for web pages: full colour, transparency and far smaller than GIF. GIF plays in every app, email client and chat, but holds only 256 colours. APNG keeps exact colour and smooth transparency, with larger files, and shows its first frame where animation is not supported.",
    },
    {
      term: "GIF encoder",
      detail:
        "Fast picks one set of colours for the whole animation and stores only what changes between frames. Best uses gifski, which gives every frame its own colours for the smoothest result; it is much slower and is used for shorter or smaller animations.",
    },
    {
      term: "Quality",
      detail:
        "High keeps the most detail. Balanced is a sensible default. Small file uses fewer colours or stronger compression. Lossless keeps every pixel in WebP and APNG; GIF cannot be lossless. Custom sets the encoder quality, or the number of colours for GIF and APNG.",
    },
    {
      term: "Trim",
      detail:
        "Keeps the part of the selected animation between the two handles. Each animation in a batch has its own trim.",
    },
    {
      term: "Speed and frames per second",
      detail:
        "Speed changes how long each frame shows. A frame rate limit drops frames while keeping the length, which is the quickest way to shrink a file; it never adds frames.",
    },
    {
      term: "Reverse, boomerang and loop",
      detail:
        "Reverse plays backwards. Boomerang plays forwards then backwards so the loop has no jump. Loop sets how many times the animation plays: forever, once or a number.",
    },
    {
      term: "Size, rotate and flip",
      detail:
        "Set a width, height, longest side or percentage; proportions are kept. Results can be up to 1,920 px on the longest side.",
    },
    {
      term: "Background",
      detail:
        "See-through areas are kept by default. GIF pixels are either solid or clear, so soft edges turn hard; filling the background with a colour avoids that.",
    },
    {
      term: "Limits and privacy",
      detail:
        "Up to 20 animations per batch, 100 MB each. Long animations at large sizes may need trimming or a lower frame rate. Everything runs in your browser; files are not uploaded.",
    },
  ],
  guideHref: "/blog/jpeg-png-webp-which-format/",
}

export function AnimationConverterTutorial() {
  return <ToolTutorial content={content} />
}
