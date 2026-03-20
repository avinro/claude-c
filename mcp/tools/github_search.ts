import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ValidatedEnv } from "../lib/env.js";

const Schema = z.object({
  query: z.string().min(1).describe("GitHub search query. Supports qualifiers like 'language:typescript stars:>1000'"),
  search_type: z.enum(["repositories", "code", "issues", "users"]).default("repositories"),
  sort: z.enum(["stars", "forks", "updated", "best-match"]).default("best-match"),
  max_results: z.number().int().min(1).max(30).default(10),
});

interface GHItem { full_name?: string; login?: string; title?: string; name?: string; description?: string; html_url?: string; language?: string; stargazers_count?: number; repository?: { full_name: string } }

export function registerGithubSearch(server: McpServer, env: ValidatedEnv) {
  server.tool(
    "github_search",
    "Search GitHub repositories, code, issues, or users. Supports GitHub search qualifiers.",
    Schema.shape,
    async (input) => {
      if (!env.GITHUB_TOKEN) return { content: [{ type: "text" as const, text: "github_search requires GITHUB_TOKEN" }], isError: true };
      try {
        const params = new URLSearchParams({ q: input.query, per_page: String(input.max_results) });
        if (input.search_type === "repositories" && input.sort !== "best-match") params.set("sort", input.sort);
        const res = await fetch(`https://api.github.com/search/${input.search_type}?${params}`, {
          headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", Authorization: `Bearer ${env.GITHUB_TOKEN}`, "User-Agent": "claude-research-mcp/1.0" },
          signal: AbortSignal.timeout(15000),
        });
        if (res.status === 403) throw new Error("GitHub rate limit exceeded");
        if (!res.ok) throw new Error(`GitHub ${res.status}: ${res.statusText}`);
        const data = await res.json() as { items: GHItem[]; total_count: number };
        const formatted = input.search_type === "repositories"
          ? data.items.map((r, i) => `${i + 1}. **${r.full_name}** (⭐ ${r.stargazers_count ?? 0})\n   ${r.description ?? ""}\n   ${r.language ?? "?"} | ${r.html_url}`).join("\n\n")
          : data.items.map((r, i) => `${i + 1}. ${r.full_name ?? r.login ?? r.name ?? r.title}\n   ${r.html_url}`).join("\n\n");
        return { content: [{ type: "text" as const, text: `## GitHub ${input.search_type}: "${input.query}" (${data.total_count} total)\n\n${formatted}` }] };
      } catch (e) {
        return { content: [{ type: "text" as const, text: `github_search error: ${e instanceof Error ? e.message : e}` }], isError: true };
      }
    }
  );
}
