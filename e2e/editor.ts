import type { Locator } from "@playwright/test"

export async function replaceEditor(editor: Locator, text: string) {
  // CodeMirror owns its selection. Native fill() can replace the DOM range
  // while Android/Safari still insert at an older editor selection.
  // Use the editor's keyboard commands and actual browser input instead.
  await editor.click()
  // "Select all" is the key the editor itself listens for, and it decides
  // that the way this does: Apple's key on a Mac, and on anything that says
  // it is an iPhone or iPad, whatever machine the browser really runs on.
  // WebKit on Linux with an iPhone's profile is such a case.
  const shortcut = await editor.evaluate(() =>
    /Mac|iP(hone|[oa]d)/.test(navigator.platform) ||
    (/AppleWebKit/.test(navigator.userAgent) &&
      /Mobile\/\w+/.test(navigator.userAgent))
      ? "Meta+A"
      : "Control+A"
  )
  await editor.press(shortcut)
  if (text) await editor.page().keyboard.insertText(text)
  else await editor.press("Backspace")
}
