/**
 * WhatsApp Bridge — persistent standalone process on localhost:3731
 *
 * Run with:  npm run start:whatsapp
 *
 * The MCP server (tools/whatsapp.ts) calls this bridge via HTTP so the
 * WhatsApp session survives Claude Code / MCP server restarts.
 */
import express from "express";
import pkg from "whatsapp-web.js";
import QRCode from "qrcode";
import { execSync } from "child_process";
import * as fs from "fs";

const { Client, LocalAuth } = pkg;

const PORT = 3731;
const SESSION_PATH = "/Users/avinro/Claude-C/.wwebjs_auth";
const PID_FILE = "/tmp/whatsapp-bridge.pid";

// ── Write PID file so other scripts can check if bridge is running ──────────
fs.writeFileSync(PID_FILE, String(process.pid));
process.on("exit", () => { try { fs.unlinkSync(PID_FILE); } catch {} });
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

// ── WhatsApp client ──────────────────────────────────────────────────────────
let waReady = false;
// Queue of incoming messages waiting to be polled by wait_for_whatsapp_command
const messageQueue: Array<{ sender: string; body: string; ts: number }> = [];

// Kill any stale Chrome using this session path
try { execSync(`pkill -f "${SESSION_PATH}"`, { stdio: "ignore" }); } catch {}
try { execSync(`rm -f "${SESSION_PATH}/session/SingletonLock"`, { stdio: "ignore" }); } catch {}

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: SESSION_PATH }),
  webVersionCache: { type: "local", path: "/tmp/whatsapp-web-cache" },
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

client.on("qr", async (qr: string) => {
  const tmpPath = "/tmp/whatsapp-qr.png";
  await QRCode.toFile(tmpPath, qr, { width: 400, margin: 2 });
  console.log(`[WA-Bridge] QR guardado en ${tmpPath}`);
  console.log("[WA-Bridge] Escanea: WhatsApp > Ajustes > Dispositivos vinculados > Vincular dispositivo");
  try { execSync(`open "${tmpPath}"`); } catch {}
});

client.on("ready", () => {
  waReady = true;
  console.log("[WA-Bridge] WhatsApp listo ✓");
});

client.on("auth_failure", (msg: string) => {
  console.warn("[WA-Bridge] Auth failure:", msg);
});

client.on("disconnected", (reason: string) => {
  waReady = false;
  console.warn("[WA-Bridge] Desconectado:", reason);
  // Auto-reconnect after 5s
  setTimeout(() => {
    console.log("[WA-Bridge] Reconectando...");
    client.initialize().catch((e: Error) => console.error("[WA-Bridge] Reconexión fallida:", e.message));
  }, 5000);
});

client.on("message", (msg: any) => {
  const sender = (msg.from as string).replace("@c.us", "");
  messageQueue.push({ sender, body: msg.body, ts: Date.now() });
  // Keep only last 50 messages in queue
  if (messageQueue.length > 50) messageQueue.shift();
});

client.initialize().catch((e: Error) =>
  console.error("[WA-Bridge] Init error:", e.message)
);

// ── HTTP API ─────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// Health / status
app.get("/status", (_req, res) => {
  res.json({ ready: waReady });
});

// Send message
app.post("/send", async (req, res) => {
  if (!waReady) return res.status(503).json({ error: "WhatsApp not ready" });
  const { to, message } = req.body as { to: string; message: string };
  if (!to || !message) return res.status(400).json({ error: "to and message required" });
  try {
    await client.sendMessage(to, message);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// List chats
app.get("/chats", async (req, res) => {
  if (!waReady) return res.status(503).json({ error: "WhatsApp not ready" });
  const limit = parseInt(String(req.query.limit ?? "20"));
  const chats = await client.getChats();
  res.json(
    chats.slice(0, limit).map((c) => ({
      id: c.id._serialized,
      name: c.name,
      unread: c.unreadCount,
    }))
  );
});

// Get messages from a chat
app.get("/messages/:chatId", async (req, res) => {
  if (!waReady) return res.status(503).json({ error: "WhatsApp not ready" });
  const limit = parseInt(String(req.query.limit ?? "20"));
  try {
    const chat = await client.getChatById(req.params.chatId);
    const msgs = await chat.fetchMessages({ limit });
    res.json(
      msgs.map((m: any) => ({
        ts: new Date(m.timestamp * 1000).toISOString(),
        from: m.fromMe ? "Me" : m.from,
        body: m.body,
      }))
    );
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// Poll for queued incoming messages (consumed by wait_for_whatsapp_command)
app.get("/poll", (req, res) => {
  const since = parseInt(String(req.query.since ?? "0"));
  const allowed = String(req.query.allowed ?? "");
  const allowedList = allowed ? allowed.split(",").map((n) => n.trim()) : [];
  const msgs = messageQueue.filter(
    (m) =>
      m.ts > since &&
      (allowedList.length === 0 || allowedList.includes(m.sender))
  );
  res.json(msgs);
});

app.listen(PORT, () => {
  console.log(`[WA-Bridge] HTTP API en localhost:${PORT}`);
});
