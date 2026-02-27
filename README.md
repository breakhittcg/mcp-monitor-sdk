# MCP Monitor

Real-time monitoring and observability for MCP (Model Context Protocol) servers.

See your AI agents' tool calls, errors, costs, and performance in a beautiful dashboard.

## Installation
```bash
npm install mcp-monitor
```

## Quick Start
```javascript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMonitor } from "mcp-monitor";

// Create your MCP server as usual
const server = new McpServer({ name: "my-server" });

// Create a monitor and wrap your server
const monitor = createMonitor({
  apiKey: "mk_your_api_key_here", // Get your key at https://app.mcpmonitor.io
  agent: "my-agent",
});

monitor.wrap(server);

// Register tools as usual — they're automatically monitored
server.tool("search", { query: z.string() }, async ({ query }) => {
  // your logic here
});
```

## Manual Tracking

For more control, use sessions:
```javascript
const monitor = createMonitor({ apiKey: "mk_..." });

const session = monitor.createSession("Customer Lookup");

const result = await session.trackCall("search_customer", { query: "John" }, async () => {
  // your actual tool logic
  return { found: true, name: "John Doe" };
});
```

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `apiKey` | required | Your MCP Monitor API key |
| `apiUrl` | Production URL | API endpoint |
| `agent` | `"default-agent"` | Name of this agent |
| `enabled` | `true` | Enable/disable monitoring |
| `debug` | `false` | Log debug messages |

## Dashboard

View your data at [mcpmonitor.io](https://mcpmonitor.io)

## License

MIT