import { NextResponse } from "next/server";
import { createHmac } from "crypto";
import { appendFileSync, mkdirSync } from "fs";
import { join } from "path";

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("x-linear-signature");
  const secret = process.env.LINEAR_WEBHOOK_SECRET;

  // Verify HMAC signature
  if (secret && signature) {
    const expected = createHmac("sha256", secret).update(body).digest("hex");
    if (expected !== signature) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = {
    timestamp: new Date().toISOString(),
    type: payload.type,
    action: payload.action,
    data: payload.data,
  };

  // Log to file
  try {
    const logsDir = join(process.cwd(), "logs");
    mkdirSync(logsDir, { recursive: true });
    appendFileSync(join(logsDir, "linear.log"), JSON.stringify(event) + "\n");
  } catch (e) {
    console.error("Failed to write Linear event log:", e);
  }

  console.log(`[Linear webhook] ${event.type}:${event.action}`);
  return NextResponse.json({ ok: true });
}
