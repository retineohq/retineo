# RETINEO Core MCP Integration

## Setup

Add to Claude Desktop `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "retineo": {
      "command": "node",
      "args": ["/path/to/retineo/bin/retineo-mcp.js"]
    }
  }
}
```

Or after `npm install -g retineo`, use the `retineo-mcp` command directly:

```json
{
  "mcpServers": {
    "retineo": {
      "command": "retineo-mcp"
    }
  }
}
```

## Tools

### `retineo_search`

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

### `retineo_ingest`

Ingest a file.

Input:
```json
{
  "sourcePath": "/absolute/path/to/file.txt",
  "mimeType": "text/plain"
}
```

Returns sourceId and rootHash.

### `retineo_status`

Get engine status.

### `retineo_get_node`

Get node by hash.

Input:
```json
{
  "hash": "sha256"
}
```

## Resources (Future)

- `retineo://nodes/{hash}` — read node content
- `retineo://sources/{id}` — read source metadata
