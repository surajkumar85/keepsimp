import { readFile, writeFile, readdir } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import path from "node:path"

const root = fileURLToPath(new URL("../", import.meta.url))
const tokens = JSON.parse(
  await readFile(path.join(root, "design-system/tokens.json"), "utf8")
)
if (![1, 2, 3].includes(tokens.version) || tokens.preset !== "b2zSMmeGTw")
  throw new Error("Unsupported design token version or changed shadcn preset")
const declarations = (values, prefix = "") =>
  Object.entries(values)
    .map(([key, value]) => `  --${prefix}${key}: ${value};`)
    .join("\n")
const lightKeys = Object.keys(tokens.colors.light).sort().join(",")
if (lightKeys !== Object.keys(tokens.colors.dark).sort().join(","))
  throw new Error("Both themes must define the same semantic colors")
const css = `/* Generated from design-system/tokens.json. Run npm run design:generate. */\n:root {\n${declarations(tokens.colors.light)}\n${declarations(tokens.radius, "radius-")}\n${declarations(tokens.spacing, "space-")}\n${declarations(tokens.layout, "layout-")}\n${declarations(tokens.typography, "type-")}\n${declarations(tokens.motion, "motion-")}\n${declarations(tokens.shadows, "shadow-")}\n}\n\n.dark {\n${declarations(tokens.colors.dark)}\n}\n`
const destination = path.join(root, "app/design-tokens.css")
if (!process.argv.includes("--check")) {
  await writeFile(destination, css)
  console.log("Generated app/design-tokens.css")
} else {
  if ((await readFile(destination, "utf8")) !== css)
    throw new Error(
      "Design tokens drifted. Run npm run design:generate and review the change."
    )
  async function checkDirectory(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        if (filename !== path.join(root, "components/ui"))
          await checkDirectory(filename)
      } else if (
        /\.tsx?$/.test(filename) &&
        !/\.(test|spec)\./.test(filename)
      ) {
        const source = await readFile(filename, "utf8")
        // Registry primitives retain their internal geometry. Product UI must use our tokens.
        if (
          /rounded(?:-[a-z]+)*-\[|(?:bg|text|border|ring)-\[(?:#|rgb|hsl|oklch)|#[0-9a-fA-F]{3,8}\b/.test(
            source
          )
        ) {
          throw new Error(
            `Use semantic design tokens, not arbitrary radii/colors: ${path.relative(root, filename)}`
          )
        }
        if (/style=\{\{[^}]*borderRadius:\s*["'\d]/s.test(source))
          throw new Error(`Use a radius token in ${filename}`)
      }
    }
  }
  await checkDirectory(path.join(root, "app"))
  await checkDirectory(path.join(root, "components"))
  console.log("Design tokens and product styles are consistent")
}
