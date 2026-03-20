import { z } from "zod";
import { spawn } from "child_process";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ValidatedEnv } from "../lib/env.js";
import { logger } from "../lib/logger.js";

// Path to the notebooklm CLI inside the dedicated venv
const NOTEBOOKLM_BIN = process.env.NOTEBOOKLM_BIN ?? "/Users/avinro/.notebooklm-venv/bin/notebooklm";

const Schema = z.object({
  action: z.enum([
    "list",
    "ask",
    "create",
    "generate",
    "source_add",
    "source_list",
    "download",
    "status",
  ]).describe(
    "list: list notebooks | ask: query active notebook | create: new notebook | generate: produce audio/quiz/report/etc | source_add: add URL/file to notebook | source_list: list sources | download: download artifact | status: current context"
  ),
  notebook: z.string().optional().describe("Notebook name or ID (required for ask, generate, source_add, source_list, download)"),
  question: z.string().optional().describe("Question text for 'ask' action"),
  sources: z.array(z.string()).optional().describe("URLs or file paths for 'create' or 'source_add' actions"),
  generate_type: z.enum(["audio", "report", "quiz", "flashcards", "mind-map", "slide-deck", "infographic"]).optional().describe("Content type for 'generate' action"),
  generate_format: z.string().optional().describe("Format for audio (deep-dive, brief, critique, debate) or report (briefing-doc, study-guide, blog-post)"),
  download_type: z.enum(["audio", "report", "mind-map", "infographic", "slide-deck", "quiz", "flashcards"]).optional().describe("Artifact type to download"),
  output_path: z.string().optional().describe("Local file path for 'download' output (e.g. /tmp/podcast.mp3)"),
  notebook_title: z.string().optional().describe("Title for 'create' action"),
});

function runCli(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    logger.debug("notebooklm CLI", { args });
    // Use shell:false with explicit path — avoids PATH issues in MCP subprocess
    const proc = spawn(NOTEBOOKLM_BIN, args, {
      timeout: 300000,
      env: { ...process.env, PATH: `/Users/avinro/.notebooklm-venv/bin:${process.env.PATH}` },
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("error", (err) => {
      reject(new Error(
        `notebooklm CLI not found at ${NOTEBOOKLM_BIN}.\n` +
        `Run: python3 -m venv ~/.notebooklm-venv && ~/.notebooklm-venv/bin/pip install notebooklm-py[browser]\n` +
        `Then: ~/.notebooklm-venv/bin/notebooklm login\n` +
        `Original error: ${err.message}`
      ));
    });
    proc.on("close", (code) => {
      if (code !== 0) reject(new Error(stderr.trim() || stdout.trim() || `Exit code ${code}`));
      else resolve(stdout.trim());
    });
  });
}

/**
 * Resolve a notebook name OR uuid to a full UUID via `notebooklm list --json`.
 * Workaround for the GET_NOTEBOOK RPC bug (#114): passing a full UUID skips
 * the partial-ID resolution path in the CLI, which avoids the failing RPC.
 */
async function resolveNotebookId(nameOrId: string): Promise<string> {
  // Already a full UUID — use directly, no RPC needed
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(nameOrId)) {
    return nameOrId;
  }
  // Use --json for reliable full UUID extraction (avoids table truncation)
  const listOutput = await runCli(["list", "--json"]);
  try {
    const data = JSON.parse(listOutput);
    const notebooks: Array<{ id: string; title: string }> = data.notebooks ?? data ?? [];
    const match = notebooks.find(nb =>
      nb.title.toLowerCase().includes(nameOrId.toLowerCase())
    );
    if (match) {
      logger.debug("resolveNotebookId: matched via JSON list", { nameOrId, id: match.id, title: match.title });
      return match.id;
    }
  } catch (e) {
    logger.warn("resolveNotebookId: failed to parse JSON list", { err: String(e) });
  }
  logger.warn("resolveNotebookId: no match found, using as-is", { nameOrId });
  return nameOrId;
}

