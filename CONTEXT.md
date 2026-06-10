# Claude-C — Context Document

## Project Identity

**Name:** claude-research-mcp  
**Owner:** Avinro (avinroart@gmail.com)  
**Type:** MCP (Model Context Protocol) server + Next.js web app  
**Purpose:** Research and WhatsApp integration via Model Context Protocol  
**Status:** Active development  
**Stage:** Early phase (MVP / exploration)

---

## Purpose

A hybrid system combining:
1. **Next.js Web App** — dashboard for status and API key configuration
2. **MCP Server** — Model Context Protocol server for research and integration tools

The project enables Claude or other AI agents to access custom tools for research, design analysis, and document processing.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Web Framework** | Next.js 15 (App Router) |
| **Language** | TypeScript 5.7 |
| **Runtime** | Node.js 22+ |
| **MCP SDK** | @modelcontextprotocol/sdk ^1.12.0 |
| **AI Integration** | Google Generative AI (`@google/generative-ai`) |
| **APIs & Services** | Google APIs (googleapis) |
| **WhatsApp Integration** | whatsapp-web.js |
| **Web Server** | Express 5.2 |
| **Utilities** | Zod (validation) |
| **CLI Tool** | tsx (for watch mode & scripts) |
| **Testing/Type Check** | TypeScript (no test runner defined) |

---

## Project Structure

```
Claude-C/
├── app/                     # Next.js App Router pages
├── mcp/                     # MCP server implementation
│   └── server.ts           # Main MCP server entry
├── scripts/
│   └── whatsapp-bridge.ts  # WhatsApp Web.js integration script
├── dist/                    # Compiled output (MCP server)
├── next.config.js
├── tsconfig.json           # Main TypeScript config
├── tsconfig.mcp.json       # MCP compilation config
├── package.json
└── README.md
```

---

## Build & Run Commands

```bash
# Install dependencies
npm install

# Development
npm run dev              # Next.js dev server (localhost:3000)
npm run dev:mcp         # MCP server in watch mode (tsx watch)

# Production build
npm run build            # Next.js build + MCP server compile
npm run build:mcp        # Compile MCP server to dist/

# Start servers
npm run start            # Next.js production server
npm run start:mcp        # Run compiled MCP server (node dist/mcp/server.js)

# WhatsApp integration
npm run start:whatsapp   # Start WhatsApp bridge script

# Type checking
npm run type-check       # tsc --noEmit
```

---

## Architecture

### Next.js Web App

- **Framework:** Next.js 15 with App Router
- **Purpose:** User interface for the research/integration platform
- **Routes:** Defined in `app/` directory (standard Next.js structure)
- **Status:** Minimal implementation (likely placeholder for Phase 2+)

### MCP Server

**Location:** `mcp/server.ts`  
**Entry Point:** `npm run dev:mcp` (watch) or `npm run start:mcp` (production)

The MCP server exposes custom tools that Claude and other AI clients can invoke. Examples might include:

- Research tools (web search, data fetching)
- WhatsApp messaging
- Google Workspace integration (Gmail, Docs, Sheets)
- Custom business logic

**Compilation:**
- Source TypeScript: `mcp/server.ts` and related files
- Config: `tsconfig.mcp.json` (separate from web app)
- Output: `dist/mcp/server.js` (compiled & ready to run)


## Dependencies

### Core MCP & AI

- `@modelcontextprotocol/sdk` — MCP protocol implementation
- `@google/generative-ai` — Google's Gemini API client
- `googleapis` — Google API client library (Gmail, Docs, Sheets, Drive, etc.)

### Web & Server

- `next` — Next.js 15 framework
- `express` — HTTP server (may be used by MCP server or web app)
- `react` / `react-dom` — Frontend framework

### Integration & Utilities

- `whatsapp-web.js` — WhatsApp Web automation
- `qrcode` / `qrcode-terminal` — QR code generation for terminal
- `zod` — Runtime schema validation

---

## Key Concepts

### What is an MCP Server?

The Model Context Protocol (MCP) is a standard interface that allows AI agents (Claude, others) to discover and use custom tools. This project implements an MCP server that:

1. **Exposes tools** — AI agents can call these tools via the MCP protocol
2. **Handles requests** — Server processes requests and returns results
3. **Manages state** — Optionally maintains context (WhatsApp session, API keys, etc.)

Examples of tools this server might expose:

- `search_web(query)` — Search the internet
- `send_whatsapp_message(number, message)` — Send a WhatsApp message
- `read_gmail(label)` — Fetch Gmail messages
- `create_doc(title, content)` — Create a Google Doc

### WhatsApp Integration

The WhatsApp bridge allows the MCP server to:

- **Receive messages** from WhatsApp contacts
- **Process them** through the MCP server logic
- **Send responses** back to WhatsApp

This creates a chatbot-like experience where Claude (or another AI) can respond to WhatsApp messages in real-time.

---

## Development Workflow

### Starting the MCP Server (Local)

```bash
npm run dev:mcp
```

Watches `mcp/server.ts` and recompiles on changes. This will:
- Start the MCP server (likely on stdio or a Unix socket)
- Be ready to receive tool calls from Claude Code or other MCP clients
- Log requests/responses to console


## Environment & Configuration

- **Node.js:** 22+ recommended (check `package.json` `engines` field)
- **Environment Variables:** Needed for:
  - `GOOGLE_API_KEY` or similar for Gemini / Google APIs
  - API keys for research tools (Brave, Perplexity, etc.)
  - Secrets stored in `.env.local` (never commit)

---

## Deployment Considerations

### Production Build

```bash
npm run build           # Builds both Next.js app and MCP server
npm run start           # Runs Next.js in production
npm run start:mcp       # Runs MCP server in production
```

### Hosting Options

- **Next.js App:** Deploy to Vercel, AWS, Google Cloud, or self-hosted
- **MCP Server:** Can run as a background process, Docker container, or AWS Lambda

---

## Status & Next Steps

### ✅ Foundation

- Project structure in place
- Next.js 15 + TypeScript configured
- MCP SDK integrated
- WhatsApp bridge scripts scaffolded

### 🔄 In Progress

- MCP server implementation (specific tools to expose)
- WhatsApp message routing logic
- Google Generative AI integration

### ⏳ To Do

- Error handling & logging
- Session persistence (WhatsApp)
- Rate limiting / quota management
- Testing & validation
- Documentation for tool implementations

---

## File Locations

| File | Purpose |
|------|---------|
| `mcp/server.ts` | Main MCP server implementation |
| `tsconfig.mcp.json` | TypeScript config for MCP build |
| `dist/mcp/server.js` | Compiled MCP server (generated) |
| `.env.local` | Local env vars (not committed) |

---

## Useful Links

- [Model Context Protocol (MCP) Spec](https://spec.modelcontextprotocol.io/)
- [WhatsApp Web.js Docs](https://docs.wwebjs.dev/)
- [Google Generative AI JS SDK](https://github.com/google/generative-ai-js)
- [Next.js 15 Docs](https://nextjs.org/docs)

---

## Notes for Contributors / AI Agents

1. **MCP vs Web App:** Keep concerns separate — web dashboard in `app/`, MCP tools in `mcp/`
2. **Type Safety:** Use Zod for runtime validation of tool parameters
3. **Error Handling:** MCP errors should be clear and actionable (not raw JSON)
4. **Secrets:** Never commit `.env.local` — use `.env.local.example` as template

---

**Last Updated:** 2026-05-25  
**Workspace Root:** `/Users/avinro/avinro-workspace/Claude-C/`
