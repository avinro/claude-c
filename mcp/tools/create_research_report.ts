import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ValidatedEnv } from "../lib/env.js";

const SourceSchema = z.object({
  title: z.string(),
  url: z.string().url().optional(),
  content: z.string(),
  source_type: z.enum(["web", "arxiv", "news", "github", "perplexity", "gemini", "other"]),
  date: z.string().optional(),
});

const Schema = z.object({
  topic: z.string().min(1).describe("Research topic or question"),
  sources: z.array(SourceSchema).min(1).max(20),
  sections: z.array(z.string()).optional().describe("Custom section headings"),
  include_toc: z.boolean().default(true),
});

export function registerCreateResearchReport(server: McpServer, _env: ValidatedEnv) {
  server.tool(
    "create_research_report",
    "Aggregate multiple research sources into a structured markdown report with citations.",
    Schema.shape,
    async (input) => {
      type Source = z.infer<typeof SourceSchema>;
      const sections: string[] = input.sections ?? ["Executive Summary", "Key Findings", "Detailed Analysis", "Sources & References"];
      const date = new Date().toISOString().slice(0, 10);
      const lines: string[] = [`# Research Report: ${input.topic}`, `*Generated: ${date} | Sources: ${input.sources.length}*`, ""];

      if (input.include_toc) {
        lines.push("## Table of Contents");
        sections.forEach((s: string, i: number) => {
          const anchor = s.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
          lines.push(`${i + 1}. [${s}](#${anchor})`);
        });
        lines.push("");
      }

      sections.forEach((section: string) => {
        lines.push(`## ${section}`, "");
        const sl = section.toLowerCase();
        if (sl.includes("source") || sl.includes("reference")) {
          input.sources.forEach((s: Source, i: number) => {
            lines.push(`${i + 1}. **${s.title}** (${s.source_type})${s.date ? ` — ${s.date}` : ""}`);
            if (s.url) lines.push(`   - ${s.url}`);
            lines.push(`   - ${s.content.slice(0, 200)}${s.content.length > 200 ? "..." : ""}`);
          });
        } else if (sl.includes("summary")) {
          lines.push(`This report covers **${input.topic}** based on ${input.sources.length} sources.`, "");
          input.sources.slice(0, 5).forEach((s: Source) => lines.push(`- ${s.title}`));
        } else {
          input.sources.forEach((s: Source) => {
            lines.push(`### ${s.title}`);
            if (s.url) lines.push(`*${s.source_type} — [link](${s.url})*`);
            lines.push("", s.content, "");
          });
        }
        lines.push("");
      });

      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    }
  );
}