export function registerNotebooklm(server: McpServer, _env: ValidatedEnv) {
  server.tool(
    "notebooklm",
    "Interact with Google NotebookLM. Pre-requisite: notebooklm login (one-time browser auth). Actions: list, ask, create, generate (audio/report/quiz/flashcards/mind-map/slide-deck/infographic), source_add, source_list, download, status.",
    Schema.shape,
    async (input) => {
      try {
        let result = "";

        switch (input.action) {
          case "status":
            result = await runCli(["status"]);
            break;

          case "list":
            result = await runCli(["list"]);
            break;

          case "ask": {
            if (!input.notebook) throw new Error("'notebook' is required for ask");
            if (!input.question) throw new Error("'question' is required for ask");
            // Resolve title→UUID first to avoid GET_NOTEBOOK RPC bug (#114)
            const askId = await resolveNotebookId(input.notebook);
            await runCli(["use", askId]);
            result = await runCli(["ask", input.question]);
            break;
          }

          case "create": {
            const title = input.notebook_title ?? `Research ${new Date().toISOString().slice(0, 10)}`;
            // Use --json to capture the full notebook UUID directly from create output
            const createRaw = await runCli(["create", title, "--json"]);
            result = createRaw;
            let notebookId = title;
            try {
              const createData = JSON.parse(createRaw);
              notebookId = createData.notebook?.id ?? title;
              logger.debug("create: captured notebook UUID from JSON", { notebookId });
            } catch (e) {
              logger.warn("create: could not parse JSON, falling back to list resolution", { err: String(e) });
              notebookId = await resolveNotebookId(title);
            }
            if (input.sources?.length) {
              await runCli(["use", notebookId]);
              for (const src of input.sources) {
                try {
                  await runCli(["source", "add", src]);
                  logger.info("Added source to notebook", { src });
                } catch (e) {
                  logger.warn("Failed to add source", { src, err: String(e) });
                }
              }
              result += `\nAdded ${input.sources.length} source(s) to "${title}"`;
            }
            result += `\nNotebook ID: ${notebookId}`;
            break;
          }

          case "source_add": {
            if (!input.notebook) throw new Error("'notebook' is required for source_add");
            if (!input.sources?.length) throw new Error("'sources' array is required for source_add");
            const sourceAddId = await resolveNotebookId(input.notebook);
            await runCli(["use", sourceAddId]);
            const added: string[] = [];
            for (const src of input.sources) {
              await runCli(["source", "add", src]);
              added.push(src);
            }
            result = `Added ${added.length} source(s) to "${input.notebook}":\n${added.join("\n")}`;
            break;
          }

          case "source_list": {
            if (!input.notebook) throw new Error("'notebook' is required for source_list");
            const srcListId = await resolveNotebookId(input.notebook);
            await runCli(["use", srcListId]);
            result = await runCli(["source", "list"]);
            break;
          }

          case "generate": {
            if (!input.notebook) throw new Error("'notebook' is required for generate");
            if (!input.generate_type) throw new Error("'generate_type' is required for generate");
            const genId = await resolveNotebookId(input.notebook);
            await runCli(["use", genId]);
            const genArgs = ["generate", input.generate_type];
            if (input.generate_format) genArgs.push("--format", input.generate_format);
            result = await runCli(genArgs);
            break;
          }

          case "download": {
            if (!input.notebook) throw new Error("'notebook' is required for download");
            if (!input.download_type) throw new Error("'download_type' is required for download");
            const dlId = await resolveNotebookId(input.notebook);
            await runCli(["use", dlId]);
            const dlArgs = ["download", input.download_type];
            if (input.output_path) dlArgs.push(input.output_path);
            result = await runCli(dlArgs);
            break;
          }
        }

        return { content: [{ type: "text" as const, text: `## NotebookLM: ${input.action}\n\n${result || "(no output)"}` }] };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.error("notebooklm tool error", { action: input.action, msg });
        return { content: [{ type: "text" as const, text: `notebooklm error: ${msg}` }], isError: true };
      }
    }
  );
}
