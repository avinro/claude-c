import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ValidatedEnv } from "../lib/env.js";

const Schema = z.object({
  query: z.string().min(1).describe("Search query for academic papers"),
  max_results: z.number().int().min(1).max(50).default(10),
  sort_by: z.enum(["relevance", "lastUpdatedDate", "submittedDate"]).default("relevance"),
  category: z.string().optional().describe("ArXiv category, e.g. 'cs.AI', 'math.CO'"),
});

export function registerArxivSearch(server: McpServer, _env: ValidatedEnv) {
  server.tool(
    "arxiv_search",
    "Search academic papers on ArXiv.org (no API key required). Returns titles, authors, abstracts, and PDF links.",
    Schema.shape,
    async (input) => {
      try {
        const q = input.category ? `(${input.query}) AND cat:${input.category}` : input.query;
        const params = new URLSearchParams({
          search_query: `all:${q}`,
          start: "0",
          max_results: String(input.max_results),
          sortBy: input.sort_by,
          sortOrder: "descending",
        });
        const res = await fetch(`https://export.arxiv.org/api/query?${params}`, { signal: AbortSignal.timeout(20000) });
        if (!res.ok) throw new Error(`ArXiv ${res.status}`);
        const xml = await res.text();

        const entries = xml.match(/<entry>([\s\S]*?)<\/entry>/g) ?? [];
        const results = entries.map((e, i) => {
          const title = e.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim() ?? "?";
          const summary = e.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]?.trim() ?? "";
          const id = e.match(/<id>(.*?)<\/id>/)?.[1]?.trim() ?? "";
          const authors = [...e.matchAll(/<name>(.*?)<\/name>/g)].map(m => m[1]).join(", ");
          const date = e.match(/<published>(.*?)<\/published>/)?.[1]?.slice(0, 10) ?? "";
          return `${i + 1}. **${title}**\nAuthors: ${authors} | ${date}\nPDF: ${id.replace("abs", "pdf")}\n${summary.slice(0, 350)}${summary.length > 350 ? "..." : ""}`;
        });

        return { content: [{ type: "text" as const, text: `## ArXiv: "${input.query}"\n\n${results.join("\n\n---\n\n") || "No results."}` }] };
      } catch (e) {
        return { content: [{ type: "text" as const, text: `arxiv_search error: ${e instanceof Error ? e.message : e}` }], isError: true };
      }
    }
  );
}
