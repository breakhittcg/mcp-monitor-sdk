import crypto from "crypto";

const DEFAULT_API_URL = "https://mcp-monitor-production.up.railway.app";

export function createMonitor(options = {}) {
  const {
    apiKey,
    apiUrl = DEFAULT_API_URL,
    agent = "default-agent",
    enabled = true,
    batchSize = 1,
    debug = false,
  } = options;

  if (!apiKey) {
    console.warn("[mcp-monitor] No API key provided. Get one at https://mcp-monitor.vercel.app");
    return { wrap };
  }

  const queue = [];
  let sessionCounter = 0;

  function log(msg) {
    if (debug) console.log(`[mcp-monitor] ${msg}`);
  }

  async function sendLog(logData) {
    if (!enabled) return;

    try {
      const res = await fetch(`${apiUrl}/api/logs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": apiKey,
        },
        body: JSON.stringify(logData),
      });

      if (!res.ok) {
        log(`Failed to send log: ${res.status}`);
      } else {
        log(`Sent: ${logData.tool} [${logData.status}] ${logData.duration}ms`);
      }
    } catch (e) {
      log(`Error sending log: ${e.message}`);
    }
  }

  function createSession(name) {
    sessionCounter++;
    const sessionId = crypto.randomUUID();
    const sessionName = name || `Session #${sessionCounter}`;
    let stepCounter = 0;

    return {
      sessionId,
      sessionName,

      async trackCall(toolName, params, executeFn) {
        stepCounter++;
        const start = Date.now();
        let status = "success";
        let response = null;
        let error = null;

        try {
          response = await executeFn();
          return response;
        } catch (e) {
          status = "error";
          error = e.message || String(e);
          throw e;
        } finally {
          await sendLog({
            id: crypto.randomUUID(),
            tool: toolName,
            params,
            response: status === "success" ? response : null,
            error,
            status,
            duration: Date.now() - start,
            agent,
            sessionId,
            sessionName,
            step: stepCounter,
            timestamp: new Date().toISOString(),
          });
        }
      },
    };
  }

  function wrap(mcpServer) {
    const originalTool = mcpServer.tool?.bind(mcpServer);

    if (!originalTool) {
      console.warn("[mcp-monitor] Could not find .tool() method on MCP server");
      return mcpServer;
    }

    const registeredTools = [];

    mcpServer.tool = function (name, ...args) {
      // MCP SDK .tool() can be called as:
      // .tool(name, schema, handler)
      // .tool(name, description, schema, handler)
      let description, schema, handler;

      if (args.length === 2) {
        schema = args[0];
        handler = args[1];
      } else if (args.length === 3) {
        description = args[0];
        schema = args[1];
        handler = args[2];
      } else {
        // Unknown format, pass through
        return originalTool(name, ...args);
      }

      registeredTools.push(name);
      log(`Monitoring tool: ${name}`);

      const wrappedHandler = async (params, extra) => {
        const logId = crypto.randomUUID();
        const start = Date.now();
        let status = "success";
        let response = null;
        let error = null;

        // Try to extract session info from params or extra
        const sessionId = extra?.sessionId || params?.sessionId || crypto.randomUUID();
        const sessionName = extra?.sessionName || params?.sessionName || "Auto Session";

        try {
          response = await handler(params, extra);
          return response;
        } catch (e) {
          status = "error";
          error = e.message || String(e);
          throw e;
        } finally {
          sendLog({
            id: logId,
            tool: name,
            params: sanitizeParams(params),
            response: status === "success" ? sanitizeResponse(response) : null,
            error,
            status,
            duration: Date.now() - start,
            agent,
            sessionId,
            sessionName,
            step: 0,
            timestamp: new Date().toISOString(),
          });
        }
      };

      if (description) {
        return originalTool(name, description, schema, wrappedHandler);
      } else {
        return originalTool(name, schema, wrappedHandler);
      }
    };

    log(`Wrapped MCP server (${registeredTools.length} tools will be monitored)`);
    return mcpServer;
  }

  return { wrap, createSession, sendLog };
}

// Sanitize params to avoid sending sensitive data and keep payloads small
function sanitizeParams(params) {
  if (!params) return {};
  try {
    const str = JSON.stringify(params);
    if (str.length > 5000) {
      return { _truncated: true, _size: str.length, _preview: str.slice(0, 500) };
    }
    return params;
  } catch {
    return { _error: "Could not serialize params" };
  }
}

function sanitizeResponse(response) {
  if (!response) return null;
  try {
    const str = JSON.stringify(response);
    if (str.length > 10000) {
      return { _truncated: true, _size: str.length, _preview: str.slice(0, 500) };
    }
    return response;
  } catch {
    return { _error: "Could not serialize response" };
  }
}

export default createMonitor;