import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ValidatedEnv } from "../lib/env.js";

const Schema = z.object({
  action: z
    .enum(["get_file", "get_node", "list_components", "list_styles", "get_variables", "render_image"])
    .describe(
      "get_file: file metadata | get_node: specific node | list_components: all components | list_styles: all styles | get_variables: variable collections (Enterprise only) | render_image: render nodes to PNG URLs"
    ),
  file_key: z
    .string()
    .describe("Figma file key (from URL: figma.com/design/FILE_KEY/... or figma.com/file/FILE_KEY/...)"),
  node_id: z.string().optional().describe("Node ID for get_node/render_image (comma-separated for multiple)"),
  depth: z.number().int().min(1).max(5).default(2).describe("Tree depth for get_file/get_node"),
  scale: z.number().min(0.01).max(4).default(2).describe("Image scale for render_image (0.01-4)"),
});

async function figmaGet(path: string, token: string) {
  const res = await fetch(`https://api.figma.com/v1${path}`, {
    headers: { "X-Figma-Token": token },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Figma API ${res.status}: ${res.statusText}${body ? ` — ${body.slice(0, 300)}` : ""}`);
  }
  return res.json();
}

export function registerFigmaRead(server: McpServer, env: ValidatedEnv) {
  server.tool(
    "figma_read",
    "Read Figma files: get file structure, nodes, components, styles, variables, or render nodes as PNG images. Requires FIGMA_TOKEN (Personal Access Token from figma.com/settings).",
    Schema.shape,
    async (input) => {
      if (!env.FIGMA_TOKEN) return { content: [{ type: "text" as const, text: "figma_read requires FIGMA_TOKEN" }], isError: true };
      try {
        let data: unknown;
        let label = "";
        switch (input.action) {
          case "get_file":
            data = await figmaGet(`/files/${input.file_key}?depth=${input.depth}`, env.FIGMA_TOKEN);
            label = `File: ${input.file_key}`;
            break;
          case "get_node":
            if (!input.node_id) throw new Error("node_id required for get_node");
            data = await figmaGet(`/files/${input.file_key}/nodes?ids=${input.node_id}&depth=${input.depth}`, env.FIGMA_TOKEN);
            label = `Node: ${input.node_id}`;
            break;
          case "list_components":
            data = await figmaGet(`/files/${input.file_key}/components`, env.FIGMA_TOKEN);
            label = "Components";
            break;
          case "list_styles":
            data = await figmaGet(`/files/${input.file_key}/styles`, env.FIGMA_TOKEN);
            label = "Styles";
            break;
          case "get_variables":
            // Note: Variables REST API requires a Figma Enterprise org (403 otherwise)
            data = await figmaGet(`/files/${input.file_key}/variables/local`, env.FIGMA_TOKEN);
            label = "Variables";
            break;
          case "render_image":
            if (!input.node_id) throw new Error("node_id required for render_image");
            data = await figmaGet(
              `/images/${input.file_key}?ids=${input.node_id}&format=png&scale=${input.scale}`,
              env.FIGMA_TOKEN
            );
            label = `Image render: ${input.node_id}`;
            break;
        }
        const text = JSON.stringify(data, null, 2).slice(0, 30000);
        return { content: [{ type: "text" as const, text: `## Figma ${label}\n\n\`\`\`json\n${text}\n\`\`\`` }] };
      } catch (e) {
        return { content: [{ type: "text" as const, text: `figma_read error: ${e instanceof Error ? e.message : e}` }], isError: true };
      }
    }
  );
}
