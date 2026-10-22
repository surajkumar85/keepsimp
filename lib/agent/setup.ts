/** How an agent is given the KeepSimp bridge, as shown on the agent page and in the docs. */

export const BRIDGE_PACKAGE = "keepsimp-mcp"

export const BRIDGE_COMMAND = `claude mcp add keepsimp -- npx -y ${BRIDGE_PACKAGE}`

export const CODEX_CONFIG = `[mcp_servers.keepsimp]
command = "npx"
args = ["-y", "${BRIDGE_PACKAGE}"]
# The first start downloads the bridge and a browser; transcribing can take minutes.
startup_timeout_sec = 120
tool_timeout_sec = 300`

/**
 * The WebMCP origin-trial token for https://keepsimp.vercel.app (Chrome 149
 * to 156), registered at developer.chrome.com/origintrials. It expires on
 * 2027-03-30: renew it there, or take it out once WebMCP ships.
 */
export const ORIGIN_TRIAL_TOKEN =
  "AqcQ3M/XKPKhp6c+0Q0kY3NNOrBYI7Fd8jEYb81Cep7RNmy6mTPCmftBXjUidzLfFJy1BUZkYS31TU7Qns8HFwYAAABTeyJvcmlnaW4iOiJodHRwczovL2tlZXBzaW1wLnZlcmNlbC5hcHA6NDQzIiwiZmVhdHVyZSI6IldlYk1DUCIsImV4cGlyeSI6MTgwNjM2NDgwMH0="
