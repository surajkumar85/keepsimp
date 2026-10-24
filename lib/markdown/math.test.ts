import { describe, expect, it } from "vitest"
import { closingDollar } from "./math"
import { renderMarkdown } from "./render"

const html = (text: string) => renderMarkdown(text).html

describe("maths", () => {
  it("keeps TeX between single dollars in a line", () => {
    expect(html("Energy $E = mc^2$ here.")).toContain(
      '<span class="math" data-tex="E = mc^2">E = mc^2</span>'
    )
  })

  it("leaves money and escaped dollars alone", () => {
    expect(html("It costs $5 and $10.")).not.toContain("math")
    expect(html("A $ sign and $ another")).not.toContain("math")
    expect(html("\\$x$ is not maths")).not.toContain('class="math')
    expect(html("$$")).not.toContain('class="math')
    expect(html("$x\\$y$")).toContain('data-tex="x\\$y"')
    expect(html("end $")).not.toContain("math")
  })

  it("reads maths inside a link's words, and a block straight after a paragraph", () => {
    expect(html("[the $x$ case](#x)")).toContain(
      '<a href="#x">the <span class="math"'
    )
    expect(html("Para\n$$\nx\n$$")).toContain(
      '<div class="math math-display" data-tex="x"'
    )
  })

  it("draws $$ in a line as display maths", () => {
    expect(html("so $$a+b$$ is")).toContain(
      '<span class="math math-display" data-tex="a+b">'
    )
  })

  it("reads blocks of $$ on lines of their own, and ```math", () => {
    const block = html("Before\n\n$$\n\\frac{1}{2}\n< x\n$$\n\nAfter")
    expect(block).toContain(
      '<div class="math math-display" data-tex="\\frac{1}{2}\n< x" data-source-line="2" tabindex="0">'
    )
    expect(html("$$ x^2 $$")).toContain('data-tex="x^2"')
    expect(html("```math\ny = 1\n```")).toContain(
      '<div class="math math-display" data-tex="y = 1" data-source-line="0" tabindex="0">'
    )
    // Without its closing line it is text.
    expect(html("$$\nnever closed")).not.toContain('class="math')
    expect(html("    $$\n    code\n    $$")).toContain("<code>$$\ncode\n$$")
  })

  it("says when a document has maths, diagrams or code", () => {
    expect(renderMarkdown("$x$").needs).toEqual({
      math: true,
      diagrams: false,
      code: false,
    })
    expect(renderMarkdown("$$\nx\n$$").needs.math).toBe(true)
    expect(renderMarkdown("```math\nx\n```").needs).toEqual({
      math: true,
      diagrams: false,
      code: false,
    })
    expect(renderMarkdown("```mermaid\ngraph TD\n```").needs).toEqual({
      math: false,
      diagrams: true,
      code: false,
    })
    expect(renderMarkdown("```js\n1\n```\n\n```\nplain\n```").needs).toEqual({
      math: false,
      diagrams: false,
      code: true,
    })
  })

  it("keeps diagrams as their text until the page draws them", () => {
    expect(html("```mermaid\ngraph TD\nA-->B\n```")).toBe(
      '<figure class="diagram" data-diagram="mermaid" data-source-line="0" tabindex="0"><pre tabindex="0"><code>graph TD\nA--&gt;B\n</code></pre></figure>\n'
    )
  })

  it("finds the closing dollar", () => {
    expect(closingDollar("$a$", 0, false)).toBe(2)
    expect(closingDollar("$a $b$", 0, false)).toBe(5)
    expect(closingDollar("$a$1 b$", 0, false)).toBe(6)
    expect(closingDollar("$$a$$", 0, true)).toBe(3)
    expect(closingDollar("$a", 0, false)).toBe(-1)
    expect(closingDollar("$a $", 0, false)).toBe(-1)
  })
})
