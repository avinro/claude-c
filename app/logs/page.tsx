"use client";
import { useEffect, useState } from "react";

export default function LogsPage() {
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchLogs() {
    const res = await fetch("/api/logs?lines=200");
    const data = await res.json() as { logs: string[] };
    setLogs(data.logs);
    setLoading(false);
  }

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <main>
      <h1 style={{ color: "#7c8ffc", marginBottom: "0.5rem" }}>Tool Logs</h1>
      <p style={{ color: "#666", fontSize: "0.8rem", marginBottom: "1rem" }}>Auto-refreshes every 5s</p>
      <div style={{ background: "#0a0a0a", padding: "1rem", borderRadius: "4px", height: "70vh", overflowY: "auto", fontSize: "0.75rem", lineHeight: "1.6" }}>
        {loading ? (
          <span style={{ color: "#666" }}>Loading...</span>
        ) : logs.length === 0 ? (
          <span style={{ color: "#666" }}>No logs yet. Run some tools to see activity here.</span>
        ) : (
          logs.map((line, i) => (
            <div key={i} style={{ color: line.includes("ERROR") ? "#f44336" : line.includes("WARN") ? "#ff9800" : "#aaa" }}>
              {line}
            </div>
          ))
        )}
      </div>
    </main>
  );
}
