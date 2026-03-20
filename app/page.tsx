const tools = [
  { name: "web_search", api: "Brave Search", key: "BRAVE_API_KEY" },
  { name: "perplexity_research", api: "Perplexity", key: "PERPLEXITY_API_KEY" },
  { name: "fetch_url", api: "Native fetch", key: "—" },
  { name: "arxiv_search", api: "ArXiv API", key: "—" },
  { name: "news_search", api: "NewsAPI / GNews", key: "NEWS_API_KEY" },
  { name: "github_search", api: "GitHub REST", key: "GITHUB_TOKEN" },
  { name: "document_research", api: "Gemini API", key: "GEMINI_API_KEY" },
  { name: "notebooklm", api: "notebooklm-py CLI", key: "browser login" },
  { name: "figma_read", api: "Figma REST", key: "FIGMA_TOKEN" },
  { name: "figma_variables", api: "Figma Variables API", key: "FIGMA_TOKEN" },
  { name: "create_research_report", api: "Internal", key: "—" },
];

const keyEnvs = [
  "BRAVE_API_KEY", "PERPLEXITY_API_KEY", "NEWS_API_KEY", "GNEWS_API_KEY",
  "GITHUB_TOKEN", "FIGMA_TOKEN", "GEMINI_API_KEY", "LINEAR_API_KEY", "LINEAR_WEBHOOK_SECRET",
];

function getKeyStatus(keyName: string): boolean {
  return !!process.env[keyName];
}

export default function Page() {
  const keyStatuses = keyEnvs.map(k => ({ key: k, set: getKeyStatus(k) }));
  const setCount = keyStatuses.filter(k => k.set).length;

  return (
    <main>
      <h1 style={{ color: "#7c8ffc", marginBottom: "0.25rem" }}>Claude Research MCP</h1>
      <p style={{ color: "#888", marginBottom: "2rem" }}>11 tools | MCP server at /Users/avinro/Claude-C/dist/mcp/server.js</p>

      <section style={{ marginBottom: "2rem" }}>
        <h2 style={{ color: "#aaa", fontSize: "0.9rem", textTransform: "uppercase", letterSpacing: "0.1em" }}>API Keys ({setCount}/{keyEnvs.length} configured)</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "0.5rem", marginTop: "0.75rem" }}>
          {keyStatuses.map(({ key, set }) => (
            <div key={key} style={{ padding: "0.5rem 0.75rem", background: "#1a1a1a", borderRadius: "4px", borderLeft: `3px solid ${set ? "#4caf50" : "#555"}` }}>
              <span style={{ color: set ? "#4caf50" : "#666" }}>{set ? "✓" : "○"}</span>{" "}
              <code style={{ fontSize: "0.8rem" }}>{key}</code>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 style={{ color: "#aaa", fontSize: "0.9rem", textTransform: "uppercase", letterSpacing: "0.1em" }}>Tools</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "0.75rem", fontSize: "0.85rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #333", color: "#666" }}>
              <th style={{ textAlign: "left", padding: "0.5rem" }}>Tool</th>
              <th style={{ textAlign: "left", padding: "0.5rem" }}>API</th>
              <th style={{ textAlign: "left", padding: "0.5rem" }}>Key</th>
            </tr>
          </thead>
          <tbody>
            {tools.map(t => (
              <tr key={t.name} style={{ borderBottom: "1px solid #1e1e1e" }}>
                <td style={{ padding: "0.5rem" }}><code style={{ color: "#7c8ffc" }}>{t.name}</code></td>
                <td style={{ padding: "0.5rem", color: "#aaa" }}>{t.api}</td>
                <td style={{ padding: "0.5rem" }}><code style={{ color: "#888", fontSize: "0.75rem" }}>{t.key}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={{ marginTop: "2rem", padding: "1rem", background: "#1a1a1a", borderRadius: "4px", fontSize: "0.8rem", color: "#666" }}>
        <strong style={{ color: "#aaa" }}>Setup:</strong> Add keys to ~/.zshrc → source ~/.zshrc → restart Claude Code
        <br />
        <strong style={{ color: "#aaa" }}>Linear webhook:</strong> Run <code>ngrok http 3000</code> → use URL + /api/webhooks/linear in Linear settings
      </section>
    </main>
  );
}
