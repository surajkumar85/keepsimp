# Phase two: landing page, journal and working tools

Implemented 10 October 2026. The user confirmed `https://keepsimp.vercel.app/` as the production origin. This phase is built and tested locally; it does not deploy changes to that hosted site.

This report records the original marketing delivery. The later JSON upgrade replaces its initial formatter with six workflows and expands the journal to seven articles; current behavior, limits and verification live in [the JSON workspace reference](json-workspace.md).

## Visitor experience

The homepage now introduces KeepSimp with clear calls to action into `/dashboard/`, an original illustrated identity, a live image-compression demonstration, available tools, a three-step explanation, privacy information, journal previews, keyboard-operable FAQs and a closing action. Marketing uses separate route-group layouts and the version-3 design reference. The dashboard retains the compact single sidebar.

Animations are finite and honor reduced motion. Entry motion keeps text fully opaque, so readability and contrast are preserved during movement. Marketing links load their destination when clicked, avoiding eager tool-bundle downloads and Safari errors when background prefetches are interrupted. Responsive AVIF sources, WebP fallbacks and high-priority hero delivery keep the static site light. The live demo processes an actual sample locally and reports measured sizes rather than invented savings. It exports WebP where canvas export is supported and JPEG otherwise. Browser capability detection disables unavailable WebP export options in the image tools; actual output MIME types are checked before download.

## Working tools

- The image compressor now has its own WebAssembly engine (MozJPEG, libwebp, libavif, libimagequant + OxiPNG), with SSIM-guided quality, target sizes, crop/rotate, a before/after slider and more input formats. See `docs/image-compressor.md`.
- The image resizer is now a batch tool on the same WebAssembly engine, with presets, fit modes, smart focus, print units, responsive sets and ZIP download. See `docs/image-resizer.md`.
- The image converter is now a batch tool on the same WebAssembly engine, with ten output formats (JPEG, PNG, WebP, AVIF, JPEG XL, GIF, BMP, TIFF, ICO and PDF), several formats at once with `<picture>` HTML, a measured format comparison and ZIP download. See `docs/image-converter.md`.
- The landing demonstration uses a local canvas engine (`lib/image-tools.ts`). Supported still-image inputs are JPEG, PNG and WebP, up to 20 MB and 16 million pixels. Outputs fit within 4096 pixels on each side. JPEG receives a white matte for transparency; PNG ignores lossy quality settings. Invalid files, unsupported export formats and oversized outputs produce useful errors. Bitmap, canvas and object URL resources are released when no longer needed.
- JSON formatter validates syntax with the native parser, then formats original tokens. This preserves large-number spelling, escaped strings, duplicate keys and order without a parse/stringify round trip. It provides pretty printing, minification, copying, downloads, a sample and error handling. The limit is one million characters, with formatted depth capped at 100 levels.
- The catalogue has 13 entries: four working tools and nine marked as coming soon. The newest planned entry is an animation converter, because the image converter uses only the first frame of an animated file.
- Remaining image, video, audio and document catalogue entries stay marked as coming soon. They have no processing route or sitemap entry.

These are initial tools, not a finished library. Canvas exports can remove metadata, color profiles and animation. Users should keep original files; physical-device media testing and specialist archival/print workflows remain later work.

## Journal and SEO

Three original articles cover image compression, JPEG/PNG/WebP choices and precision-preserving JSON formatting. They include an author, publication date, reading time, images, table of contents, technical sources, related articles and direct links to the relevant working tools. Their content is statically rendered for readers and crawlers.

Every public page has a distinct title and description, canonical URL, Open Graph metadata and Twitter card. Four 1200 × 630 PNG sharing graphics ship locally. JSON-LD describes WebSite/Organization, BlogPosting, BreadcrumbList and real WebApplication pages; it does not invent ratings, reviews or unsupported functionality. `sitemap.xml` includes only the landing, dashboard, privacy, journal and completed tool/article routes. The noindex design gallery is excluded. `robots.txt` references the sitemap. Vercel preview builds use noindex and disallow crawling; the canonical origin can change through `NEXT_PUBLIC_SITE_URL`.

