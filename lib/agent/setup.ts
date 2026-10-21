/** How an agent is given the KeepSimp bridge, as shown on the agent page and in the docs. */

export const BRIDGE_PACKAGE = "keepsimp-mcp"

export const BRIDGE_COMMAND = `claude mcp add keepsimp -- npx -y ${BRIDGE_PACKAGE}`

export const CODEX_CONFIG = `[mcp_servers.keepsimp]
command = "npx"
args = ["-y", "${BRIDGE_PACKAGE}"]`

/**
 * The WebMCP origin-trial token for keepsimp.vercel.app (Chrome 149 to 156),
 * registered at developer.chrome.com/origintrials. Empty until it is given.
 */
export const ORIGIN_TRIAL_TOKEN = ""
