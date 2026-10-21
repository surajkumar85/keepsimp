/**
 * Tools that take words, given either as text or as a file, and give words
 * back: short answers come back in the result, long ones and those made from
 * a file come back as a file.
 */
import { madeName, type FileStore } from "./files"
import { ToolError, type FileRef, type JsonSchema } from "./registry"

/** Answers longer than this come back only as a file. */
export const INLINE_CHARACTERS = 50_000

/** The text and the file properties that give the same thing two ways. */
export const textOrFile = (what: string, text = "text", file = "file") => ({
  [text]: { type: "string", description: `${what}, as text.` },
  [file]: {
    type: "string",
    description: `${what}, as a file (its id).`,
    "x-keepsimp": "file",
  } satisfies JsonSchema,
})

/** Reads what was given as text or as a file, and where it came from. */
export async function wordsOf(
  input: Record<string, unknown>,
  files: FileStore,
  {
    what,
    text = "text",
    file = "file",
    most,
  }: {
    what: string
    text?: string
    file?: string
    most: number
  }
): Promise<{ words: string; from: string | null }> {
  const given = input[text] as string | undefined
  const id = input[file] as string | undefined
  if ((given === undefined) === (id === undefined))
    throw new ToolError(`Give ${what} either as "${text}" or as "${file}".`)
  if (given !== undefined) return { words: given, from: null }
  const held = files.get(id!)
  if (held.blob.size > most)
    throw new ToolError(
      `${held.ref.name} is ${held.blob.size.toLocaleString("en")} bytes; ${what} can be at most ${most.toLocaleString("en")}.`
    )
  return { words: await held.blob.text(), from: held.ref.name }
}

/**
 * Hands back words that were made: in the result when short and the source
 * was text, and as a file when the source was a file or they are long.
 */
export function wordsMade(
  files: FileStore,
  words: string,
  {
    from,
    suffix,
    extension,
    type,
  }: { from: string | null; suffix: string; extension: string; type: string }
): { file?: FileRef; inline?: string } {
  const inline = words.length <= INLINE_CHARACTERS ? words : undefined
  if (from === null && inline !== undefined) return { inline }
  const file = files.add(
    new Blob([words], { type }),
    madeName(from, suffix, extension),
    "made"
  )
  return { file, inline }
}
