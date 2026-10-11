# Phase one: Next.js foundation

The current user request chooses Next.js over the earlier Astro proposal. The architecture remains a static, browser-first application: no file-processing backend, accounts, or paywalls. This phase establishes the interface and verification pipeline; actual utility engines are subsequent work.

## Delivered scope

- Next.js App Router with TypeScript strict mode, Tailwind 4, and npm lockfile.
- Requested shadcn `b2zSMmeGTw` preset; the current compact navigation follows sidebar-01. Sidebar-09 was installed originally and then replaced following user feedback.
- Responsive shell, local fonts, light/dark themes, accessible navigation, and a searchable planned-tool collection.
- Airbnb-informed persistent design reference, machine-readable tokens, generated CSS, drift checks, and agent instructions.
- Unit tests for live catalogue/URL/navigation logic, with full coverage required for that module.
- Production-output Playwright tests across five browser/device profiles, including axe accessibility scans.
- GitHub Actions configuration for design, lint, build, typing, unit coverage, and browser checks. The browser checks run as one job for each of the five profiles: in a single job they outgrew its time limit.

## Architecture and later phases

`app/` defines static routes and metadata. `components/` provides product UI, while `components/ui/` contains the customized shadcn primitives. `lib/catalogue.ts` currently owns planned tool metadata and pure discovery logic. The catalogue is an initial preview, not the final launch inventory.

Future tools should have typed manifests, small lazily loaded engines, dedicated workers for heavy processing, capability detection, cancellation, cleanup, and realistic file fixtures. MediaBunny and browser codec feasibility audits happen before advertising format support. Do not put heavy media engines in the root layout or common sidebar bundle.

Every actual tool requires meaningful logic tests and a browser flow that selects a fixture, processes it locally, downloads an output, and checks that output's contents. Device emulation does not establish real-device media performance; test representative physical phones before media launch.

## Release boundaries

This is a production-buildable foundation. It does not yet process media, documents, or developer data. No production deployment, domain configuration, consent/analytics setup, or real-device lab has been completed by this phase. CI is configured locally; its first hosted execution depends on publishing the repository.

Build with `npm run build` and publish `out/` to a static host when authorized. Do not use `next start` for an exported site. The local `npm run start` command previews those same static files. Configure host redirects/404s, HTTPS, cache policy, and security headers before a public deployment. CSP must account for Next's runtime and the theme bootstrap; future workers/WASM need a deliberate policy. Do not copy an untested restrictive policy into production.

## Acceptance checks

Run `npm run check`, then `npm run test:e2e`. Inspect the live homepage and `/design-system/` in desktop and mobile viewports. The final phase report records the actual test outcome and any limits.

### Original foundation verification — 9 October 2026

`npm run check` passed: design drift checks, formatting, ESLint, the Next.js static production build, TypeScript, and 24 unit tests. The catalogue/URL/navigation logic module has 100% statements, branches, functions, and lines covered; this is not a claim of 100% application coverage.

`npm run test:e2e` passed all 35 checks across desktop Chromium, Firefox, WebKit, Pixel 7 Chromium emulation, and iPhone 13 WebKit emulation. The runs include search and empty states, invalid category URLs, mobile dismissal/focus return, theme persistence, light/dark axe scans, token radii, reduced motion, no page overflow, 320px navigation, keyboard skipping, and no runtime errors or external requests on the tested routes.

Desktop, mobile, 320px navigation, and dark-theme screenshots were visually inspected. Local verification used Node 26.7.0; Node 24 LTS is the documented development/CI target. Hosted CI has not run because this repository has no remote yet. The workflow uses the current official [checkout 7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1), [setup-node 7.1.0](https://github.com/actions/setup-node/releases/tag/v7.1.0), and [upload-artifact 7.0.2](https://github.com/actions/upload-artifact/releases/tag/v7.0.2) actions.

The application carries AGPL-3.0-only. The locally served font licenses are preserved in `public/licenses/` and included in the static output. The foundation is ready for the next implementation phase; tool engines and public deployment remain outside this completed scope.

## Dependency audit

On 9 October 2026, `npm audit --omit=dev` reported zero production dependency advisories. The local preview server's `compression` dependency is overridden to the patched 1.8.2 release.

The full dependency audit reports nine high-severity development-tool entries stemming from one unpatched `braces` recursion advisory used through globbing in shadcn/ESLint tooling. The published advisory lists no patched version. These tools run during development/build and are not deployed in the static output. Avoid supplying untrusted glob patterns to them; revisit this advisory when an upstream fix is released. Downgrading the requested shadcn or the Next-matched ESLint configuration would not resolve the unpatched underlying package reliably. [GitHub advisory GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)

## Compact sidebar revision

The user rejected the bulky double sidebar. The current layout uses sidebar-01's grouped, single-panel structure with a 224px desktop width and a 256px mobile sheet. There are no nested sidebars or a second icon rail. The main header is reduced from 84px to 56px; the large hero is replaced with a short intro; cards use 16px padding, smaller icons, 12px corners, and no shadow. Titles and section headings follow the version-2 compact typography tokens. Desktop controls use 36px height while mobile controls retain 44px targets.

The saved design reference and agent instructions now require this compact layout for future phases. The existing shadcn preset, Base UI primitives, accessible labels, local fonts, search logic, and browser-only architecture are preserved.

Revision verification on 9 October 2026: `npm run check` passed design drift, formatting, ESLint, static production build, TypeScript, and all 24 unit tests. Catalogue logic coverage remains 100%. All 35 Playwright checks passed across the five configured desktop/mobile browser profiles, including single-panel navigation, compact dimensions, 320px layout, light/dark accessibility scans, and runtime checks. The active menu label uses the accessible semantic foreground after a contrast issue was caught and corrected.

Desktop, mobile, open mobile navigation, and dark-theme screenshots were visually reviewed. The development homepage and design-system route were also checked on mobile with no hydration or page errors; an additional axe scan with the mobile sidebar open found no WCAG 2 A/AA or 2.1 AA violations. Physical-device testing and hosted CI remain outside this local revision verification.
