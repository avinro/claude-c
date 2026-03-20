import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ValidatedEnv } from "../lib/env.js";

const Schema = z.object({
  query: z.string().min(1),
  language: z.string().length(2).default("en"),
  max_results: z.number().int().min(1).max(100).default(10),
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("YYYY-MM-DD"),
  sort_by: z.enum(["publishedAt", "relevancy", "popularity"]).default("publishedAt"),
});

interface Article { title: string; url: string; description?: string; publishedAt?: string; source?: { name: string } }

function format(query: string, articles: Article[]) {
  const text = articles.map((a, i) => `${i + 1}. **${a.title}**\n   ${a.source?.name ?? "?"} | ${a.publishedAt?.slice(0, 10) ?? ""}\n   ${a.url}\n   ${a.description ?? ""}`).join("\n\n");
  return { content: [{ type: "text" as const, text: `## News: "${query}"\n\n${text || "No articles found."}` }] };
}

export function registerNewsSearch(server: McpServer, env: ValidatedEnv) {
  server.tool(
    "news_search",
    "Search current news articles. Uses NewsAPI if NEWS_API_KEY set, falls back to GNews if GNEWS_API_KEY set.",
    Schema.shape,
    async (input) => {
      if (!env.NEWS_API_KEY && !env.GNEWS_API_KEY) return { content: [{ type: "text" as const, text: "news_search requires NEWS_API_KEY or GNEWS_API_KEY" }], isError: true };
      try {
        if (env.NEWS_API_KEY) {
          const params = new URLSearchParams({ q: input.query, language: input.language, pageSize: String(input.max_results), sortBy: input.sort_by, ...(input.from_date && { from: input.from_date }) });
          const res = await fetch(`https://newsapi.org/v2/everything?${params}`, { headers: { "X-Api-Key": env.NEWS_API_KEY }, signal: AbortSignal.timeout(15000) });
          if (!res.ok) throw new Error(`NewsAPI ${res.status}`);
          const data = await res.json() as { articles: Article[] };
          return format(input.query, data.articles);
        } else {
          const params = new URLSearchParams({ q: input.query, lang: input.language, max: String(Math.min(input.max_results, 10)), token: env.GNEWS_API_KEY! });
          const res = await fetch(`https://gnews.io/api/v4/search?${params}`, { signal: AbortSignal.timeout(15000) });
          if (!res.ok) throw new Error(`GNews ${res.status}`);
          const data = await res.json() as { articles: Article[] };
          return format(input.query, data.articles);
        }
      } catch (e) {
        return { content: [{ type: "text" as const, text: `news_search error: ${e instanceof Error ? e.message : e}` }], isError: true };
      }
    }
  );
}
