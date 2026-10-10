<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## KeepSimp project rules

Read `docs/design-system.md`, `design-system/tokens.json`, and `docs/phase-one.md` before implementing product UI. The design reference is the persistent authority for future phases.

- Use Next.js App Router, TypeScript strict mode, npm, and the committed lockfile. The app exports static files; browser file processing must stay local. Do not introduce uploads, accounts, paid tools, or server processing without a user request.
- Preserve the requested shadcn preset `b2zSMmeGTw`: Base Nova, Base UI primitives, Tabler icons, Inter body, Outfit headings, Geist Mono code, and a teal brand. Do not substitute Radix or Lucide APIs from memory.
- Use sidebar-01's single panel with grouped navigation. The user rejected the double-sidebar layout: do not reintroduce nested sidebars or a second icon rail. Desktop width is 224px; mobile uses one 256px sheet with the same categories and keyboard access.
- Keep marketing routes (`/`, `/blog/`, `/privacy/`) separate from the compact workspace at `/dashboard/`. Marketing uses documented display typography and the warm surface token; dashboard controls and cards retain compact dimensions.
- Marketing links use `prefetch={false}` to avoid downloading tool bundles before intent and Safari errors when background route requests are interrupted. Preserve client navigation and use responsive static image sources for the exported site.
- Use the confirmed canonical origin `https://keepsimp.vercel.app`, overridable through `NEXT_PUBLIC_SITE_URL`. Include only public pages and completed tool routes in the sitemap. Vercel previews must remain noindex. Keep metadata, visible content, JSON-LD and tool availability consistent.
- Reuse `components/ui`. Product screens use semantic tokens and named radius utilities. No arbitrary radii, hardcoded colors, copied Airbnb marks, or proprietary Cereal fonts.
- Reuse the outlined KeepSimp logo assets in `public/brand/` and the matching favicon. Preserve their proportions and geometry; use the light-wordmark variant on dark surfaces. Brand export colors are documented in `docs/design-system.md`.
- Edit `design-system/tokens.json`, then run `npm run design:generate`. Never hand-edit `app/design-tokens.css`. Update the reference and relevant browser assertions when intentionally changing the system.
- Use the compact density: 36px desktop controls and navigation rows, at least 44px on mobile. Label fields, keep focus visible, support reduced motion and both themes, and use honest loading/error/empty states. Planned tools must not appear functional.
- Put pure tool logic in `lib/` or its tool module, with meaningful unit tests covering edge cases. Browser tests should verify real journeys and actual outputs when engines arrive; do not substitute mocked processing for end-to-end validation.
- Before changing JSON workflows, read `docs/json-workspace.md`. Preserve exact numeric tokens, local worker execution, bounded output/patch expansion, explicit previews and source/context-scoped results. Query/schema operations must not fetch references or execute pasted JavaScript.
- The site installs as an app and works offline; read `docs/pwa.md` before changing `app/manifest.ts`, `app/sw.js/route.ts`, `lib/pwa.ts`, `lib/offline.ts` or `service-worker/`. `next build` writes `/sw.js` through a static route; do not move that to a step after the build, because the host does not publish files added to `out/` later. The files in `service-worker/` stay plain JavaScript without imports, since their text is copied into the worker. Keep large media such as videos out of the offline copy through `service-worker/rules.js`, register the worker only from the workspace, and cover offline behaviour in `e2e/offline.spec.ts` with the server really stopped.
- Before delivery, run `npm run check`, `npm run test:e2e`, and inspect desktop/mobile UI. Run `npm run build` before standalone browser tests. CI runs all five browser/device profiles. Keep generated reports out of Git.
- Adding new shadcn components can restore default styles. Review their geometry and rerun design/browser checks before using them. Registry-internal geometry in `components/ui` is exempt from the product style scanner; it still requires review against the reference.

Research statements in the design reference must retain source links and distinguish Airbnb's public principles from KeepSimp's own numerical decisions. Phase one is a tested foundation. The marketing phase adds four working tools; the remaining catalogue entries must stay marked as coming soon.
