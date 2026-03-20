import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { validateEnv } from "./lib/env.js";
import { logger } from "./lib/logger.js";

import { registerFetchUrl } from "./tools/fetch_url.js";
import { registerArxivSearch } from "./tools/arxiv_search.js";
import { registerWebSearch } from "./tools/web_search.js";
import { registerPerplexityResearch } from "./tools/perplexity_research.js";
import { registerGithubSearch } from "./tools/github_search.js";
import { registerNewsSearch } from "./tools/news_search.js";
import { registerDocumentResearch } from "./tools/document_research.js";
import { registerNotebooklm } from "./tools/notebooklm.js";
import { registerFigmaRead } from "./tools/figma_read.js";
import { registerFigmaVariables } from "./tools/figma_variables.js";
import { registerCreateResearchReport } from "./tools/create_research_report.js";
import { registerWhatsapp, initWhatsappClient } from "./tools/whatsapp.js";

async function main() {
  const env = validateEnv();

  const server = new McpServer({
    name: "claude-research-mcp",
    version: "1.0.0",
  });

  // Register all tools
  registerFetchUrl(server, env);
  registerArxivSearch(server, env);
  registerWebSearch(server, env);
  registerPerplexityResearch(server, env);
  registerGithubSearch(server, env);
  registerNewsSearch(server, env);
  registerDocumentResearch(server, env);
  registerNotebooklm(server, env);
  registerFigmaRead(server, env);
  registerFigmaVariables(server, env);
  registerCreateResearchReport(server, env);
  registerWhatsapp(server, env);
  initWhatsappClient(); // non-blocking — Puppeteer starts in background, waReady gates tool calls

  // CRITICAL: StdioServerTransport reads from stdin, writes to stdout.
  // Nothing else may write to stdout — all logging uses stderr via logger.
  const transport = new StdioServerTransport();

  logger.info("MCP server starting (15 tools registered)");
  await server.connect(transport);
  logger.info("MCP server connected and ready");
}

main().catch((err) => {
  process.stderr.write(`[MCP] Fatal: ${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
});
