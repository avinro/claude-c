import { z } from "zod";

const EnvSchema = z.object({
  // Research APIs
  BRAVE_API_KEY: z.string().optional(),
  PERPLEXITY_API_KEY: z.string().optional(),
  NEWS_API_KEY: z.string().optional(),
  GNEWS_API_KEY: z.string().optional(),

  // Dev tools
  GITHUB_TOKEN: z.string().optional(),
  FIGMA_TOKEN: z.string().optional(),

  // AI / document research
  GEMINI_API_KEY: z.string().optional(),

  // Linear
  LINEAR_API_KEY: z.string().optional(),
  LINEAR_WEBHOOK_SECRET: z.string().optional(),

  // WhatsApp — comma-separated E.164 numbers allowed to send commands, e.g. "521XXXXXXXXXX,521YYYYYYYYYY"
  // IMPORTANT: set this before use — without it, any sender can trigger Claude Code commands
  WHATSAPP_ALLOWED_NUMBERS: z.string().optional(),

  // Server config
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type ValidatedEnv = z.infer<typeof EnvSchema>;

export function validateEnv(): ValidatedEnv {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    process.stderr.write(
      `[MCP] Env validation failed: ${JSON.stringify(result.error.flatten().fieldErrors)}\n`
    );
    process.exit(1);
  }
  return result.data;
}
