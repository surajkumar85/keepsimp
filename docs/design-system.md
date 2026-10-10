# KeepSimp design reference

Version 3.2 · marketing, functional dashboard, chips, image comparison and batch tools · updated 10 October 2026 · applies to every future implementation. Tokens are unchanged from version 3.

KeepSimp combines the requested shadcn preset with Airbnb-informed clarity, spacing, hierarchy, and human language. The exact numbers below are **KeepSimp decisions**, not an official Airbnb token export. Airbnb's public references reviewed here do not provide a complete numerical radius specification. We retain our own teal identity and fonts.

## Research and scope

Airbnb's published design language emphasizes unified, universal, iconic, and conversational design. Its foundation covers typography, color, icons, spacing, and information architecture. We apply those principles through shared components, clear navigation, restrained decoration, and friendly labels. [Airbnb Design: Building a Visual Language](https://medium.com/airbnb-design/building-a-visual-language-behind-the-scenes-of-our-airbnb-design-system-224748775e4e)

Airbnb's typography article describes a bespoke Cereal family and central semantic text styles. KeepSimp follows the shared-style principle using the preset's Inter, Outfit, and Geist Mono. Cereal is not included or licensed through this project. Fonts ship locally from Fontsource packages; builds and browser rendering need no Google Fonts request. [Airbnb Design: Working Type](https://medium.com/airbnb-design/working-type-81294544608b)

Airbnb describes WCAG 2.1 AA work, keyboard navigation, contrast, responsive layouts, text zoom, and reduced-motion support. These inform our acceptance criteria. Automated axe scans support evaluation but do not prove full WCAG conformance; manual keyboard, zoom, and screen-reader reviews remain part of each tool's release. [Airbnb accessibility](https://www.airbnb.com/accessibility/)

The requested initialization was `npx shadcn@latest init --preset b2zSMmeGTw --template next`. The CLI needed a new directory, so it generated `keepsimp-starter` and its contents were moved into this repository. Then `npx shadcn@latest add sidebar-09` installed the two-panel block. The user subsequently requested a single sidebar and a more compact interface. The current layout follows sidebar-01's single-panel, grouped-menu structure using the existing Base UI primitives; sidebar-09's nested panels have been removed. [shadcn CLI](https://ui.shadcn.com/docs/cli), [sidebar-01](https://ui.shadcn.com/view/new-york-v4/sidebar-01), [shadcn sidebar composition](https://ui.shadcn.com/docs/components/base/sidebar)

## Source of truth

`design-system/tokens.json` owns numerical and semantic tokens. `scripts/design-tokens.mjs` generates `app/design-tokens.css`, imported by `app/globals.css`. The theme maps those variables into Tailwind utilities. `components.json` retains Base Nova, Base UI, neutral foundations, and Tabler icons.

The live `/design-system/` route shows radii, palettes, typography, and controls. Read this file and `AGENTS.md` before creating any screen. `npm run design:check` rejects generated-token drift and arbitrary product radii/colors. It is a useful guard, not a complete visual validator: generated primitives are exempt and complex CSS still needs review.

## Border radii

| Token | Exact value | Tailwind utility | Intended role                               |
| ----- | ----------- | ---------------- | ------------------------------------------- |
| sm    | 4px         | rounded-sm       | Small labels and interior details           |
| md    | 8px         | rounded-md       | Buttons, inputs, navigation items, tooltips |
| lg    | 12px        | rounded-lg       | Compact tool cards and nested surfaces      |
| xl    | 16px        | rounded-xl       | Feature panels and larger cards             |
| 2xl   | 24px        | rounded-2xl      | Dialogs and substantial panels              |
| 3xl   | 32px        | rounded-3xl      | Large hero surfaces                         |
| 4xl   | 48px        | rounded-4xl      | Exceptional large decorative surfaces only  |
| pill  | 9999px      | rounded-full     | Chips and pill-shaped calls to action       |

Use `rounded-none` for connected edges and full-height sheets. In a nested panel, use a smaller inner radius. Do not invent a new number per component. Existing registry primitives have some tiny internal shapes; normalize newly used components before shipping them. The visible Button/Input bases are already adapted to an 8px radius, 36px desktop height, and 44px mobile height.

## Color, border, and elevation

Use semantic classes: `bg-background`, `text-foreground`, `bg-card`, `bg-primary`, `text-primary-foreground`, `text-muted-foreground`, `border-border`, and `ring-ring`. Do not use literal hex colors or a new per-tool palette. Light mode uses white surfaces, dark text, neutral supporting surfaces, and the preset teal `oklch(0.511 0.096 186.391)`.

Dark mode uses charcoal surfaces and a brighter teal `oklch(0.704 0.14 182.503)` with dark foreground text. This intentionally adjusts the preset's dark primary for readable teal text and buttons. Muted text, form borders, and focus rings also receive contrast-oriented adjustments. All exact theme values live in the token file; no second palette should be maintained in components.

Use a 1px border to group surfaces. Compact tool cards use `--shadow-card: none` and a quiet 1px border. Use shadows to communicate elevation; avoid oversized glows and competing gradients. Errors use `destructive` plus explanatory text and an icon, so color is never the only cue.

## Spacing and layout

The base unit is 4px. Prefer 8, 12, 16, 20, 24, 32, 40, 48, and 64px spacing. Card interiors use 16px, grid gaps 12px, and section gaps 24px. Page padding is 16px on mobile and 24px on desktop. Main content is capped at 1280px.

Sidebar-01 provides one 224px desktop navigation panel without an additional icon rail. The main header is 56px high. Collapsing the sidebar hides the panel completely; it remains out of the keyboard tab order while hidden. Below 768px it becomes one 256px modal sheet with full navigation. The sheet has a close button, Escape dismissal, focus containment, and return to the trigger. Tool cards progress from one to two to three columns as available width increases. Do not hide essential actions on mobile or allow page-width overflow.

The dashboard uses a short, flat introduction rather than a large hero panel. Tool cards use a 12px radius, 16px padding, 32px icon tiles, 16px titles, and 14px descriptions. Do not restore large empty card headers, oversized badges, or a second navigation panel in later phases. Exact layout dimensions are recorded under `layout` in the token file.

### Marketing pages

The homepage is a separate landing page, with the workspace moved to `/dashboard/`. Landing, journal and privacy routes use a shared marketing header/footer without a sidebar. Width is capped at 1152px, with 24px desktop gutters and 16px mobile gutters. The header is 72px high. Sections use 88px vertical padding on desktop and 56px on mobile; this storytelling layout does not change workspace density.

Use `marketing-surface` for a quiet warm background in light mode and a subdued teal charcoal in dark mode. Outfit display headings use 72/76px desktop and 44/48px mobile. Marketing section headings use 40/46px desktop and 32/38px mobile. Explanatory text uses 16px and supporting copy 14px. Hero actions use the existing 48px large button; header actions retain 44px targets.

Use optimized original local imagery with responsive static AVIF sources and WebP fallbacks. Load hero imagery eagerly with high fetch priority. Marketing links disable automatic prefetch to avoid eager tool downloads and interrupted background requests during rapid Safari navigation. Use accurate live demonstrations. The sample processes a real image and reports measured sizes; never hardcode a savings percentage. Ready tools are linked; future tools remain marked as coming soon. Avoid fabricated testimonials, user counts, ratings and supported formats. Blog illustrations and exported sharing graphics may carry fixed artwork colors; live product styles use semantic tokens.

Entry animations are finite; processing animation starts on a user action and stops with the operation. Reduced-motion styles apply to all movement. Essential copy is rendered in static HTML and stays visible with scripts disabled; animation must not conceal it. Native `details` elements provide keyboard-operable FAQ disclosure.

## Typography and icons

### Brand logo

The KeepSimp logo uses a white modular K inside a rounded teal tile, paired with an Outfit SemiBold wordmark. The stem and folded arms form a compact, recognizable mark at small sizes. The SVG wordmark is outlined, so exported files need no font download or installation.

`public/brand/keepsimp-logo.svg` is the primary horizontal logo; `keepsimp-logo-dark.svg` has a light wordmark for dark surfaces. `keepsimp-mark.svg` is the square symbol, also used by `public/icon.svg` as the favicon. Keep the transparent outer background, original proportions, and at least one stem-width of clear space. Use the full logo at a minimum height of 24px and the mark alone at a minimum of 16px. The sidebar uses a 28px-high horizontal logo with the home link providing its accessible name.

The mark's fixed teal is the sRGB export of the light primary token (`#00786f`); wordmarks use the exported foreground values (`#0a0a0a` and `#fafafa`). These literals belong only in exported brand assets. Product UI continues to use semantic color tokens. Do not stretch the artwork, add shadows/gradients, recreate it with a generic sparkle icon, or alter its geometry in later phases. Outfit's license remains in `public/licenses/outfit.txt`.

### Interface typography

| Role                         | Family     | Size / line height          | Weight  |
| ---------------------------- | ---------- | --------------------------- | ------- |
| Page title                   | Outfit     | 28 / 34px; mobile 24 / 30px | 500     |
| Section title                | Outfit     | 20 / 28px                   | 500     |
| Card title                   | Outfit     | 16 / 24px                   | 500     |
| Body                         | Inter      | 14 / 20px                   | 400     |
| Supporting text and controls | Inter      | 14 / 20px                   | 400–500 |
| Labels / captions            | Inter      | 12 / 16px                   | 400–600 |
| Code / exact values          | Geist Mono | 14 / 20px                   | 400     |

Use `.page-title`, `.section-title`, and `.eyebrow` for their corresponding roles. Use sentence case, short labels, specific error messages, and calm language. Headings identify the next action or result, not technical architecture. Do not shrink essential body text below 14px; 12px is reserved for metadata.

Use Tabler outline icons, normally 20px with a 1.7 stroke. Hide decorative icons from assistive technology. Icon-only controls need an accessible name and a 36px desktop / 44px mobile hit area. Tooltips provide supplementary help; they never substitute for labels.

## Interaction and accessibility

- Default buttons, inputs, and navigation rows use 36px on desktop and 44px on mobile. Primary actions may use 48px. Preserve keyboard access and visible focus while using the documented compact density.
- Label every form control. Keep helper and error text near the field; use `aria-describedby` and `aria-invalid` as needed.
- Preserve visible keyboard focus. The global outline is 2px with a 3px offset; components may also use the semantic ring.
- Keep a skip link, heading hierarchy, landmarks, logical tab order, and a focus target for main content.
- Give the skip link an explicit `tabIndex={0}` so its first-Tab behavior is consistent in macOS WebKit as well as Chromium and Firefox. Keep negative tabindex only on programmatic focus targets, never on an essential interactive control. Safari also has a user setting for full keyboard navigation. [Apple Safari accessibility settings](https://support.apple.com/guide/safari/advanced-ibrw1075/mac)
- Respect system theme initially and persist explicit theme choice locally. The theme toggle has an accessible name. No global single-letter shortcuts; sidebar's modifier shortcut ignores text entry.
- Use 150ms for small feedback and 200ms for panels. Reduced-motion users receive essentially immediate transitions. No autoplay or infinite loading.
- Provide honest empty, error, progress, cancellation, and completion states. Never show a planned utility as an active processor.
- Before each tool release, test 320px layouts, 200% zoom, keyboard navigation, and manual assistive technology behavior in addition to automated checks.

## Choice chips, uploads and comparisons

Use `components/ui/choice-chips.tsx` when a visitor picks one option from a short list (about eight or fewer) and seeing every option at once helps them decide. It replaces native selects for formats, presets, sizes and aspect ratios. Chips use Base UI `RadioGroup`/`Radio`, so Tab enters the group and arrow keys move between options. Each group needs a label; hide it visually only when a heading directly above says the same thing. The shape is the pill radius, 36px high on desktop and 44px on mobile, with 12px horizontal padding and 14px medium text. The selected chip uses `primary` with `primary-foreground`. Unavailable chips stay visible, disabled at 50% opacity, with the reason in the helper text. Rows wrap; they never scroll horizontally. Static format badges use the same pill shape at 12px text and are not interactive.

File drop zones are `rounded-xl` cards with a 2px dashed border, a 48px `rounded-lg` icon tile tinted with `primary/10`, one heading and one primary action. Dragging a file over the zone switches to a `primary` border and `primary/5` fill, with a 1% lift that reduced motion removes. A labelled native file input sits behind the visible action, which shows its focus ring. After a file loads, the zone collapses to a compact file bar: thumbnail, name, facts, Replace and Remove.

Before/after comparisons stack the processed result over the original at identical pixel size. The result is revealed to the right of a divider with a 44px/36px `rounded-full` grip. A visually hidden native range input labelled "Comparison position" provides keyboard and screen-reader control. Transparent areas sit on the `.checkerboard` utility, built from `background` and `muted`. Corner labels are small pill tags. Progress shows as a pill at the bottom of the stage with a Cancel action; the previous result stays visible but dimmed until the new one arrives.

Use `components/ui/toggle-chips.tsx` when several options can be on at once, such as the widths of a responsive set. It shares the chip shape and sizes, uses Base UI `CheckboxGroup` (each chip is a Tab stop; Space toggles it) and shows a tick on selected chips so state never depends on colour alone.

Position grids (`components/image-resizer/anchor-grid.tsx`) offer nine labelled radio positions in a 3×3 block of 44px/36px cells inside a `rounded-lg` border. Use them to choose which part of a picture a crop keeps, or where a padded picture sits.

Frame previews draw the output to scale on the checkerboard, with pill tags for original and output size. When the picture is cropped or padded, the frame is focusable: dragging or arrow keys move the picture, and a line of helper text says so. Optional safe-area bands use a `foreground` veil with dashed edges.

Batch lists are `rounded-xl` rows with a 48px thumbnail, the file name, facts and a status line with an icon for progress or errors. The selected row takes the `primary` border. Row actions are icon buttons with accessible names. A summary card above the list carries totals and the primary download action.

Crop overlays dim the excluded area with a `background` veil, show rule-of-thirds guides and eight handles with 44px/28px hit areas, and pair the box with exact pixel fields. The image compressor reference is `docs/image-compressor.md`.

## Adding components and changing the system

Reuse the existing shadcn primitives. This preset uses Base UI `render` composition, not Radix `asChild`. Review newly added registry components against these roles, especially radii, hit areas, focus, and contrast. Keep the same design on uploads, settings, progress, output previews, and downloads.

For an intentional system change: edit tokens, regenerate CSS, update this document and the gallery, adjust meaningful browser assertions, and run the checks. Do not silence failing checks to accommodate accidental drift. These rules keep future work consistent; they cannot guarantee that every later visual choice is correct without review.

## Verification

`npm run check` runs design checks, ESLint, a production static build, TypeScript, and unit coverage. `npm run test:e2e` tests the built output on Chromium, Firefox, WebKit, Android Chromium emulation, and iPhone WebKit emulation. Browser tests cover search/category behavior, sidebar operation, focus, theme persistence, axe scans in both themes, computed radii, reduced motion, overflow, runtime errors, and external requests.

Use browser tests for complete rendered flows. Pure logic belongs in unit tests; async server components are covered through browser journeys. [Next.js Vitest guide](https://nextjs.org/docs/app/guides/testing/vitest), [Next.js Playwright guide](https://nextjs.org/docs/app/guides/testing/playwright)

The marketing phase adds real image and JSON download journeys, metadata and sitemap validation, responsive marketing checks, article navigation, and accessibility scans. Unit coverage includes catalogue, image processing lifecycle, precision-preserving JSON formatting, SEO helpers and the image compressor's pure modules. Coverage refers to those modules, not every application component.
