import { describe, expect, it } from "vitest"
import { LOGOS } from "@/components/agent/app-logo"
import { agentClients, SUGGESTED_FOLDER } from "./clients"
import { BRIDGE_PACKAGE } from "./setup"

describe("the agent apps", () => {
  it("each have a name, a maker and their own pages, over https", () => {
    const ids = agentClients.map((client) => client.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const client of agentClients) {
      expect(client.name).toBeTruthy()
      expect(client.maker).toBeTruthy()
      expect(new URL(client.href).protocol).toBe("https:")
      expect(new URL(client.docs).protocol).toBe("https:")
      expect(client.where).toMatch(/\.$/)
      if (client.logo) expect(LOGOS[client.logo]).toMatch(/^[mM]/)
    }
  })

  it("start the published bridge, with settings that are valid as written", () => {
    for (const client of agentClients)
      for (const step of client.setup) {
        expect(step.text, client.id).toContain(BRIDGE_PACKAGE)
        if (step.language === "json")
          expect(() => JSON.parse(step.text), client.id).not.toThrow()
      }
    const code = agentClients.find((client) => client.id === "vscode-copilot")!
    const added = /^code --add-mcp '(.+)'$/.exec(code.setup[0].text)
    expect(JSON.parse(added![1])).toMatchObject({
      name: "keepsimp",
      type: "stdio",
      command: "npx",
    })
  })

  it("give a folder to the apps that start the bridge from their settings", () => {
    const folderOf = (id: string) =>
      agentClients
        .find((client) => client.id === id)!
        .setup.some((step) => step.text.includes(`"${SUGGESTED_FOLDER}"`))
    // Desktop apps and editors name no folder of their own.
    for (const id of ["claude-desktop", "cursor", "zed", "cline", "jetbrains"])
      expect(folderOf(id), id).toBe(true)
    // Terminal agents start it in the project, or name their folders.
    for (const id of ["claude-code", "codex", "gemini-cli", "opencode"])
      expect(folderOf(id), id).toBe(false)
  })

  it("show a logo only where its maker offers one", () => {
    expect(
      agentClients
        .filter((client) => !client.logo)
        .map((client) => client.maker)
    ).toEqual(["OpenAI"])
  })
})
