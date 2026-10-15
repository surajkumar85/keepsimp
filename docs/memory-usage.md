# Memory usage

The workspace header has one Memory usage button, beside the theme switch. It opens a compact panel with the current tool as context, the browser's available memory estimate, recent readings, the highest reading seen during this opening and a manual refresh. It does not measure a tool in isolation.

## What the numbers mean

- **JavaScript memory:** Chromium's `performance.memory.usedJSHeapSize`, shown as a partial estimate. It may miss workers, WebAssembly engines, images, media buffers and other browser allocations, and may include memory shared with other pages. It is never labelled total tab memory.
- **Page memory:** `performance.measureUserAgentSpecificMemory()` when the browser supplies it and the page is cross-origin isolated. This is the browser's estimate for the page and its dedicated workers. The current static deployment does not enable cross-origin isolation, so this path supports an environment that already provides it. The feature does not change hosting headers or processing engines to enable it.
- **Unavailable:** Firefox and Safari, including iPhone Safari, currently expose neither reading. The panel explains this without showing a fabricated zero. Tools remain usable.

Neither API gives reliable memory attribution to a KeepSimp tool. Tools share a page and use workers and browser-managed engines; the current tool's name is context, not a claim that the whole reading belongs to it. No free-RAM number, device-RAM percentage or heap-limit warning is shown. A heap limit is not a device's capacity or its available memory.

## Sampling and privacy

`lib/browser-memory.ts` contains the capability adapter; `lib/memory.ts` validates readings, formats binary units and calculates the bounded trend and peak. Both are covered at 100% by the unit suite. Browser objects are supplied to the adapter, never accessed during module import or server rendering.

The component samples only while the panel is open and the document is visible. JavaScript readings refresh every two seconds. A broader page measurement runs on opening, on returning to the visible tab and on an explicit refresh, with no interval: it may wait for garbage collection. One native request is shared across reads; after 25 seconds the adapter falls back without starting another native request. After a failed, invalid or timed-out broader measurement, it uses only the cheaper heap fallback for the reader's remaining lifetime. Native measurements cannot be cancelled, so one already started may finish after the panel closes; its result does not update a closed panel.

The chart retains at most 30 readings and scales to their range. The peak retains the highest observation for this opening, including observations that have left the chart. Changing measurement type resets comparisons. Closing the panel or changing workspace routes resets chart and peak. A peak is an observed sample, not the highest allocation between samples.

No file contents, memory measurements or history are stored or transmitted. There is no new telemetry, persistence, dependency or browser isolation header.

## UI and accessibility

The shared native HTML popover uses existing semantic colours, `rounded-xl`, a 352px width capped to the viewport, and the existing Base UI buttons with 36px desktop / 44px touch controls. It sits below the workspace header in the browser's top layer, with a fixed viewport bound; its header stays fixed while its body scrolls. Escape, outside press and the close button dismiss it; closing with a button or Escape returns focus to the trigger. Clicking a control outside keeps that control's focus, and the global search shortcut hands focus to search. The popup scales on entry, never fades, preserving the existing iPhone Safari touch-scrolling rule. Reduced motion removes that transition. Automatic timestamps do not create repeated screen-reader announcements.

The global search shortcut dismisses a native-open panel during document capture, before search opens. This also works while focus is still on the trigger: native opening is immediate, but the toggle event that sets the panel's initial focus is queued. Handling the shortcut only inside the panel leaves a race in which both windows remain open.

This new wrapper uses the [native Popover API](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/popover), supported by the project's browser profiles, instead of Base UI's Popover focus manager: version 1.9.0 creates unnamed `role="button"` focus guards in WebKit, including in its focus-trapping mode. The browser handles light dismissal and popover order without those synthetic controls. Fixed positioning and a header-aware height bound also avoid a resize-observer feedback loop when the explanation grows. The other shared primitives and their Safari no-fade fix are unchanged.

`e2e/memory.spec.ts` covers native browser capability, controlled API values, updates and observed peak, pause/close behaviour, unsupported browsers, explicit broader measurements, keyboard/navigation, small-screen bounds, scrolling, both themes and accessibility across all five browser profiles. Controlled values exercise reporting and lifecycle only; real-browser coverage separately checks the API actually available in that browser.

## Sources

Reviewed on 15 October 2026. Browser capabilities can change; detection is by API availability, not browser name.

- [MDN: performance.memory](https://developer.mozilla.org/en-US/docs/Web/API/Performance/memory) — deprecated, non-standard heap reading and its coverage limitations.
- [MDN: measureUserAgentSpecificMemory](https://developer.mozilla.org/en-US/docs/Web/API/Performance/measureUserAgentSpecificMemory) — isolation requirement, asynchronous measurement and browser support.
- [Chrome: monitor total page memory usage](https://web.dev/articles/monitor-total-page-memory-usage) — what broader measurements include and why measurement can wait for garbage collection.
- [WICG memory measurement proposal](https://github.com/WICG/performance-measure-memory) — measurement scope and attribution limits.
- [MDN browser compatibility data](https://github.com/mdn/browser-compat-data/blob/main/api/Performance.json) — current API support.
