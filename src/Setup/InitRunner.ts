import { LogUtil } from "@/Utils/LogUtil.ts";

const MCP_SERVERS_OPEN = "  \"mcpServers\": {";
const SERVER_OPEN = "    \"better-investment\": {";

export class InitRunner {
  static readonly CLIENT_CONFIG_TEXT = [
    "Add the server to your MCP client.",
    "",
    "Claude and Cursor read this JSON (claude_desktop_config.json, .mcp.json or .cursor/mcp.json):",
    "",
    "{",
    MCP_SERVERS_OPEN,
    SERVER_OPEN,
    "      \"command\": \"npx\",",
    "      \"args\": [\"-y\", \"better-investment-mcp\"]",
    "    }",
    "  }",
    "}",
    "",
    "Codex reads this TOML (~/.codex/config.toml):",
    "",
    "[mcp_servers.better-investment]",
    "command = \"npx\"",
    "args = [\"-y\", \"better-investment-mcp\"]",
    "",
    "Docker (the image runs over stdio, and its cache is a named volume):",
    "",
    "{",
    MCP_SERVERS_OPEN,
    SERVER_OPEN,
    "      \"command\": \"docker\",",
    "      \"args\": [\"run\", \"-i\", \"--rm\", \"-v\", \"better-investment-cache:/cache\", \"ghcr.io/guilhermebkel/better-investment-mcp\"]",
    "    }",
    "  }",
    "}",
    "",
    "Docker over HTTP (the server runs on this machine; replace the token with your own secret of at least 8 characters):",
    "",
    "docker run -d --name investment-mcp -p 127.0.0.1:3100:3100 \\",
    "  -e INVESTMENT_MCP_TRANSPORT=http -e INVESTMENT_MCP_HTTP_HOST=0.0.0.0 \\",
    "  -e INVESTMENT_MCP_HTTP_TOKEN='your-long-random-secret' \\",
    "  -v better-investment-cache:/cache ghcr.io/guilhermebkel/better-investment-mcp",
    "",
    "{",
    MCP_SERVERS_OPEN,
    SERVER_OPEN,
    "      \"url\": \"http://127.0.0.1:3100/mcp\",",
    "      \"headers\": { \"Authorization\": \"Bearer your-long-random-secret\" }",
    "    }",
    "  }",
    "}",
  ].join("\n");

  static run(): void {
    // Why: stdout belongs to the MCP protocol, so the configuration is printed on stderr like every other message for a person.
    LogUtil.showMessage(InitRunner.CLIENT_CONFIG_TEXT);
  }
}
