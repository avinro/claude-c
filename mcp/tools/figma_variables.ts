import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ValidatedEnv } from "../lib/env.js";

const Schema = z.object({
  action: z.enum(["list", "create_variable", "update_variable", "create_collection"]).describe(
    "list: get all variables | create_variable: new variable | update_variable: change value | create_collection: new variable collection"
  ),
  file_key: z.string().describe("Figma file key"),
  collection_id: z.string().optional().describe("Collection ID for create_variable"),
  variable_id: z.string().optional().describe("Variable ID for update_variable"),
  name: z.string().optional().describe("Name for new variable or collection"),
  resolved_type: z.enum(["COLOR", "FLOAT", "STRING", "BOOLEAN"]).optional().describe("Type for create_variable"),
  value: z.union([z.string(), z.number(), z.boolean()]).optional().describe("Value to set (string for colors: '#FF0000')"),
  mode_id: z.string().optional().describe("Mode ID for the value binding"),
});

async function figmaPost(path: string, body: unknown, token: string) {
  const res = await fetch(`https://api.figma.com/v1${path}`, {
    method: "POST",
    headers: { "X-Figma-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Figma API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function figmaGet(path: string, token: string) {
  const res = await fetch(`https://api.figma.com/v1${path}`, { headers: { "X-Figma-Token": token }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) {
    // 403 here almost always means the org is not on the Enterprise plan (Variables REST API requirement)
    const body = await res.text().catch(() => "");
    throw new Error(`Figma API ${res.status}: ${res.statusText}${body ? ` — ${body.slice(0, 300)}` : ""}`);
  }
  return res.json();
}

export function registerFigmaVariables(server: McpServer, env: ValidatedEnv) {
  server.tool(
    "figma_variables",
    "Manage Figma design variables (design tokens): list, create, update variables and collections. Full CRUD via Figma Variables REST API. Note: this API requires a Figma Enterprise org — expect 403 otherwise.",
    Schema.shape,
    async (input) => {
      if (!env.FIGMA_TOKEN) return { content: [{ type: "text" as const, text: "figma_variables requires FIGMA_TOKEN" }], isError: true };
      try {
        let data: unknown;
        switch (input.action) {
          case "list":
            data = await figmaGet(`/files/${input.file_key}/variables/local`, env.FIGMA_TOKEN);
            break;
          case "create_collection":
            if (!input.name) throw new Error("name required");
            data = await figmaPost(`/files/${input.file_key}/variables`, {
              variableCollections: [{ action: "CREATE", name: input.name }],
            }, env.FIGMA_TOKEN);
            break;
          case "create_variable":
            if (!input.name || !input.collection_id || !input.resolved_type) throw new Error("name, collection_id, resolved_type required");
            data = await figmaPost(`/files/${input.file_key}/variables`, {
              variables: [{ action: "CREATE", name: input.name, variableCollectionId: input.collection_id, resolvedType: input.resolved_type }],
            }, env.FIGMA_TOKEN);
            break;
          case "update_variable": {
            if (!input.variable_id || !input.mode_id) throw new Error("variable_id, mode_id required");
            const val = typeof input.value === "string" && input.value.startsWith("#")
              ? hexToRgba(input.value)
              : input.value;
            data = await figmaPost(`/files/${input.file_key}/variables`, {
              variableModeValues: [{ action: "UPDATE", variableId: input.variable_id, modeId: input.mode_id, value: val }],
            }, env.FIGMA_TOKEN);
            break;
          }
        }
        return { content: [{ type: "text" as const, text: `## Figma Variables: ${input.action}\n\n\`\`\`json\n${JSON.stringify(data, null, 2).slice(0, 20000)}\n\`\`\`` }] };
      } catch (e) {
        return { content: [{ type: "text" as const, text: `figma_variables error: ${e instanceof Error ? e.message : e}` }], isError: true };
      }
    }
  );
}

function hexToRgba(hex: string): { r: number; g: number; b: number; a: number } {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return { r, g, b, a: 1 };
}
