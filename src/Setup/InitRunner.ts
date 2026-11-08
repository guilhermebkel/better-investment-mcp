import { LogUtil } from "@/Utils/LogUtil.ts";

export class InitRunner {
  static readonly CLIENT_CONFIG_TEXT = [
    "Add the server to your MCP client.",
    "",
    "Claude and Cursor read this JSON (claude_desktop_config.json, .mcp.json or .cursor/mcp.json):",
    "",
    "{",
    "  \"mcpServers\": {",
    "    \"better-investment-analysis\": {",
    "      \"command\": \"npx\",",
    "      \"args\": [\"-y\", \"better-investment-analysis-mcp\"]",
    "    }",
    "  }",
    "}",
    "",
    "Codex reads this TOML (~/.codex/config.toml):",
    "",
    "[mcp_servers.better-investment-analysis]",
    "command = \"npx\"",
    "args = [\"-y\", \"better-investment-analysis-mcp\"]",
    "",
    "Docker (the image runs over stdio, and its cache is a named volume):",
    "",
    "{",
    "  \"mcpServers\": {",
    "    \"better-investment-analysis\": {",
    "      \"command\": \"docker\",",
    "      \"args\": [\"run\", \"-i\", \"--rm\", \"-v\", \"better-investment-analysis-cache:/cache\", \"ghcr.io/guilhermebkel/better-investment-analysis-mcp\"]",
    "    }",
    "  }",
    "}",
  ].join("\n");

  static run(): void {
    // Why: stdout belongs to the MCP protocol, so the configuration is printed on stderr like every other message for a person.
    LogUtil.showMessage(InitRunner.CLIENT_CONFIG_TEXT);
  }
}