The implementation follows Google's emphasis on useful content, clear organization and descriptive metadata. SEO work improves crawlability and relevance; rankings and rich-result appearances are not guaranteed. Search Console property ownership, sitemap submission and real visitor performance monitoring require the user's account and deployment. [Google SEO starter guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide), [Google Article markup](https://developers.google.com/search/docs/appearance/structured-data/article)

Technical article references include [MDN canvas exports](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob), [image format capabilities](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Image_types), [safe integers](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/MAX_SAFE_INTEGER) and [JSON parsing](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse). Implementation guidance was also read from this installed Next.js version's layout, metadata, sitemap and robots documentation.

## Original assets and prompts

Two original images were created with the built-in image-generation tool. They illustrate the product; the coast is a generated sample, not a claim about a real photographed location. Web exports are saved in the repository:

- `public/images/coastline.jpg`: full sample used for actual image processing. `coastline-display.webp` is the 960px fallback used on visible pages, with 640px and 960px AVIF sources.
- `public/images/private-workspace.webp`: an optimized 1400px editorial feature and journal image, with 640px and 1400px AVIF sources.
- `public/images/json-guide.svg`: a native vector explanation of JSON indentation, authored directly to match the established brand.
- `public/images/social/`: four branded PNG sharing graphics exported with the local fonts by `scripts/social-images.mjs`.

The original generated PNGs remain in the Codex generated-image directory; project pages reference only workspace assets. Web encoding and sharing-card exports use standard local image/browser tools.

Coast prompt:

> Use case: photorealistic-natural. Asset type: original landscape photograph for KeepSimp's interactive image compression demonstration and image-format blog guide. A beautifully composed sunlit Mediterranean coastal headland with a single small terracotta-colored house, turquoise sea, soft sage vegetation, ivory cliffs, warm afternoon light, subtle natural film texture. Editorial travel photography, sophisticated calm palette that complements teal and warm ivory. Wide landscape composition, extremely clean and sharp details; make the subject clear even as a small thumbnail. No people, no text, no logos, no watermark, no interface, no collage. This should be one coherent landscape photograph, not a screen mockup.

Privacy still-life prompt:

> Use case: ads-marketing. Asset type: editorial feature image and privacy blog cover for KeepSimp, a free browser-based utility website. A delightful minimal still life of real crafted objects on a warm ivory tabletop: a closed sage-green folder with neatly stacked paper inside, a small pale teal glass padlock, a smooth ivory ceramic sphere and a single warm yellow paperclip. Premium tactile product photography, soft daylight from upper left, gentle shadows, uncluttered generous negative space, careful art direction, understated and friendly. Objects are plausibly real, subtle materials, no excessive shine, no busy decoration. Wide horizontal composition. Color palette warm ivory, forest teal, pale sage and a small warm ochre accent. No lettering, text, brand marks, people, interfaces or watermark.

## Verification

Verified on 10 October 2026:

- `npm run check` passes design drift, formatting, ESLint, production static build, TypeScript and 60 unit tests. Statements, branches, functions and lines reach 100% across the four selected logic modules (`catalogue`, `image-tools`, `json-tools`, `site`); this is not coverage of all application components.
- `npm run test:e2e` passes all 80 checks across Chromium, Firefox, WebKit, mobile Chrome and mobile Safari. The suite validates actual exported image bytes, transparency, JPEG matte, dimensions, JSON number precision, errors, keyboard behavior, reduced motion, metadata, sitemap, sharing-image sizes, runtime health and axe accessibility scans in light and dark themes.
- `npm run audit:production` reports zero vulnerabilities in production dependencies. Development dependency limitations remain documented in the foundation report.
- Desktop and mobile landing, article and dark-theme layouts were inspected visually. Available tools produce real local downloads; unsupported WebP export falls back or is disabled according to browser capability.
- A Lighthouse mobile audit against the production static output scores Performance **93**, Accessibility **100**, Best Practices **100** and SEO **100**. It reports 0.9s first contentful paint, 3.2s largest contentful paint, 40ms total blocking time and zero layout shift. These are local lab measurements with Lighthouse's simulated mobile throttling, not deployed Vercel measurements or visitor Core Web Vitals. Hosting cache policy and real network/device conditions can change results.

The local implementation and production export are complete. This phase has not been pushed or deployed to Vercel. The development preview remains available on port 3000.
