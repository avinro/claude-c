import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ValidatedEnv } from "../lib/env.js";

const Schema = z.object({
  question: z.string().min(1).describe("Research question to answer using the provided sources"),
  sources: z.array(z.object({
    type: z.enum(["url", "text", "file_path"]),
    content: z.string().describe("URL string, raw text, or absolute file path"),
    title: z.string().optional(),
  })).min(1).max(10).describe("Sources to research over"),
  model: z.enum(["gemini-2.0-flash", "gemini-1.5-pro", "gemini-2.0-flash-lite"]).default("gemini-2.0-flash"),
});

export function registerDocumentResearch(server: McpServer, env: ValidatedEnv) {
  server.tool(
    "document_research",
    "Research a question over provided documents, URLs, or text using Gemini AI. Upload sources as context and get a cited answer. This is the API-key alternative to NotebookLM.",
    Schema.shape,
    async (input) => {
      if (!env.GEMINI_API_KEY) return { content: [{ type: "text" as const, text: "document_research requires GEMINI_API_KEY" }], isError: true };
      try {
        const { GoogleGenerativeAI } = await import("@google/generative-ai");
        const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: input.model });

        // Fetch URL sources as text
        const sourceParts: string[] = [];
        for (const src of input.sources) {
          const label = src.title ?? src.content.slice(0, 60);
          if (src.type === "url") {
            try {
              const res = await fetch(src.content, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(10000) });
              const html = await res.text();
              const text = html.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 15000);
              sourceParts.push(`### Source: ${label}\n${text}`);
            } catch { sourceParts.push(`### Source: ${label}\n[Could not fetch URL]`); }
          } else if (src.type === "text") {
            sourceParts.push(`### Source: ${label}\n${src.content.slice(0, 15000)}`);
          } else if (src.type === "file_path") {
            try {
              const { readFileSync } = await import("fs");
              const text = readFileSync(src.content, "utf-8").slice(0, 15000);
              sourceParts.push(`### Source: ${label}\n${text}`);
            } catch { sourceParts.push(`### Source: ${label}\n[Could not read file]`); }
          }
        }

        const prompt = `You are a research assistant. Based ONLY on the sources below, answer the question thoroughly with specific citations to the sources.\n\nQuestion: ${input.question}\n\n---\n\n${sourceParts.join("\n\n---\n\n")}\n\n---\n\nAnswer with citations:`;
        const result = await model.generateContent(prompt);
        const answer = result.response.text();
        return { content: [{ type: "text" as const, text: `## Research: ${input.question}\n\n${answer}` }] };
      } catch (e) {
        return { content: [{ type: "text" as const, text: `document_research error: ${e instanceof Error ? e.message : e}` }], isError: true };
      }
    }
  );
}
