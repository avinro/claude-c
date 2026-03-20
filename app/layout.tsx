import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Claude Research MCP",
  description: "MCP Server Dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "monospace", background: "#0f0f0f", color: "#e0e0e0", margin: 0, padding: "2rem" }}>
        <nav style={{ borderBottom: "1px solid #333", paddingBottom: "1rem", marginBottom: "2rem" }}>
          <a href="/" style={{ color: "#7c8ffc", marginRight: "1.5rem", textDecoration: "none" }}>Dashboard</a>
          <a href="/logs" style={{ color: "#7c8ffc", textDecoration: "none" }}>Logs</a>
        </nav>
        {children}
      </body>
    </html>
  );
}
