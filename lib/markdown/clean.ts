/**
 * Every piece of HTML made from a document is cleaned here before it is
 * shown, saved or copied: nothing in it can run, links go only to the
 * kinds of address that are safe to follow, and pictures from other sites
 * can be left out so that the preview asks nothing of the network.
 */
import DOMPurify from "dompurify"

/** Addresses that may stay: http, https, mailto, tel, fragments and paths on the same site. */
const SAFE_URI =
  /^(?:(?:https?|mailto|tel):|#|\/|\.\.?\/|[^a-z:]*(?:[/?#]|$)|[a-z0-9._-]+(?:[/?#]|$))/i

const REMOTE = /^(?:https?:)?\/\//i

let purifier: ReturnType<typeof DOMPurify> | null = null
/** Set while one call runs: whether remote pictures are kept, and how many were not. */
let keepRemote = true
let blocked = 0
let pictures: ReadonlyMap<string, string> | undefined

function instance() {
  if (purifier) return purifier
  purifier = DOMPurify()
  // Cleaning needs a document to parse into; never hand HTML over uncleaned.
  if (!purifier.isSupported)
    throw new Error(
      "HTML can only be cleaned where there is a browser's document."
    )
  purifier.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A") {
      const href = node.getAttribute("href") ?? ""
      // Links out of the document open beside it and say nothing of where they came from.
      if (REMOTE.test(href)) {
        node.setAttribute("target", "_blank")
        node.setAttribute("rel", "noopener noreferrer")
      }
    }
    // Code and tables scroll sideways on a narrow screen: they take the keyboard's focus so they can be scrolled without a pointer.
    if (
      node.tagName === "PRE" ||
      node.tagName === "TABLE" ||
      (node.tagName === "DIV" && node.classList.contains("math-display")) ||
      (node.tagName === "FIGURE" && node.classList.contains("diagram"))
    )
      node.setAttribute("tabindex", "0")
    if (node.tagName === "IMG") {
      const source = node.getAttribute("src") ?? ""
      // A picture kept with the document is shown from where the page holds it.
      const kept = pictures?.get(source.replace(/^\.\//, ""))
      if (kept) node.setAttribute("src", kept)
      if (!keepRemote && REMOTE.test(source)) {
        node.removeAttribute("src")
        node.removeAttribute("srcset")
        node.setAttribute("data-blocked-src", source)
        blocked++
      }
      node.setAttribute("loading", "lazy")
      node.setAttribute("referrerpolicy", "no-referrer")
    }
  })
  return purifier
}

export function clean(
  html: string,
  remoteImages = true,
  kept?: ReadonlyMap<string, string>
) {
  const purify = instance()
  keepRemote = remoteImages
  pictures = kept
  blocked = 0
  const out = purify.sanitize(html, {
    ALLOWED_URI_REGEXP: SAFE_URI,
    ADD_ATTR: ["data-source-line", "target", "data-blocked-src"],
    // Forms, frames and styles of a document's own are not drawn.
    FORBID_TAGS: [
      "style",
      "form",
      "iframe",
      "object",
      "embed",
      "button",
      "textarea",
      "select",
    ],
    FORBID_ATTR: ["style"],
  })
  return { html: out, blockedImages: blocked }
}

let svgPurifier: ReturnType<typeof DOMPurify> | null = null

/**
 * A drawing made on the page (a diagram) cleaned before it is shown: SVG
 * only, with its own styles kept (they are written by the diagram library
 * for its own shapes) and nothing that runs, links out or embeds HTML.
 */
export function cleanSvg(svg: string) {
  svgPurifier ??= DOMPurify()
  return svgPurifier.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ["style"],
    FORBID_TAGS: ["foreignObject", "a", "script", "image", "use"],
  })
}
