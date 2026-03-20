import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ValidatedEnv } from "../lib/env.js";

const Schema = z.object({
  query: z.string().min(1).describe("Search query"),
  count: z.number().int().min(1).max(20).default(10).describe("Number of results"),
  country: z.string().length(2).optional().describe("ISO country code e.g. 'US'"),
});

export function registerWebSearch(server: McpServer, env: ValidatedEnv) {
  server.tool(
    "web_search",
    "Search the web using Brave Search API. Returns titles, URLs, and snippets.",
    Schema.shape,
    async (input) => {
      if (!env.BRAVE_API_KEY) return { content: [{ type: "text" as const, text: "web_search requires BRAVE_API_KEY" }], isError: true };
      try {
        const params = new URLSearchParams({ q: input.query, count: String(input.count) });
        if (input.country) params.set("country", input.country);
        const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
          headers: { Accept: "application/json", "X-Subscription-Token": env.BRAVE_API_KEY },
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) throw new Error(`Brave ${res.status}: ${res.statusText}`);
        const data = await res.json() as { web?: { results: Array<{ title: string; url: string; description?: string }> } };
        const items = data.web?.results ?? [];
        const text = items.map((r, i) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.description ?? ""}`).join("\n\n");
        return { content: [{ type: "text" as const, text: `## Web Search: "${input.query}"\n\n${text || "No results."}` }] };
      } catch (e) {
        return { content: [{ type: "text" as const, text: `web_search error: ${e instanceof Error ? e.message : e}` }], isError: true };
      }
    }
  );
}
