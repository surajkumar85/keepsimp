export type Brand = {
  name: string
  scope: string
  source: string
  checked: string
  colors: { name: string; value: string }[]
}
const brand = (
  name: string,
  scope: string,
  source: string,
  colors: [string, string][]
): Brand => ({
  name,
  scope,
  source,
  checked: "2026-10-13",
  colors: colors.map(([name, value]) => ({ name, value })),
})
/** Published values or exact vector/stylesheet values from the linked first-party resource. */
export const brands: readonly Brand[] = [
  brand(
    "Microsoft",
    "Selected values from Microsoft Fluent UI’s DefaultPalette. This is a product design palette, not the four-square corporate logo.",
    "https://github.com/microsoft/fluentui/blob/master/packages/theme/src/colors/DefaultPalette.ts",
    [
      ["Theme primary", "#0078d4"],
      ["Theme light", "#c7e0f4"],
      ["Neutral primary", "#323130"],
      ["Yellow", "#ffb900"],
      ["Green", "#107c10"],
    ]
  ),
  brand(
    "Anthropic",
    "Main and accent colors in Anthropic’s public brand guide.",
    "https://github.com/anthropics/skills/blob/main/skills/brand-guidelines/SKILL.md",
    [
      ["Dark", "#141413"],
      ["Light", "#faf9f5"],
      ["Mid gray", "#b0aea5"],
      ["Light gray", "#e8e6dc"],
      ["Orange", "#d97757"],
      ["Blue", "#6a9bcc"],
      ["Green", "#788c5d"],
    ]
  ),
  brand(
    "Google",
    "Core colors published for Google Assistant, reflecting Google’s palette.",
    "https://partnermarketinghub.withgoogle.com/brands/google-assistant/overview/color-palette-and-typography/",
    [
      ["Blue 500", "#4285f4"],
      ["Red 500", "#ea4335"],
      ["Yellow 500", "#fbbc04"],
      ["Green 500", "#34a853"],
      ["Google gray", "#3c4043"],
    ]
  ),
  brand(
    "Meta",
    "Selected gradient stops and wordmark fill read from the SVG linked by Meta’s brand page. These are logo samples, not a full UI palette.",
    "https://www.meta.com/brand/resources/meta/company-brand/",
    [
      ["Logo blue stop", "#0082fb"],
      ["Logo deep blue stop", "#0064df"],
      ["Wordmark", "#1c2b33"],
    ]
  ),
  brand(
    "Discord",
    "The three colors currently published on Discord’s brand page.",
    "https://discord.com/branding",
    [
      ["Blurple", "#5865f2"],
      ["Light blurple", "#e0e3ff"],
      ["Black", "#000000"],
    ]
  ),
  brand(
    "Slack",
    "Core colors in Slack’s September 2020 brand guide, page 24.",
    "https://a.slack-edge.com/4d5bb/marketing/img/media-kit/slack_brand_guidelines_september2020.pdf",
    [
      ["Aubergine", "#4a154b"],
      ["Blue", "#36c5f0"],
      ["Green", "#2eb67d"],
      ["Yellow", "#ecb22e"],
      ["Red", "#e01e5a"],
      ["Black", "#1d1c1d"],
    ]
  ),
  brand(
    "IBM",
    "Selected blues and neutrals from the IBM Design Language palette.",
    "https://www.ibm.com/design/language/color/",
    [
      ["Blue 60", "#0f62fe"],
      ["Blue 50", "#4589ff"],
      ["Blue 80", "#002d9c"],
      ["Gray 100", "#161616"],
      ["Gray 10", "#f4f4f4"],
    ]
  ),
  brand(
    "Linear",
    "The two wordmark colors published on Linear’s brand page. No inferred brand blue.",
    "https://linear.app/brand",
    [
      ["Mercury white", "#f4f5f8"],
      ["Nordic gray", "#222326"],
    ]
  ),
  brand(
    "Spotify",
    "Green and dark fill from colors.svg in Spotify’s developer design guide.",
    "https://developer.spotify.com/documentation/design",
    [
      ["Spotify green", "#1ed760"],
      ["Dark", "#121212"],
    ]
  ),
  brand(
    "Netflix",
    "Netflix Red, Symbol Dark Red and the black background from its 2020 symbol usage guide.",
    "https://assets.ctfassets.net/4cd45et68cgf/viVq3fhHa1cmQTo3g3p6i/e649362c86a78c3744beebc641e6ec19/2020_Netflix_Symbol_Logo_Guidance.pdf",
    [
      ["Netflix red", "#e50914"],
      ["Symbol dark red", "#b20710"],
      ["Black background", "#000000"],
    ]
  ),
  brand(
    "GitHub",
    "Selected current brand colors read from GitHub’s brand toolkit, including its green and neutral foundation.",
    "https://brand.github.com/foundations/color",
    [
      ["Green", "#0fbf3e"],
      ["Light neutral", "#f2f5f3"],
      ["Dark neutral", "#101411"],
      ["Purple", "#8534f3"],
      ["Blue", "#3094ff"],
    ]
  ),
  brand(
    "Vercel",
    "Blue swatch read from the Geist colors page, with its black and white brand foundation.",
    "https://vercel.com/geist/colors",
    [
      ["Geist blue", "#0b7bfe"],
      ["Black", "#000000"],
      ["White", "#ffffff"],
    ]
  ),
]
