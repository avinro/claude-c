import { z } from "zod";

declare const process: {
  env: Record<string, string | undefined>;
  stderr: {
    write(message: string): void;
  };
  exit(code?: number): never;
};

const EnvSchema = z.object({
  // Dev tools
  GITHUB_TOKEN: z.string().optional(),
  FIGMA_TOKEN: z.string().optional(),

  // AI / document research — web search goes through NotebookLM
  GEMINI_API_KEY: z.string().optional(),

  // Linear — webhook validation (MCP plugin uses OAuth, no API key needed)
  LINEAR_WEBHOOK_SECRET: z.string().optional(),

  // Server config
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type ValidatedEnv = z.infer<typeof EnvSchema>;

export function validateEnv(): ValidatedEnv {
  const result = EnvSchema.safeParse(process.env);
  if (result.success) {
    return result.data;
  }

  process.stderr.write(
    `[MCP] Env validation failed: ${JSON.stringify(result.error.flatten().fieldErrors)}\n`
  );
  process.exit(1);
}
