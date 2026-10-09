const MAX_CHARACTERS = 1_000_000

// Validate with the native parser, but format original tokens so large numbers
// and escaped strings survive without a parse/stringify round trip.
export function formatJson(input: string, minify = false): string {
  if (input.length > MAX_CHARACTERS)
    throw new Error("Please use JSON smaller than 1 million characters.")
  if (!input.trim()) throw new Error("Add some JSON to get started.")
  try {
    JSON.parse(input)
  } catch {
    throw new Error(
      "This JSON is not valid. Check quotes, commas and brackets, then try again."
    )
  }
  const tokens = input.match(/"(?:[^"\\]|\\.)*"|[^\s"{}\[\],:]+|[{}\[\],:]/g)!
  if (minify) return tokens.join("")
  let depth = 0
  let output = ""
  const newline = () => "\n" + "  ".repeat(depth)
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]
    if (token === "{" || token === "[") {
      if (depth >= 100)
        throw new Error(
          "This JSON is too deeply nested. Use fewer than 100 levels."
        )
      depth++
      output += token
      if (tokens[index + 1] !== "}" && tokens[index + 1] !== "]")
        output += newline()
    } else if (token === "}" || token === "]") {
      depth--
      if (tokens[index - 1] !== "{" && tokens[index - 1] !== "[")
        output += newline()
      output += token
    } else if (token === ",") output += token + newline()
    else if (token === ":") output += ": "
    else output += token
  }
  return output
}
