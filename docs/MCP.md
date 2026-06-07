# ECHO Core MCP Integration

## Setup

Add to Claude Desktop `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "echoc": {
      "command": "node",
      "args": ["/path/to/echo-core/bin/echo-mcp.js"]
    }
  }
}
```

Or after `npm install -g echo-core`, use the `echo-mcp` command directly:

```json
{
  "mcpServers": {
    "echoc": {
      "command": "echo-mcp"
    }
  }
}
```

## Tools

### `echo_search`

Search the knowledge base.

Input:
```json
{
  "query": "machine learning",
  "language": "en",
  "topK": 5
}
```

Returns assembled context with citations.

### `echo_ingest`

Ingest a file.

Input:
```json
{
  "sourcePath": "/absolute/path/to/file.txt",
  "mimeType": "text/plain"
}
```

Returns sourceId and rootHash.

### `echo_status`

Get engine status.

### `echo_get_node`

Get node by hash.

Input:
```json
{
  "hash": "sha256"
}
```

## Resources (Future)

- `echo://nodes/{hash}` — read node content
- `echo://sources/{id}` — read source metadata
