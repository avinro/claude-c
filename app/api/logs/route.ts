import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lines = Math.min(Number(searchParams.get("lines") ?? 100), 500);
  const logFile = join(process.cwd(), "logs", "mcp.log");

  if (!existsSync(logFile)) {
    return NextResponse.json({ logs: [], message: "No logs yet" });
  }

  const content = readFileSync(logFile, "utf-8");
  const logLines = content.trim().split("\n").filter(Boolean).slice(-lines);
  return NextResponse.json({ logs: logLines });
}
