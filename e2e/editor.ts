import type { Locator } from "@playwright/test"

export async function replaceEditor(editor: Locator, text: string) {
  // CodeMirror owns its selection. Native fill() can replace the DOM range
  // while Android/Safari still insert at an older editor selection.
  // Use the editor's keyboard commands and actual browser input instead.
  await editor.click()
  const shortcut = await editor.evaluate(() =>
    /Mac|iP(hone|[oa]d)/.test(navigator.platform) ? "Meta+A" : "Control+A"
  )
  await editor.press(shortcut)
  if (text) await editor.page().keyboard.insertText(text)
  else await editor.press("Backspace")
}
