// All output goes to stderr — stdout is reserved for MCP JSON-RPC wire protocol
const level = process.env.LOG_LEVEL ?? "info";
const levels = ["debug", "info", "warn", "error"];
const levelIdx = levels.indexOf(level);

function write(prefix: string, msg: string, data?: unknown) {
  const line = data !== undefined
    ? `${prefix} ${msg} ${JSON.stringify(data)}\n`
    : `${prefix} ${msg}\n`;
  process.stderr.write(line);
}

export const logger = {
  debug: (msg: string, data?: unknown) => {
    if (levelIdx <= 0) write("[MCP:DEBUG]", msg, data);
  },
  info: (msg: string, data?: unknown) => {
    if (levelIdx <= 1) write("[MCP:INFO]", msg, data);
  },
  warn: (msg: string, data?: unknown) => {
    if (levelIdx <= 2) write("[MCP:WARN]", msg, data);
  },
  error: (msg: string, data?: unknown) => {
    write("[MCP:ERROR]", msg, data);
  },
};
