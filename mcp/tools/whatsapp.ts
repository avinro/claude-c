import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ValidatedEnv } from "../lib/env.js";

const BRIDGE_URL = "http://localhost:3731";

async function bridgeFetch(path: string, opts?: RequestInit): Promise<Response> {
  return fetch(`${BRIDGE_URL}${path}`, {
    ...opts,
    signal: AbortSignal.timeout(10000),
  });
}

function bridgeError(res: Response, body: unknown): string {
  return `Bridge error ${res.status}: ${(body as any)?.error ?? res.statusText}`;
}

export function initWhatsappClient(): void {
  // No-op: WhatsApp client now lives in scripts/whatsapp-bridge.ts (persistent process).
  // Start it once with:  npm run start:whatsapp
}

export function registerWhatsapp(server: McpServer, env: ValidatedEnv) {
  const allowedNumbers =
    env.WHATSAPP_ALLOWED_NUMBERS?.split(",")
      .map((n) => n.trim())
      .filter(Boolean) ?? [];

  // ── Tool 1: send_whatsapp_message ─────────────────────────────────────────
  server.tool(
    "send_whatsapp_message",
    "Send a WhatsApp message to a contact or group. Phone numbers must use E.164 format with @c.us suffix (e.g. 34642381855@c.us for Spain). Requires the WhatsApp bridge to be running (npm run start:whatsapp).",
    {
      to: z
        .string()
        .describe("WhatsApp ID: 34XXXXXXXXX@c.us for contacts, groupid@g.us for groups"),
      message: z.string().min(1).max(4096),
    },
    async ({ to, message }) => {
      try {
        const res = await bridgeFetch("/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to, message }),
        });
        const body = await res.json();
        if (!res.ok) return { content: [{ type: "text" as const, text: bridgeError(res, body) }], isError: true };
        return { content: [{ type: "text" as const, text: `Enviado a ${to}` }] };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: `Bridge no disponible: ${e instanceof Error ? e.message : e}` }],
          isError: true,
        };
      }
    }
  );

  // ── Tool 2: list_whatsapp_chats ───────────────────────────────────────────
  server.tool(
    "list_whatsapp_chats",
    "List recent WhatsApp chats with their IDs (needed for send_whatsapp_message and get_whatsapp_messages).",
    { limit: z.number().int().min(1).max(50).default(20) },
    async ({ limit }) => {
      try {
        const res = await bridgeFetch(`/chats?limit=${limit}`);
        const body = await res.json();
        if (!res.ok) return { content: [{ type: "text" as const, text: bridgeError(res, body) }], isError: true };
        const lines = (body as Array<{ id: string; name: string; unread: number }>)
          .map((c, i) => `${i + 1}. ${c.name} [${c.id}] unread:${c.unread}`);
        return { content: [{ type: "text" as const, text: lines.join("\n") || "(sin chats)" }] };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: `Bridge no disponible: ${e instanceof Error ? e.message : e}` }],
          isError: true,
        };
      }
    }
  );

  // ── Tool 3: get_whatsapp_messages ─────────────────────────────────────────
  server.tool(
    "get_whatsapp_messages",
    "Fetch recent messages from a WhatsApp chat by its ID. Use list_whatsapp_chats first to get the chat_id.",
    {
      chat_id: z.string().describe("Chat ID from list_whatsapp_chats"),
      limit: z.number().int().min(1).max(100).default(20),
    },
    async ({ chat_id, limit }) => {
      try {
        const res = await bridgeFetch(`/messages/${encodeURIComponent(chat_id)}?limit=${limit}`);
        const body = await res.json();
        if (!res.ok) return { content: [{ type: "text" as const, text: bridgeError(res, body) }], isError: true };
        const lines = (body as Array<{ ts: string; from: string; body: string }>)
          .map((m) => `[${m.ts}] ${m.from}: ${m.body}`);
        return { content: [{ type: "text" as const, text: lines.join("\n") || "(sin mensajes)" }] };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: `Bridge no disponible: ${e instanceof Error ? e.message : e}` }],
          isError: true,
        };
      }
    }
  );

  // ── Tool 4: wait_for_whatsapp_command ─────────────────────────────────────
  server.tool(
    "wait_for_whatsapp_command",
    "Poll up to timeout_seconds for an incoming WhatsApp message from an allowed number. Returns sender + message body. Use in an agentic loop to receive commands from your phone.",
    { timeout_seconds: z.number().int().min(5).max(120).default(30) },
    async ({ timeout_seconds }) => {
      const allowedParam = allowedNumbers.join(",");
      const deadline = Date.now() + timeout_seconds * 1000;
      let since = Date.now() - 1000; // look for messages arrived in the last second

      while (Date.now() < deadline) {
        try {
          const res = await bridgeFetch(
            `/poll?since=${since}&allowed=${encodeURIComponent(allowedParam)}`
          );
          if (res.ok) {
            const msgs = await res.json() as Array<{ sender: string; body: string; ts: number }>;
            if (msgs.length > 0) {
              const m = msgs[0];
              return { content: [{ type: "text" as const, text: `De ${m.sender}: ${m.body}` }] };
            }
            since = Date.now();
          }
        } catch {}
        // Poll every 2 seconds
        await new Promise((r) => setTimeout(r, 2000));
      }

      return { content: [{ type: "text" as const, text: "Sin comandos recibidos (timeout)" }] };
    }
  );
}
