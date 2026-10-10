# Installing KeepSimp

Updated 10 October 2026. KeepSimp can be added to a phone's home screen and opened in its own window, without browser controls.

## What is configured

- **Manifest:** `app/manifest.ts` exports `/manifest.webmanifest`, built by `webManifest()` in `lib/pwa.ts`. Next.js links it from every page.
  - The installed app opens on `/dashboard/`, with the whole site in scope so journal and privacy links stay inside the window.
  - `display` is `standalone`.
  - Shortcuts (long-press the icon on Android) are the tools marked available in `lib/catalogue.ts`. Planned tools never appear.
- **Icons,** in `public/icons/`:

  | File                               | Use                                                        |
  | ---------------------------------- | ---------------------------------------------------------- |
  | `icon-192.png`, `icon-512.png`     | The mark as drawn, with transparent corners.               |
  | `icon-maskable-192.png`, `-512`    | The mark on a full square, for launchers that cut a shape. |
  | `apple-touch-icon.png` (180 × 180) | The full-square version for iOS, which rounds it itself.   |

  They are exported from `public/brand/keepsimp-mark.svg` by `npm run pwa:icons`. Rerun it if the mark changes; do not edit the PNG files by hand.

- **Colours:** `themeColors` in `lib/pwa.ts` holds the sRGB values of the light and dark `background` tokens. They colour the phone's status bar and the Android launch screen.
  - Two `theme-color` tags follow the system setting.
  - `components/theme-color.tsx` points both at the chosen theme when someone switches by hand.
- **iOS:** `appleWebApp` in `app/layout.tsx` sets the home-screen title and a standard status bar.

## Not included

There is no service worker, so the installed app still needs a connection to load pages and codecs. Files are still processed on the device. Offline use would need a worker that caches the tool bundles and WebAssembly codecs, with a plan for updating them; add it only on request.

## Tests

- **Unit** (`lib/pwa.test.ts`): manifest fields, icon sizes and purposes, and shortcuts limited to working tools.
- **Browser** (`e2e/marketing-and-tools.spec.ts`), on all five profiles:
  - the manifest and Apple tags are linked from marketing and dashboard pages
  - the manifest is served as `application/manifest+json`
  - every icon is a PNG of the size it claims; maskable icons are opaque to the corners
  - the start page and every shortcut load
  - the status bar colour follows a manual theme switch and survives a reload
- **Chrome's own check:** `Page.getAppManifest` and `Page.getInstallabilityErrors` reported no errors against the exported site on 10 October 2026.
