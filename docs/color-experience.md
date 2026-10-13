# Color experience redesign

The color engine already works. This phase changes how people explore it, without changing conversion, contrast, sampling or export algorithms. The existing design tokens, Base UI primitives, single sidebar and local-only data rules remain in force.

## Plan

1. Replace the small native picker with an inline saturation/brightness area, full-width hue and opacity tracks, exact channel fields and keyboard equivalents. Reuse the same picker beside contrast and gradient color fields. Preserve a hue while passing through gray or black; editing opacity alone must preserve wide-gamut coordinates.
2. Keep a selected swatch in the current workflow. Show the current color, a deliberate converter action and visible copy/selection feedback near the workspace tabs. A palette replacement still takes the user to Palettes because that is its explicit action.
3. Make palette exploration one focused panel with harmony, tones and mixing choices. Allow an individual palette color to be edited without rebuilding the palette. Show gradient stops visually and give the selected stop a position slider as well as exact fields.
4. Replace the long company-card wall with a visual company chooser and one detailed palette. Keep all twelve references, scope notes, first-party links and copy/load actions. Enlarge image sampling while retaining the actual bounded sampling canvas and coordinate path.
5. Update help and browser journeys. Verify numerical engine regressions, pointer/touch and keyboard picking, contextual selection, downloads, both themes, accessibility, narrow layouts and offline operation. Run the repository checks, inspect desktop/mobile screenshots and commit/push the verified change to main.

## Research and decisions

- [Adobe ColorArea](https://react-spectrum.adobe.com/v3/ColorArea.html) separates a two-dimensional color area from channel controls and labels its two channels. KeepSimp adopts that interaction pattern using its own components, native range inputs and visible exact fields; it does not install another UI system.
- [Figma's color-model guide](https://help.figma.com/hc/en-us/articles/360043042113-About-color-models) describes visual selection alongside explicit model values. KeepSimp keeps free CSS input and all existing output models next to the visual picker, with sRGB editing identified clearly.
- [W3C slider pattern](https://www.w3.org/WAI/ARIA/apg/patterns/slider/) defines named values and arrow/Home/End controls, and calls for testing touch assistive technology. Native hue/opacity and channel ranges provide those semantics; exact number fields offer another path. Automated device emulation does not establish physical screen-reader support.
- [WCAG dragging movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html) requires an alternative to dragging. The area also responds to a single click, two native channel sliders and exact fields. Gradient positions have labelled native ranges and number fields.

Area, track, swatch and gradient colors are computed document data. Their labels, selected indicators, feedback and action buttons retain semantic theme tokens. Use named radii and the existing 44px mobile / 36px desktop control sizes; no design token change is needed.

## Delivered and verified — 13 October 2026

The seven workflows retain the existing numerical engine, formats, export bounds, local image processing and brand provenance. The redesign adds the large shared picker, contextual selections with visible state, copy feedback, individual palette drafts with explicit application and focus return, focused palette exploration, visual stop choices, the company chooser and a larger image sampling stage with a point marker. The four existing guides describe these interactions. Design reference 4.2 records the pattern; token values remain unchanged.

- `npm run check -- -- --maxWorkers=1` passed design/format/lint, the production static build, typing and all 2,240 unit cases in 130 files. The 132 selected pure modules have 100% statements, branches, functions and lines covered. The initial parallel check was stopped after three existing PDF cases exceeded their time limits; the complete serial run passed without changing their tests or engines.
- After the final layout and focus refinements, design checks, lint, production build and typing passed again. All 65 color browser journeys (13 per profile) passed in the final Chrome, Firefox, WebKit, Pixel 7 and iPhone 13 emulation run. These cover real conversions/alpha/gamut, pointer dragging/touch/keyboard picking, hue retention, contextual selections, palette drafts and undo, every exploration mode, sourced brands, actual JSON/tokens/SVG/PNG/CSS downloads, contrast suggestions, real image pixels, batch errors, both-theme axe checks, 320px/reflow layouts and offline use with the server stopped.
- The wider foundation/marketing run had 151 passes, two existing phone keyboard skips and two failures. One was a new touch test targeting an offscreen area and was fixed by scrolling it into view; the final 65-case run covers it. The other was an existing iPhone marketing navigation timeout. Ten subsequent cross-profile palette-focus and marketing journeys all passed, including that timeout case. These are separate runs, not a claim that the original 155-case run was entirely green.
- Final desktop/mobile screenshots in both themes, company and palette views, expanded contrast/gradient pickers and actual image sampling were inspected. The theme checks use the product's theme button, including its transition handling, rather than mutating the root class. Pointer expectations allow screen-pixel rounding; exact channel/HEX assertions still check precise results.

OS screen-picker overlays, physical phones, manual assistive-technology sessions and calibrated displays remain outside this automated verification. Reports and screenshots stay outside Git. A dedicated production-preview port prevents another checkout's server from being mistaken for this build.
