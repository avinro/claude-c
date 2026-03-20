import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ValidatedEnv } from "../lib/env.js";

const Schema = z.object({
  query: z.string().min(1).describe("Research question or topic"),
  model: z.enum(["sonar", "sonar-pro", "sonar-reasoning", "sonar-reasoning-pro"]).default("sonar-pro"),
  max_tokens: z.number().int().min(100).max(8000).default(2000),
});

export function registerPerplexityResearch(server: McpServer, env: ValidatedEnv) {
  server.tool(
    "perplexity_research",
    "Deep research using Perplexity AI. Best for complex questions requiring synthesis of multiple sources. Returns detailed response with citations.",
    Schema.shape,
    async (input) => {
      if (!env.PERPLEXITY_API_KEY) return { content: [{ type: "text" as const, text: "perplexity_research requires PERPLEXITY_API_KEY" }], isError: true };
      try {
        const res = await fetch("https://api.perplexity.ai/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.PERPLEXITY_API_KEY}` },
          body: JSON.stringify({
            model: input.model,
            messages: [
              { role: "system", content: "You are a thorough research assistant. Provide accurate, well-cited answers." },
              { role: "user", content: input.query },
            ],
            max_tokens: input.max_tokens,
            return_citations: true,
          }),
          signal: AbortSignal.timeout(60000),
        });
        if (!res.ok) throw new Error(`Perplexity ${res.status}: ${await res.text()}`);
        const data = await res.json() as { choices: Array<{ message: { content: string } }>; citations?: string[] };
        const content = data.choices[0]?.message?.content ?? "No response";
        const citations = data.citations ?? [];
        const citBlock = citations.length ? `\n\n## Sources\n${citations.map((c, i) => `${i + 1}. ${c}`).join("\n")}` : "";
        return { content: [{ type: "text" as const, text: `## Research: ${input.query}\n\n${content}${citBlock}` }] };
      } catch (e) {
        return { content: [{ type: "text" as const, text: `perplexity_research error: ${e instanceof Error ? e.message : e}` }], isError: true };
      }
    }
  );
}
