// Names that app/sw.js/route.ts puts in front of sw.js when it writes the worker.
declare const VERSION: string
declare const PRECACHE: string[]
declare const isImmutable: typeof import("./rules.js").isImmutable
declare const routeFor: typeof import("./rules.js").routeFor
