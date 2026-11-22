# Model Context Protocol

The MCP server runs as a local stdio process. It uses the same connection as the CLI, so run `absolute-memory login` first or provide `ABSOLUTE_MEMORY_BASE_URL` and `ABSOLUTE_MEMORY_API_KEY` to the server process. Install the repository's dependencies before connecting a client. Use a read key for retrieval and a read/write key if the client should save content.

| Tool              | Purpose                                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------------------- |
| `search_memory`   | Search saved reading by keyword and semantic relevance where configured                                   |
| `get_item`        | Read content passages, highlights, and their reader paths                                                 |
| `list_recent`     | List recent saves                                                                                         |
| `list_highlights` | List highlights by page, optionally scoped to one saved item. Pass the returned `nextOffset` as `offset`. |
| `ask_memory`      | Ask from saved passages and retrieve numbered citations                                                   |
| `save_url`        | Save a URL through a write-scoped key                                                                     |

## Claude Desktop and Cursor

Add this to Claude Desktop's `claude_desktop_config.json` or to Cursor's `~/.cursor/mcp.json`. Replace the two absolute paths with the Node executable and repository path on your machine. For project-specific Cursor configuration, use `.cursor/mcp.json`. [Claude Desktop setup](https://modelcontextprotocol.io/quickstart/user) · [Cursor MCP configuration](https://cursor.com/docs/mcp)

```json
{
  "mcpServers": {
    "absolute-memory": {
      "command": "/path/to/node",
      "args": ["/path/to/absolute-memory/packages/cli/mcp.mjs"]
    }
  }
}
```

## Claude Code

Register the local server for your account. [Claude Code MCP setup](https://code.claude.com/docs/en/mcp)

```sh
claude mcp add --transport stdio --scope user absolute-memory -- node /path/to/absolute-memory/packages/cli/mcp.mjs
```

## Codex

Register the local stdio server from a terminal. [Codex MCP setup](https://developers.openai.com/codex/mcp)

```sh
codex mcp add absolute-memory -- node /path/to/absolute-memory/packages/cli/mcp.mjs
```

`ask_memory` sends relevant passages and the question to the instance's configured model. Read tools return item IDs and relative reader paths such as `/read/<item-id>#p-2` so you can open supporting evidence in Absolute Memory.
