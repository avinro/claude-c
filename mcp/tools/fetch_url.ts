import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ValidatedEnv } from "../lib/env.js";

const Schema = z.object({
  url: z.string().url().describe("URL to fetch content from"),
  extract_text: z.boolean().default(true).describe("Strip HTML and return plain text"),
  max_length: z.number().int().min(100).max(50000).default(10000).describe("Max characters to return"),
  timeout_ms: z.number().int().min(1000).max(30000).default(10000).describe("Request timeout in ms"),
});

export function registerFetchUrl(server: McpServer, _env: ValidatedEnv) {
  server.tool(
    "fetch_url",
    "Fetch and extract content from any publicly accessible URL. Strips HTML to return readable text. Useful for reading articles, docs, or any web page.",
    Schema.shape,
    async (input) => {
      try {
        const res = await fetch(input.url, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; ResearchBot/1.0)" },
          signal: AbortSignal.timeout(input.timeout_ms),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

        const ct = res.headers.get("content-type") ?? "";
        let text = await res.text();

        if (input.extract_text && ct.includes("html")) {
          text = text
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s{2,}/g, " ")
            .trim();
        }

        const truncated = text.slice(0, input.max_length);
        const more = text.length > input.max_length ? "\n\n[Content truncated]" : "";
        return { content: [{ type: "text" as const, text: `## ${input.url}\n\n${truncated}${more}` }] };
      } catch (e) {
        return { content: [{ type: "text" as const, text: `fetch_url error: ${e instanceof Error ? e.message : e}` }], isError: true };
      }
    }
  );
}
