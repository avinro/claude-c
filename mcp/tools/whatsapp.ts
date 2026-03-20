import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ValidatedEnv } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import { execSync } from "child_process";
// whatsapp-web.js ships as CommonJS — use default import (esModuleInterop handles it)
import pkg from "whatsapp-web.js";
import QRCode from "qrcode";

const { Client, LocalAuth } = pkg;
type WAClient = InstanceType<typeof Client>;

let waClient: WAClient | null = null;
let waReady = false;

const SESSION_PATH = "/Users/avinro/Claude-C/.wwebjs_auth";

export function initWhatsappClient(): void {
  // Kill any existing Chrome process using this session (stale MCP server instance)
  // so the new instance can start cleanly and restore the saved session without re-scanning QR.
  try {
    execSync(`pkill -f "${SESSION_PATH}"`, { stdio: "ignore" });
  } catch {}
  // Remove Chrome's SingletonLock if it wasn't cleaned up by the killed process
  try {
    execSync(`rm -f "${SESSION_PATH}/session/SingletonLock"`, { stdio: "ignore" });
  } catch {}

  // Non-blocking: Puppeteer starts in background; waReady flag gates all tool calls
  setTimeout(() => {
  waClient = new Client({
    authStrategy: new LocalAuth({
      dataPath: SESSION_PATH,
    }),
    webVersionCache: {
      type: "local",
      path: "/tmp/whatsapp-web-cache",
    },
    puppeteer: {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
      ],
    },
  });

  waClient.on("qr", async (qr: string) => {
    const tmpPath = "/tmp/whatsapp-qr.png";
    await QRCode.toFile(tmpPath, qr, { width: 400, margin: 2 });
    logger.info(`WhatsApp QR guardado en ${tmpPath} — abriendo imagen...`);
    logger.info("Escanea desde: WhatsApp > Ajustes > Dispositivos vinculados > Vincular dispositivo");
    try { execSync(`open "${tmpPath}"`); } catch {}
  });

  waClient.on("ready", () => {
    waReady = true;
    logger.info("WhatsApp client ready");
  });

  waClient.on("auth_failure", (msg: string) => {
    logger.warn("WhatsApp auth failure — may need to re-scan QR", { msg });
  });

  waClient.on("disconnected", (reason: string) => {
    waReady = false;
    logger.warn("WhatsApp disconnected", { reason });
  });

  waClient.initialize().catch((e: Error) =>
    logger.warn("WhatsApp init error", { error: e.message })
  );
  }, 1500); // 1.5s delay lets the killed Chrome process release the lock
}

export function registerWhatsapp(server: McpServer, env: ValidatedEnv) {
  const allowedNumbers =
    env.WHATSAPP_ALLOWED_NUMBERS?.split(",")
      .map((n) => n.trim())
      .filter(Boolean) ?? [];

  // ── Tool 1: send_whatsapp_message ──────────────────────────────────────────
  server.tool(
    "send_whatsapp_message",
    "Send a WhatsApp message to a contact or group. Phone numbers must use E.164 format with @c.us suffix (e.g. 521XXXXXXXXXX@c.us for a Mexican number). Group IDs end in @g.us and can be found with list_whatsapp_chats.",
    {
      to: z
        .string()
        .describe(
          "WhatsApp ID: 521XXXXXXXXXX@c.us for contacts, groupid@g.us for groups"
        ),
      message: z.string().min(1).max(4096).describe("Text to send"),
    },
    async ({ to, message }) => {
      if (!waReady || !waClient)
        return {
          content: [{ type: "text" as const, text: "WhatsApp not ready — scan QR first" }],
          isError: true,
        };
      try {
        await waClient.sendMessage(to, message);
        return { content: [{ type: "text" as const, text: `Sent to ${to}: "${message}"` }] };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: `Error: ${e instanceof Error ? e.message : e}` }],
          isError: true,
        };
      }
    }
  );

  // ── Tool 2: list_whatsapp_chats ────────────────────────────────────────────
  server.tool(
    "list_whatsapp_chats",
    "List recent WhatsApp chats with their IDs (required for send_whatsapp_message and get_whatsapp_messages). Shows name, ID, and unread count.",
    {
      limit: z.number().int().min(1).max(50).default(20),
    },
    async ({ limit }) => {
      if (!waReady || !waClient)
        return { content: [{ type: "text" as const, text: "WhatsApp not ready" }], isError: true };
      try {
        const chats = await waClient.getChats();
        const lines = chats
          .slice(0, limit)
          .map(
            (c, i) =>
              `${i + 1}. ${c.name} [${c.id._serialized}] unread:${c.unreadCount}`
          );
        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: `Error: ${e instanceof Error ? e.message : e}` }],
          isError: true,
        };
      }
    }
  );

  // ── Tool 3: get_whatsapp_messages ──────────────────────────────────────────
  server.tool(
    "get_whatsapp_messages",
    "Fetch recent messages from a specific WhatsApp chat. Use list_whatsapp_chats first to get the chat_id.",
    {
      chat_id: z
        .string()
        .describe("Chat ID from list_whatsapp_chats (e.g. 521XXXXXXXXXX@c.us)"),
      limit: z.number().int().min(1).max(100).default(20),
    },
    async ({ chat_id, limit }) => {
      if (!waReady || !waClient)
        return { content: [{ type: "text" as const, text: "WhatsApp not ready" }], isError: true };
      try {
        const chat = await waClient.getChatById(chat_id);
        const msgs = await chat.fetchMessages({ limit });
        const lines = msgs.map(
          (m: any) =>
            `[${new Date(m.timestamp * 1000).toISOString()}] ${
              m.fromMe ? "Me" : m.from
            }: ${m.body}`
        );
        return { content: [{ type: "text" as const, text: lines.join("\n") || "(no messages)" }] };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: `Error: ${e instanceof Error ? e.message : e}` }],
          isError: true,
        };
      }
    }
  );

  // ── Tool 4: wait_for_whatsapp_command ─────────────────────────────────────
  server.tool(
    "wait_for_whatsapp_command",
    "Block for up to timeout_seconds waiting for an incoming WhatsApp message from an allowed number (set via WHATSAPP_ALLOWED_NUMBERS env var). Returns the sender ID and message body. Use this in an agentic loop to receive commands from your phone: call this tool, execute the command, reply with send_whatsapp_message, repeat.",
    {
      timeout_seconds: z.number().int().min(5).max(120).default(30),
    },
    async ({ timeout_seconds }) => {
      if (!waReady || !waClient)
        return { content: [{ type: "text" as const, text: "WhatsApp not ready" }], isError: true };

      return new Promise<{ content: Array<{ type: "text"; text: string }> }>(
        (resolve) => {
          const timer = setTimeout(() => {
            waClient!.removeListener("message", handler);
            resolve({
              content: [{ type: "text" as const, text: "No command received (timeout)" }],
            });
          }, timeout_seconds * 1000);

          const handler = async (msg: any) => {
            const sender = (msg.from as string).replace("@c.us", "");
            // Enforce allowlist if configured
            if (allowedNumbers.length > 0 && !allowedNumbers.includes(sender)) return;
            clearTimeout(timer);
            waClient!.removeListener("message", handler);
            resolve({
              content: [
                {
                  type: "text" as const,
                  text: `From ${sender}: ${msg.body}`,
                },
              ],
            });
          };

          waClient!.on("message", handler);
        }
      );
    }
  );
}
