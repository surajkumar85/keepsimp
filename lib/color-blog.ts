import type { BlogPost } from "./blog"
const base = {
  published: "2026-10-13T00:00:00+05:30",
  modified: "2026-10-13T00:00:00+05:30",
  category: "Colors",
  readingTime: "4 min read",
  tool: "color-utility",
}
export const colorPosts: readonly BlogPost[] = [
  {
    ...base,
    slug: "convert-hex-rgb-hsl-oklch",
    title: "One color. A code for every place.",
    searchTitle: "How to convert HEX, RGB, HSL and OKLCH colors online",
    description:
      "Convert colors between HEX, RGB, HSL, OKLCH and wide-gamut formats in your browser. Keep opacity, understand gamut changes and copy a useful code without uploading anything.",
    keywords: [
      "color converter",
      "HEX to RGB",
      "RGB to HEX",
      "HSL",
      "OKLCH",
      "Display P3",
      "CMYK",
    ],
    image: "/images/color-convert-guide.svg",
    imageAlt: "A teal swatch represented as HEX, RGB and OKLCH color values",
    intro:
      "A color copied from a design file may arrive as HEX, while a stylesheet uses RGB or OKLCH. KeepSimp gives you the same color in several forms, and tells you when a narrower color space needs a fallback.",
    sections: [
      {
        id: "paste",
        title: "Start with the value you have.",
        paragraphs: [
          "Open Color utility and paste one color into Convert. It reads short and long HEX values, including alpha; CSS color names; RGB, HSL, HWB, Lab, LCH, OKLab and OKLCH; and color() values such as Display P3, Rec. 2020 and XYZ. HSV or HSB and simple CMYK values can be entered too.",
          "The native picker and red, green, blue and opacity sliders let you adjust an sRGB color. The screen eyedropper appears only in browsers that support it, and needs your click. In other browsers, open From image to sample a local picture.",
        ],
        example: {
          label: "One opaque teal",
          code: "HEX: #00786f\nRGB: rgb(0 120 111)\nCopy the format your destination accepts.",
        },
      },
      {
        id: "range",
        title: "A different code can mean a smaller range.",
        paragraphs: [
          "HEX describes sRGB. Display P3 can represent some colors outside that range. For those, the tool marks HEX, RGB, HSL and HWB as sRGB fallbacks and maps the color into sRGB. The Lab, OKLCH and wider color-space representations keep the original coordinates.",
          "The on-page swatch uses that sRGB fallback so it agrees with the HEX you copy. Changing the RGB sliders also changes the fallback, so keep the original code if a wide-gamut color matters. A screen and browser can only show the range they support.",
        ],
      },
      {
        id: "alpha",
        title: "Keep transparency, and check the destination.",
        paragraphs: [
          "Eight-digit HEX and CSS color values carry opacity. HEX alpha is rounded to an eight-bit value; most other displayed representations use seven significant digits. HSV and CMYK leave alpha out, and the tool shows it separately.",
          "CMYK here is a simple mathematical conversion with no ICC printer profile. It cannot predict ink on a particular paper, match a spot color or provide a Pantone reference. Use the printer’s color-managed workflow for production print. Batch accepts up to 100 colors, one per line, and keeps errors beside the lines it cannot read.",
        ],
        links: [
          {
            label: "Open the color converter",
            href: "/dashboard/color-utility/",
          },
          {
            label: "Check how two colors read together",
            href: "/blog/check-color-contrast-wcag/",
          },
        ],
      },
    ],
    sources: [
      {
        title: "W3C: CSS Color Module Level 4",
        url: "https://www.w3.org/TR/css-color-4/",
      },
      {
        title: "Color.js: gamut mapping",
        url: "https://colorjs.io/docs/gamut-mapping.html",
      },
    ],
  },
  {
    ...base,
    slug: "check-color-contrast-wcag",
    title: "Colors that leave the words clear.",
    searchTitle: "How to check color contrast against WCAG AA and AAA",
    description:
      "Check text and background colors against WCAG contrast thresholds, including transparency. Find a passing text color and preview approximate color vision differences locally.",
    keywords: [
      "contrast checker",
      "WCAG",
      "AA contrast",
      "AAA contrast",
      "accessible colors",
      "color blindness",
      "text color",
    ],
    image: "/images/color-contrast-guide.svg",
    imageAlt:
      "Dark text on a warm light surface compared with a low contrast pair",
    intro:
      "A palette may look lovely while its words are hard to read. Contrast checks one part of that problem: how much lighter one color is than the other. KeepSimp lets you test the actual pair, with transparency included.",
    sections: [
      {
        id: "pair",
        title: "Choose the pair people will see.",
        paragraphs: [
          "In Contrast, enter the text color and background color. If either is transparent, choose the opaque canvas behind them. KeepSimp maps the colors into sRGB, composites the background over the canvas and the text over that background, then measures the contrast ratio.",
          "The preview deliberately shows the colors you entered, even when they fail. The pass and fail labels beside it use the unrounded ratio, so a displayed 4.50 cannot turn a value just below 4.5 into a pass.",
        ],
      },
      {
        id: "threshold",
        title: "Use the threshold for the job.",
        paragraphs: [
          "WCAG AA requires 4.5:1 for normal text and 3:1 for large text. AAA requires 7:1 for normal text and 4.5:1 for large text. Large means at least 18 points regular or 14 points bold. Required non-text contrast for relevant controls and graphical objects is 3:1.",
          "Choose a target and ask for a passing text color. The tool looks along the original color’s OKLCH lightness range, maps candidates to sRGB and checks the actual exported code. The suggestion is opaque; apply it explicitly before replacing your current text color.",
        ],
        example: {
          label: "A known reference pair",
          code: "Text: #000000\nBackground: #ffffff\nContrast ratio: 21:1",
        },
      },
      {
        id: "beyond",
        title: "A score is only one part of reading.",
        paragraphs: [
          "The protan, deutan and tritan previews apply the Machado 2009 model at full severity in linear sRGB. They are approximate simulations, not a diagnosis or a description of everyone’s vision. Grayscale helps you notice where a distinction relies only on hue.",
          "Color difference, ΔE2000, compares color coordinates without opacity. It does not measure text contrast. Keep labels, icons or patterns alongside color, and check focus, font size and keyboard access in the finished page. This tool tests pairs of colors, not an entire site’s accessibility.",
        ],
        links: [
          {
            label: "Open the contrast checker",
            href: "/dashboard/color-utility/",
          },
        ],
      },
    ],
    sources: [
      {
        title: "W3C: WCAG 2.2 contrast minimum",
        url: "https://www.w3.org/TR/WCAG22/#contrast-minimum",
      },
      {
        title: "Machado et al.: color vision simulation",
        url: "https://pubmed.ncbi.nlm.nih.gov/19834201/",
      },
    ],
  },
  {
    ...base,
    slug: "make-color-palettes-gradients",
    title: "From one swatch to a useful palette.",
    searchTitle: "How to make color palettes and CSS gradients from an image",
    description:
      "Build color harmonies and tonal scales, extract a palette from a local image, mix colors and make CSS gradients. Export CSS, JSON, design tokens, SVG or PNG from your browser.",
    keywords: [
      "palette generator",
      "image color picker",
      "gradient generator",
      "CSS gradient",
      "color harmony",
      "design tokens",
      "palette export",
    ],
    image: "/images/color-palette-guide.svg",
    imageAlt: "A series of teal tones and a teal-to-cream gradient",
    intro:
      "A useful palette needs more than a few attractive swatches. You need to know how they relate, whether their text reads clearly and how to take them into the next tool. KeepSimp keeps those steps together.",
    sections: [
      {
        id: "grow",
        title: "Start small, and keep the parts you like.",
        paragraphs: [
          "Add the current color to Palettes, or choose a complementary, analogous, split complement, triadic, tetradic or monochrome harmony. Hues rotate in OKLCH and the displayed swatches use an sRGB fallback. The light-to-dark scale changes OKLCH lightness and limits chroma; its labels are convenient names, not a promise to match another design system.",
          "Your palette holds up to twelve colors. Lock the ones you want to keep, shuffle the others, reorder with the arrow buttons and undo a palette change. A harmony can help you start; use Contrast to check each pair you intend to put together.",
        ],
      },
      {
        id: "image",
        title: "Borrow a few colors from your own image.",
        paragraphs: [
          "From image reads PNG, JPEG, WebP or GIF locally, up to 10 MiB and thirty million pixels. The browser resizes the preview to at most 256 pixels on a side and converts it to sRGB. Color sampling finds representative groups and skips pixels below fifty percent opacity, so it can miss small accents.",
          "Click the preview or type its pixel coordinates to sample one point, including its opacity. These coordinates belong to the resized preview, not the original file. GIF uses the frame decoded by the browser. Send the swatches to Palettes when you are ready; refreshing clears the image and palette.",
        ],
      },
      {
        id: "gradient",
        title: "Make the transition, then take it with you.",
        paragraphs: [
          "Gradients supports linear, radial and conic shapes, two to eight ordered stops and an angle where it applies. Choose sRGB, linear sRGB, OKLab or OKLCH interpolation. Stops at the same position create a hard edge. The CSS download has a sampled fallback followed by the modern interpolation syntax; the fallback approximates the transition between samples.",
          "Palettes exports CSS or SCSS variables, JSON, a Tailwind configuration fragment, Design Tokens JSON, GIMP palette text, SVG swatches or a PNG strip. Exports use the sRGB fallback. Opacity travels in the CSS, structured data, SVG and PNG; GIMP palette colors are opaque. Review imported tokens against the conventions of your destination.",
        ],
        links: [
          {
            label: "Open palettes and gradients",
            href: "/dashboard/color-utility/",
          },
          {
            label: "Check text contrast before using a palette",
            href: "/blog/check-color-contrast-wcag/",
          },
        ],
      },
    ],
    sources: [
      {
        title: "Color.js: interpolation and alpha",
        url: "https://colorjs.io/docs/interpolation",
      },
      {
        title: "Design Tokens Community Group: format",
        url: "https://www.designtokens.org/tr/drafts/format/",
      },
      {
        title: "MDN: canvas image data",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/getImageData",
      },
    ],
  },
  {
    ...base,
    slug: "company-brand-color-palettes",
    title: "A brand color, with its source beside it.",
    searchTitle:
      "Google, Meta and Anthropic brand color palettes and HEX codes",
    description:
      "Browse sourced company color palettes, copy HEX codes and CSS variables, or explore their contrast. See the scope of each reference, from published brand guides to logo samples.",
    keywords: [
      "brand colors",
      "Google colors",
      "Meta colors",
      "Anthropic colors",
      "Discord blurple",
      "Slack palette",
      "company HEX codes",
    ],
    image: "/images/color-brand-guide.svg",
    imageAlt:
      "Several company palette references represented as plain color swatches",
    intro:
      "A familiar company does not always have one permanent palette. A logo, a product interface and a campaign may use different colors. A useful reference tells you where the codes came from and what they describe.",
    sections: [
      {
        id: "source",
        title: "Look at the source as well as the swatch.",
        paragraphs: [
          "Brand colors includes Anthropic, Google, Meta, Discord, Slack, IBM, Linear, Spotify, Netflix, GitHub, Microsoft and Vercel. Each card links to a first-party resource and explains which colors were selected. References were checked on 13 October 2026 and are bundled with the tool, so browsing them does not fetch company assets.",
          "Anthropic’s entry follows its public brand guide. Google’s entry uses its published Google Assistant core palette. Discord’s current page lists Blurple, Light Blurple and Black; older lists elsewhere may describe a different release. Slack’s card explicitly names the September 2020 guide rather than claiming every Slack product uses those colors today.",
        ],
      },
      {
        id: "scope",
        title: "A logo sample is a particular reference.",
        paragraphs: [
          "Meta’s swatches include selected stops and the wordmark fill read from the vector asset on its brand page. Those stops describe part of a gradient logo, not a full Meta interface palette. Linear’s page publishes two wordmark colors, so the card keeps those instead of guessing a blue.",
          "Spotify’s values come from the colors.svg illustration in its developer design guide. GitHub’s entry uses selected values from its current brand toolkit, including its green foundation. Those details make the references easier to check when a brand changes.",
        ],
      },
      {
        id: "use",
        title: "Copy a code, then check its next job.",
        paragraphs: [
          "Pick a swatch to open it in Convert, copy its HEX code, copy a whole card as CSS variables or load it into your own palette to reorder and export. Check the pair in Contrast before using it for text or a control.",
          "These references do not imply endorsement, affiliation or permission to use a company’s identity. Read the linked brand guidance for use of marks and assets. KeepSimp displays plain names and swatches rather than recreating company logos.",
        ],
        links: [
          {
            label: "Browse the company color palettes",
            href: "/dashboard/color-utility/",
          },
        ],
      },
    ],
    sources: [
      {
        title: "Anthropic: public brand guide",
        url: "https://github.com/anthropics/skills/blob/main/skills/brand-guidelines/SKILL.md",
      },
      {
        title: "Google: palette and typography",
        url: "https://partnermarketinghub.withgoogle.com/brands/google-assistant/overview/color-palette-and-typography/",
      },
      {
        title: "Meta: company brand resources",
        url: "https://www.meta.com/brand/resources/meta/company-brand/",
      },
      {
        title: "Discord: published brand colors",
        url: "https://discord.com/branding",
      },
    ],
  },
]
