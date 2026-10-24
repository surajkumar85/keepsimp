# KeepSimp

Free tools for video, audio, PDFs, images, Markdown and JSON that run in the browser, with no uploads. The homepage takes any file and opens it in the tool for the job the visitor picks. `/dashboard/` lists every tool: the video, audio, PDF and Markdown editors with a page for each of their jobs, the image tools, the animation converter, the JSON formatter and the colour utility. The blog contains practical, statically rendered guides.

## Run locally

Use Node 24 LTS and npm. The included lockfile pins dependencies for reproducible installs.

```bash
npm ci
npm run dev
```

Open http://localhost:3000. The visual reference lives at `/design-system/`.

## Pages and SEO

The landing page is `/`, the dashboard is `/dashboard/`, and the blog is `/blog/`. Available tools have individual static routes under `/dashboard/`; article pages link directly to them. `/privacy/` documents actual file and preference handling.

The production domain is `https://keepsimp.vercel.app`. Set `NEXT_PUBLIC_SITE_URL` before building when moving to a different canonical origin. Pages include canonical URLs, descriptions and Open Graph/Twitter previews. `sitemap.xml` contains public pages and completed tools; `robots.txt` references it. Vercel preview builds use noindex. BlogPosting, BreadcrumbList, WebSite/Organization and WebApplication JSON-LD match visible content without invented ratings.

Re-export sharing graphics with `node scripts/social-images.mjs`; it renders standalone cards from local assets and fonts without a preview server. Pass article slugs to export a subset. Original image prompts and saved assets are in [the marketing phase report](docs/phase-two.md).

The [JSON workspace reference](docs/json-workspace.md) records the researched features, local worker architecture, precision rules and limits. Its six workflows include editing, tree/table exploration, JSONPath/Pointer queries, JSON Patch comparison, schema validation and conversions. Five blog guides explain the actual behavior with examples and source links.

## Verify

Install browser binaries once, then test the production static build:

```bash
npx playwright install chromium firefox webkit
npm run check
npm run test:e2e
```

`check` runs design drift checks, ESLint, build, TypeScript, and unit coverage. Playwright covers Chromium, Firefox, WebKit, Pixel 7 emulation, and iPhone 13 emulation, with accessibility scans and interface/token checks. `npm run test` starts Vitest watch mode. `npm run test:e2e:ui` opens the browser test runner. CI repeats these checks on Linux; use `npx playwright install --with-deps` there.

## Production output

```bash
npm run build
npm run start
```

The site exports to `out/` for static hosting. `start` previews that output rather than running a Next.js server. Configure host security/cache headers, HTTPS, and 404 handling before deployment. No deployment is part of this phase.

## Keep the design consistent

Read [the design reference](docs/design-system.md), [phase-one scope](docs/phase-one.md), [marketing phase](docs/phase-two.md), and [agent instructions](AGENTS.md) before implementation. Exact tokens live in [tokens.json](design-system/tokens.json). To change them intentionally:

```bash
npm run design:generate
npm run check
npm run test:e2e
```

Edit the JSON first; generated CSS must not be hand-edited. The system applies Airbnb's public principles using KeepSimp's own tokens. The requested preset uses **Base UI**, Tabler, Inter, Outfit, and Geist Mono. Fonts are served locally. New shadcn components require review because registry defaults can overwrite customized geometry.

## Foundation setup

Requested commands:

```bash
npx shadcn@latest init --preset b2zSMmeGTw --template next
npx shadcn@latest add sidebar-09
```

The initializer required a new directory, so the same preset/template was generated with `--name keepsimp-starter --no-monorepo` and moved here. `sidebar-09` was installed as requested, then its sample inbox and account content was adapted for the utility platform. The user later requested a compact single sidebar. The current UI follows sidebar-01's grouped single-panel structure, with 224px desktop navigation and compact surfaces. Subsequent work must follow the current design reference rather than restore the earlier double sidebar.

## License

The application uses [AGPL-3.0-only](LICENSE), following the project's open-source direction. Dependencies, font files, and generated upstream components retain their own license notices.

Agents can use the tools too: [the agent tools reference](docs/agent-tools.md) covers the tool registry, the agent page at `/dashboard/agents/` (WebMCP), and the KeepSimp bridge in `bridge/` (npm `keepsimp-mcp`), a local MCP server that runs the tools in a hidden browser.

The [color utility reference](docs/color-utility.md) records color standards, brand sources, numerical decisions and limits for the converter, palettes, contrast, gradients and local image sampling.
