# KeepSimp

A free, browser-first utility platform. Phase one provides the Next.js foundation, the requested shadcn preset/sidebar, a persistent design system, and unit/browser testing. Tools in the preview catalogue are planned; processing engines are not implemented yet.

## Run locally

Use Node 24 LTS and npm. The included lockfile pins dependencies for reproducible installs.

```bash
npm ci
npm run dev
```

Open http://localhost:3000. The visual reference lives at `/design-system/`.

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

Read [the design reference](docs/design-system.md), [phase-one scope](docs/phase-one.md), and [agent instructions](AGENTS.md) before implementation. Exact tokens live in [tokens.json](design-system/tokens.json). To change them intentionally:

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
