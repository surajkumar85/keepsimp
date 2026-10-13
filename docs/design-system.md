# KeepSimp design reference

Version 4.2 · marketing, functional dashboard, chips, image comparison, batch tools, result tables, JSON workspace, animation player, adjustment sliders, document lists, page grids, dialogs, the document reader, page boards, category colours the search in the top bar and interactive color pickers · updated 13 October 2026 · applies to every future implementation. Token version 4 adds five category colours and two shadows.

KeepSimp combines the requested shadcn preset with Airbnb-informed clarity, spacing, hierarchy, and human language. The exact numbers below are **KeepSimp decisions**, not an official Airbnb token export. Airbnb's public references reviewed here do not provide a complete numerical radius specification. We retain our own teal identity and fonts.

## Research and scope

Airbnb's published design language emphasizes unified, universal, iconic, and conversational design. Its foundation covers typography, color, icons, spacing, and information architecture. We apply those principles through shared components, clear navigation, restrained decoration, and friendly labels. [Airbnb Design: Building a Visual Language](https://medium.com/airbnb-design/building-a-visual-language-behind-the-scenes-of-our-airbnb-design-system-224748775e4e)

Airbnb's typography article describes a bespoke Cereal family and central semantic text styles. KeepSimp follows the shared-style principle using the preset's Inter, Outfit, and Geist Mono. Cereal is not included or licensed through this project. Fonts ship locally from Fontsource packages; builds and browser rendering need no Google Fonts request. [Airbnb Design: Working Type](https://medium.com/airbnb-design/working-type-81294544608b)

Airbnb describes WCAG 2.1 AA work, keyboard navigation, contrast, responsive layouts, text zoom, and reduced-motion support. These inform our acceptance criteria. Automated axe scans support evaluation but do not prove full WCAG conformance; manual keyboard, zoom, and screen-reader reviews remain part of each tool's release. [Airbnb accessibility](https://www.airbnb.com/accessibility/)

Airbnb's 2025 redesign was described by its designers as "fun, alive, and simple": playful icons that are "a universal language", more curved edges and gentle motion, with the new features kept out of the way of the main job. KeepSimp takes the same direction for its dashboard: a colour and an icon of its own for each kind of tool, cards that answer the pointer with a small lift, and one search in the top bar. The colours and numbers are KeepSimp's own. [It's Nice That: Airbnb's redesign](https://www.itsnicethat.com/articles/airbnb-app-redesign-140525)

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

Five category colours give each kind of tool its own: `category-video` (rose), `category-audio` (violet), `category-image` (orange), `category-document` (blue) and `category-developer` (green), each with a lighter value for the dark theme. They are for a tool's icon, its category label and what its card takes on under the pointer, and for the category icons in the sidebar. As text they meet 4.5:1 on `background` and `card`. An icon tile is the colour at 12% under an icon in the full colour; never put text on that fill, where the contrast falls short. Colour is kept for what can be used: a tool that is not built yet gets a `muted` tile. Brand actions stay teal (`primary`); category colours never mark a button, a selection or an error.

Use a 1px border to group surfaces. Two shadows exist beside `--shadow-card: none`: `--shadow-card-hover` under a card that leads somewhere while the pointer or the keyboard is on it, and `--shadow-search` under the search pill. Compact tool cards use `--shadow-card: none` and a quiet 1px border. Use shadows to communicate elevation; avoid oversized glows and competing gradients. Errors use `destructive` plus explanatory text and an icon, so color is never the only cue.

## Spacing and layout

The base unit is 4px. Prefer 8, 12, 16, 20, 24, 32, 40, 48, and 64px spacing. Card interiors use 16px, grid gaps 12px, and section gaps 24px. Page padding is 16px on mobile and 24px on desktop. Main content is capped at 1280px.

Sidebar-01 provides one 224px desktop navigation panel without an additional icon rail. The main header is 56px high. Collapsing the sidebar hides the panel completely; it remains out of the keyboard tab order while hidden. Below 768px it becomes one 256px modal sheet with full navigation. The sheet has a close button, Escape dismissal, focus containment, and return to the trigger. Tool cards progress from one to two to three columns as available width increases. Do not hide essential actions on mobile or allow page-width overflow.

The dashboard uses a short, flat introduction rather than a large hero panel. Tools are shown in two groups under small headings: "Ready to use" first, then "Coming soon". Tool cards (`components/tool-catalogue.tsx`) use a 12px radius, 16px padding, a 40px `rounded-lg` icon tile with the tool's own icon (`components/tool-icon.tsx`), the category as a 12px label in its colour, a 16px title and a 14px description.

- A card that leads somewhere is one link over the whole card. Under the pointer it rises 2px, takes its category's colour on the border and a 4% wash of it, gains `--shadow-card-hover`, its icon grows a little and its arrow moves up and to the right, all over 200ms. A press puts it back down. From the keyboard the whole card takes the focus ring. With reduced motion nothing moves.
- A card for a tool that is not built yet has a dashed border, a grey tile, no arrow and no link. Its group's heading says "Coming soon"; no badge is needed.
- Cards settle into place one after another when the page opens (a 16px rise over 200ms, 30ms apart). The rise never changes opacity, so text keeps its contrast throughout.

Do not restore large empty card headers, oversized badges, or a second navigation panel in later phases. Exact layout dimensions are recorded under `layout` in the token file.

The search (`components/tool-search.tsx`) lives in the middle of the header on every workspace page. It is a pill, 36px high and at most 384px wide, with a search icon, "Search tools" and the shortcut in a small key cap; below 640px it is a round 44px button with the icon alone. Pressing it, or ⌘K on a Mac and Ctrl+K elsewhere, opens a dialog 12% down the screen with a field and a list of every tool, working tools first: the tool's icon, its name and description, and its category in colour or "Coming soon". Typing narrows the list; arrow keys, Home and End move between tools that can be opened; Enter opens one; Escape closes and gives focus back to the pill. Tools that are not built are listed but cannot be chosen. The field is a combobox that names the chosen tool with `aria-activedescendant`, and the number of results is said to screen readers. The dialog is capped at 640px and the results at 480px, with smaller bounds derived from the dynamic viewport so the bottom stays visible on short and mobile screens. The search field and keyboard hints stay fixed while the result list scrolls, with contained overscroll and reserved scrollbar space. The dashboard has no second search field.

### Marketing pages

The homepage is a separate landing page, with the workspace moved to `/dashboard/`. Landing, blog and privacy routes use a shared marketing header/footer without a sidebar. Width is capped at 1152px, with 24px desktop gutters and 16px mobile gutters. The header is 72px high. Sections use 88px vertical padding on desktop and 56px on mobile; this storytelling layout does not change workspace density.

Use `marketing-surface` for a quiet warm background in light mode and a subdued teal charcoal in dark mode. Outfit display headings use 72/76px desktop and 44/48px mobile. Marketing section headings use 40/46px desktop and 32/38px mobile. Explanatory text uses 16px and supporting copy 14px. Hero actions use the existing 48px large button; header actions retain 44px targets.

Use optimized original local imagery with responsive static AVIF sources and WebP fallbacks. Load hero imagery eagerly with high fetch priority. Marketing links disable automatic prefetch to avoid eager tool downloads and interrupted background requests during rapid Safari navigation. Use accurate live demonstrations. The sample processes a real image and reports measured sizes; never hardcode a savings percentage. Ready tools are linked; future tools remain marked as coming soon. Avoid fabricated testimonials, user counts, ratings and supported formats. Blog illustrations and exported sharing graphics may carry fixed artwork colors; live product styles use semantic tokens.

Entry animations are finite; processing animation starts on a user action and stops with the operation. Reduced-motion styles apply to all movement. Essential copy is rendered in static HTML and stays visible with scripts disabled; animation must not conceal it. Native `details` elements provide keyboard-operable FAQ disclosure.

## Typography and icons

### Brand logo

The KeepSimp logo uses a white modular K inside a rounded teal tile, paired with an Outfit SemiBold wordmark. The stem and folded arms form a compact, recognizable mark at small sizes. The SVG wordmark is outlined, so exported files need no font download or installation.

`public/brand/keepsimp-logo.svg` is the primary horizontal logo; `keepsimp-logo-dark.svg` has a light wordmark for dark surfaces. `keepsimp-mark.svg` is the square symbol, also used by `public/icon.svg` as the favicon. Keep the transparent outer background, original proportions, and at least one stem-width of clear space. Use the full logo at a minimum height of 24px and the mark alone at a minimum of 16px. The sidebar uses a 28px-high horizontal logo with the home link providing its accessible name.

The mark's fixed teal is the sRGB export of the light primary token (`#00786f`); wordmarks use the exported foreground values (`#0a0a0a` and `#fafafa`). These literals belong only in exported brand assets. Product UI continues to use semantic color tokens. Do not stretch the artwork, add shadows/gradients, recreate it with a generic sparkle icon, or alter its geometry in later phases. Outfit's license remains in `public/licenses/outfit.txt`.

Home-screen icons in `public/icons/` are exports of the mark, made by `npm run pwa:icons`. The maskable and Apple versions extend the teal tile to a full square and leave the K unchanged, because launchers cut their own shape. `lib/pwa.ts` holds the only other colour literals: the sRGB values of the light and dark `background` tokens (`#ffffff`, `#0a0a0a`) for the web manifest and the `theme-color` tag, which cannot read CSS variables. Update them if those tokens change. See `docs/pwa.md`.

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
- Respect system theme initially and persist explicit theme choice locally. The theme toggle has an accessible name. No global single-letter shortcuts; sidebar's modifier shortcut ignores text entry. The search's shortcut (⌘K on a Mac, Ctrl+K elsewhere) works while typing as well, since it types nothing; on a Mac, Ctrl+K is left to text editors, which use it to delete to the end of a line.
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

Batch lists are `rounded-xl` rows with a 48px thumbnail, the file name, facts and a status line with an icon for progress or errors. The selected row takes the `primary` border. Row actions are icon buttons with accessible names. A summary card above the list carries totals and the primary download action. Reuse `components/image-batch/` (`queue-list`, `summary-bar`, `controls`) rather than rebuilding these per tool; an output in a row may carry a short label such as its format or width.

Result tables compare measured outcomes, such as one image encoded in several formats (`components/image-converter/format-panel.tsx`). Use a real `<table>` with a caption and column headers inside a `rounded-lg` border, with horizontal scrolling inside the wrapper at narrow widths. Sort by the value being compared, mark the best row with a text badge, never colour alone, and give each row one compact action. Show only measured values, and show progress with a cancel action while they are produced.

Animation previews (`components/animation-converter/player.tsx`) have two states. Playing shows the file itself in the checkerboard stage, as the browser plays it. Paused shows one frame under the before/after slider. Below the stage sit three icon buttons (previous frame, play or pause as the `primary` button, next frame) at 44px/36px, a position bar and a monospace readout of time and frame. Previews start paused when the visitor asks for reduced motion.

Trim bars (`components/animation-converter/trim-bar.tsx`) draw a strip of frames in a `rounded-lg` border with two `primary` handles built on Base UI `Slider`. What is cut away is dimmed with a `background` veil. Handles are 12px wide with a 44px/36px hit area, answer to the arrow keys, Home and End, and announce their time in seconds. Exact start and end fields sit below, with a status line saying how much is kept.

Reorderable lists (`components/animation-converter/frame-list.tsx`) are ordered lists of `rounded-lg` rows with a position number, a 48px thumbnail, the name, the row's own field and icon buttons. Every row has "move earlier" and "move later" buttons with the position in their accessible names, so reordering never depends on dragging; dragging is an extra. The buttons at either end are disabled, not hidden. Long lists scroll inside a fixed maximum height.

Adjustment sliders (`components/animation-converter/effects-panel.tsx`) are native range inputs with the `primary` accent, 44px/36px tall, for values a person tunes by eye, such as brightness. The label carries the current value in monospace with its sign, a neutral value sits in the middle of the track, and one "Reset" button appears only while something is changed. Use chips, not a slider, when there are a handful of sensible values (fade lengths, text sizes). Options that only matter once something is present, such as text colour before any text is typed or a logo's position before a logo is added, stay hidden until then; the fields that reveal them are always visible and labelled.

Document lists (`components/pdf-merger/file-list.tsx`) follow the reorderable-list rules for files that become one result. A row is a `rounded-xl` card with its position, a 64px picture of the first page, the name, facts, the row's own field and its icon buttons, which carry the file's name in their accessible names. What the page has to say about a file (repaired, unlocked, a signature that cannot be kept) sits in the row as muted text with an information icon; a file that cannot be used takes the `destructive` border and says it is left out. A locked file's row holds its own password form: a labelled password field, an "Unlock" button and a hint that turns into an alert when the password is wrong. Passwords are never stored.

Results that are built on request (`components/pdf-merger/pdf-merger.tsx`) use one card: a line saying what would be made, a `lg` primary button to make it, then in the same place a progress bar with a cancel button, then the facts of the result with a `lg` primary download and an outline "open" action. A change that makes the result out of date puts the build button back with a sentence saying why. Use this instead of converting on every change when a result is slow or large to make.

Page grids (`components/pdf-merger/page-grid.tsx`) show many items that are selected and rearranged together. Tiles are `rounded-lg` cards in an auto-filling grid (120px at the narrowest), each a single toggle button with a picture, its position in monospace and a one-line source. A selected tile takes the `primary` border and ring and a check badge, so selection never rests on colour alone, and reports `aria-pressed`. One tile is in the tab order; arrow keys move between tiles. A toolbar above the grid (`role="toolbar"`) carries the selection count, "Select all", "Clear" and one icon button per action, grouped with dividers; every action that dragging or a key can do has a button, because touch screens have neither. Buttons that need a selection are disabled without one, never hidden. Dragging shows where the pages will land with a `primary` bar beside the tile. Every change is put into a polite live region in words ("Moved 2 pages later. Now at position 2 of 5."), and can be undone. Pictures are drawn only for tiles near the screen. A large view of an item opens in the document reader.

Dialogs (`components/ui/dialog.tsx`) are Base UI `Dialog` windows over a `black/40` veil: a centred `rounded-2xl` card with a 1px border, at most 512px wide, with a title, an optional description and a close button. They trap focus, close on Escape, and give focus back to the control that opened them. Pass that control as `finalFocus` when it is a button: Safari does not focus a button that is clicked, so "whatever had focus before" is not enough. Use a dialog for something that needs the whole of a person's attention; use the side `Sheet` for navigation and short forms.

The document reader (`components/pdf-reader/`) is a dialog that fills the screen on a phone and leaves a 16px margin from 640px up. It has three parts.

- **A toolbar** of ghost icon buttons at 44px/36px, each with an accessible name and a matching `title`: the side panel, the title with one line under it, a page field with "of N", zoom out and in around a monospace percentage, fit the width, fit the whole page, turn the view, search and close. Buttons that hold a state report `aria-pressed`. On a phone the title and close button take the first row and the controls the second; "fit the whole page" and the percentage are left out there.
- **A side panel**, 208px wide beside the pages from 768px and a 224px layer over them below that, with two tabs: a strip of small pages (the one being read takes the `primary` ring and `aria-current`) and the file's bookmarks as a nested list with page numbers in monospace.
- **The pages**, one column on the `muted` surface, each a white sheet with a hairline ring and `shadow-md`, 16px apart. The column is one focusable group, so arrow keys, Page Up and Down, Home and End scroll it; `+` and `-` zoom only while focus is inside the reader, and Ctrl/Cmd+F opens the search. The search row sits under the toolbar: a field, a polite status ("3 of 17", "No matches", "No text to search"), previous, next and close. Matches are marked with `primary/25` and the one being looked at with `primary/60`, multiplied over the page, which is always light.

Only the sheets near the screen exist, and each is drawn for the size it is shown at. Text is laid over the picture, unseen, so it can be selected, copied and read out. A tool may add one action for the page being read (the splitter's "Cut after page 5"): an outline button with an icon that turns `primary` and reports `aria-pressed` while it is in force, with its words shown from 1280px.

Page boards (`components/pdf-splitter/page-board.tsx`) show the pages of one file in order, where the order cannot change. Tiles follow the page-grid rules: a `rounded-lg` card with a picture, the page number in monospace and a short line saying where the page goes. Between two tiles sits a cut control, 44px wide on a phone and 28px on a computer: a dashed line and a scissors badge that become a solid `primary` line and a filled badge once cut, with `aria-pressed` and the page in its name. Cut controls are out of the tab order; the tile before one cuts with S, and a line of helper text says so. Neighbouring groups take turns between `card` and `muted`, and every tile also says its group in words, so groups never rest on colour alone. A page that goes nowhere keeps its text at full contrast: its border turns dashed and only its picture is dimmed. Never fade text with opacity to show that something is left out.

Lists of results to be made (`components/pdf-splitter/parts-list.tsx`) are ordered lists of `rounded-lg` rows: what the row holds, a switch that leaves it out (the row then takes a dashed border and the `muted` tint and says "left out"), a name field whose placeholder is the name it would get, and, once made, its size with outline "Read" and "Download" actions. Long lists show the first hundred rows and say how many more there are.

When a document list holds several files and one of them is shown in detail below (`components/pdf-splitter/file-rows.tsx`), the shown row takes the `primary` border and ring and says "shown below"; its name is a button with `aria-pressed`, padded to a 44px hit area without moving the line. Each row carries one muted line saying what will be made of the file, which turns `destructive` and says "It is left out" when the file cannot take part.

Area pickers (`AreaPicker` in `components/pdf-splitter/scan-panel.tsx`) mark part of a picture. The picture sits on the `muted` surface with a crosshair cursor; the marked area is a `primary` 2px border over a `primary/15` fill. Dragging is never the only way: buttons offer the usual places, four labelled fields take the edges in percent and are applied together when the group is left or Enter is pressed, and a line under the fields says so. A line below says what the area holds on the page shown.

A value that is costly to apply (the cut line in `HalvePanel`) uses the adjustment-slider rules with one change: the label shows the value while the slider moves, and the change is applied when the slider is let go, on pointer up, key up or blur.

Breakdowns (`components/pdf-compressor/audit-card.tsx`) show what a whole is made of: one 12px bar with a pill radius, cut into parts with a hairline gap, and under it a list with a dot of the same shade, the name, the size in tabular figures and the share in medium weight. Parts are shaded with `chart-5` to `chart-1`, darkest for the largest; what cannot be told apart is `muted-foreground` at 40%. The bar is an image whose name lists every part with its percentage, so the list and the bar say the same thing. Category colours are not used here.

A page compared before and after (`components/pdf-compressor/compare-view.tsx`) reuses the comparison slider of the image compressor, with ghost icon buttons to step through pages around "Page 2 of 14" in tabular figures. Pages that need a look are offered as chips with `aria-pressed`. A headline number (the saving) is set in the heading face at `text-3xl`, with the sizes it is made of on the line below.

Lists to tick (the bookmarks in `components/pdf-splitter/rules-panel.tsx`) are a `fieldset` with its count in the legend and "Tick all" and "Untick all" beside it, holding rows of native checkboxes with the `primary` accent. The whole row is the label, at least 44px/36px tall, with the title on the left and a monospace number on the right, inside a `rounded-lg` border that scrolls after 288px.

Crop overlays dim the excluded area with a `background` veil, show rule-of-thirds guides and eight handles with 44px/28px hit areas, and pair the box with exact pixel fields. The image compressor reference is `docs/image-compressor.md`.

An editor laid over a document (`components/pdf-editor/`) adds two rows under the reader's bar. The first holds undo and redo, a hairline, and the tools as ghost icon buttons with `aria-pressed`, the one in hand on the `secondary` fill; each names its key in `title` and `aria-keyshortcuts`. The second is the look of what is selected, or of what the tool in hand will make: delete, duplicate and order first, then chips for the font, a size field, toggles, and swatches. Each row is one line of 44px/36px controls that scrolls sideways, and the second keeps its height when it has only a hint to show, so the pages never move when the selection changes. A swatch is a 24px/20px disc of the colour it gives inside a 44px/36px button, with a `primary` ring when it is the one in force. These are colours that go into the user's document, kept in `lib/pdf-editor/styles.ts` as numbers and set through `style`; they are not part of the interface's palette. A choice among a few words (a stamp's usual words, a unit) is a run of small ghost buttons with `aria-pressed`, the one in force on the `secondary` fill. A field in that row that changes what is selected (a stamp's own words, a scale) takes its value when it is left or Enter is pressed, never letter by letter, since every change is a step to undo.

What is selected on a page has a one-pixel `primary` frame and handles that are small white squares with a `primary` border (a circle turns), 9px for a mouse and 16px for a finger, whatever the zoom. The paper under them is white in both themes, so handles and the box being typed in are white too. While a thing is dragged, a dashed `primary` outline shows where it will land, and guides are `primary` hairlines across the page. A question that must be answered before something is thrown away (closing a file with changes) is asked in the card itself, as an `alertdialog` on the `destructive` tint with the two answers as buttons.

A list that belongs to a document (`components/pdf-editor/comments-panel.tsx`) is a 320px column on the `popover` surface to the right of the pages, and a sheet over their lower part (at most 60% of the height) below 768px. Its head holds a title with its count in muted figures, a close button and two labelled fields side by side; its body scrolls, grouped under small muted page headings. Each entry is a `rounded-lg` card that takes the `primary` border when it is the one picked, with a 12px disc of the comment's own colour, the name in medium weight over a muted line for who and when, the quoted words behind a 2px rule, a field for its words, replies behind the same rule, and a reply field with an outline icon button. Colours for marks are a second palette of six (`MARK_COLOURS`), lighter than the one for things, because words have to stay readable under them.

## JSON workspace

The JSON tool uses the shared Base UI `components/ui/workspace-tabs.tsx` with six wrapping tabs, 36px desktop and 44px mobile targets, `rounded-xl` grouping and `rounded-md` selected tabs. It remains inside the existing single-sidebar workspace. Format/minify/validate actions sit above the editors; optional transformations use a native disclosure rather than an always-expanded settings wall. All six workflows and essential actions remain available at 320px.

CodeMirror editors use semantic CSS variables, Geist Mono, `rounded-lg` borders and visible focus rings. Code is 13px with a 1.7 line height; labels/body copy retain the regular type scale. Source and populated result panes are 256px on mobile and 320px on desktop; an empty mobile result is 128px. Workflow settings follow the source and precede the result on mobile. Schema validation omits an unused result pane; its source and schema sit alongside each other on wide screens. Editor search fields and buttons have 44px mobile targets. Escape then Tab exits indentation mode. Results stay separate from the source, with explicit acceptance and undo.

Tree rows include type labels and named expansion controls; tables have captions and column headers, with scrolling confined to their wrappers. Syntax errors include line/column and a cursor action. Schema and query results are scoped to the current source and settings. Operation progress includes cancellation, and a worker timeout reports an incomplete operation. See [JSON workspace behavior and research](json-workspace.md). Blog illustrations use the documented fixed artwork palette; live editors do not add another theme or arbitrary radius.

## Adding components and changing the system

Reuse the existing shadcn primitives. This preset uses Base UI `render` composition, not Radix `asChild`. Review newly added registry components against these roles, especially radii, hit areas, focus, and contrast. Keep the same design on uploads, settings, progress, output previews, and downloads.

For an intentional system change: edit tokens, regenerate CSS, update this document and the gallery, adjust meaningful browser assertions, and run the checks. Do not silence failing checks to accommodate accidental drift. These rules keep future work consistent; they cannot guarantee that every later visual choice is correct without review.

## Verification

`npm run check` runs design checks, ESLint, a production static build, TypeScript, and unit coverage. `npm run test:e2e` tests the built output on Chromium, Firefox, WebKit, Android Chromium emulation, and iPhone WebKit emulation. Browser tests cover search/category behavior, sidebar operation, focus, theme persistence, axe scans in both themes, computed radii, reduced motion, overflow, runtime errors, and external requests.

Use browser tests for complete rendered flows. Pure logic belongs in unit tests; async server components are covered through browser journeys. [Next.js Vitest guide](https://nextjs.org/docs/app/guides/testing/vitest), [Next.js Playwright guide](https://nextjs.org/docs/app/guides/testing/playwright)

The marketing phase adds real image and JSON download journeys, metadata and sitemap validation, responsive marketing checks, article navigation, and accessibility scans. Unit coverage includes catalogue, image processing lifecycle, precision-preserving JSON formatting, SEO helpers and the image compressor's pure modules. Coverage refers to those modules, not every application component.

## Color utility data previews

The color utility shows common conversion formats first, with the remaining spaces in a native keyboard-operable disclosure. It uses seven wrapping Base UI workspace tabs and the existing compact cards and controls. Computed swatches, gradients and contrast samples represent document data and may use inline color values from `lib/color/`; these are not replacements for theme tokens. Keep all labels, buttons, errors and normal supporting text on semantic tokens. Deliberately failing contrast samples carry `data-color-preview` and are excluded from control accessibility scans. Company colors are sourced reference data, not KeepSimp brand tokens. The visual picker uses a 224px saturation/brightness area, full-width hue and opacity tracks with 44px/36px hit areas, named channel values and an Exact channels disclosure. Contrast and gradient fields open the same inline picker. Computed picker tracks are data previews; all labels and selected indicators stay on semantic surfaces. Swatch selections stay in their workflow, with a current-color bar and an explicit converter action. Company references use a visual chooser and one detailed palette. Palette exploration offers harmonies, tones and mixing in one panel. See [the color utility reference](color-utility.md) and [the interaction plan and research](color-experience.md) before changing these workflows.
