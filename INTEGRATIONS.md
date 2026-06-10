# Claude-C — Integrations Hub

Central repository for managing all integrations, workflows, and tools on your PC.

---

## 📋 Current Integrations

### MCP Server Tools (8 registered)

The MCP server (`mcp/server.ts`) exposes these tools for Claude and other AI agents:

#### Research & Web Tools

1. **fetch_url** — Fetch and parse URL content
   - **Purpose:** Get page content for analysis
   - **File:** `mcp/tools/fetch_url.ts`
   - **Use:** Research, documentation, content extraction

2. **arxiv_search** — Search ArXiv papers
   - **Purpose:** Find academic papers on AI/ML topics
   - **File:** `mcp/tools/arxiv_search.ts`
   - **Use:** Research, staying updated on papers

3. **github_search** — Search GitHub repositories and code
   - **Purpose:** Find code, repos, implementations
   - **File:** `mcp/tools/github_search.ts`
   - **Use:** Research, code discovery

4. **notebooklm** — Research via NotebookLM (web search engine)
   - **Purpose:** Web search without needing NewsAPI/Brave keys
   - **File:** `mcp/tools/notebooklm.ts`
   - **Use:** Web research, news, articles

#### Document & Report Tools

5. **document_research** — Research and analyze documents
   - **Purpose:** Extract insights from documents
   - **File:** `mcp/tools/document_research.ts`
   - **Use:** Document analysis, content summarization

6. **create_research_report** — Generate research reports
   - **Purpose:** Create structured reports from research
   - **File:** `mcp/tools/create_research_report.ts`
   - **Use:** Documentation, report generation

#### Design Tools

7. **figma_read** — Read Figma designs and components
   - **Purpose:** Extract design data from Figma files
   - **File:** `mcp/tools/figma_read.ts`
   - **Dependencies:** Figma API key
   - **Use:** Design inspection, design-to-code

8. **figma_variables** — Manage Figma variables and tokens
   - **Purpose:** Read/manage design tokens in Figma
   - **File:** `mcp/tools/figma_variables.ts`
   - **Dependencies:** Figma API key
   - **Use:** Design system management, token sync

---

### Automation Scripts

#### Daily Digest Script

**daily_ai_digest.py**
- **Purpose:** Daily automated research digest on AI & design topics
- **Schedule:** GitHub Actions (7 AM CST daily)
- **Topics:**
  - New AI Model releases
  - Design-to-Code tools
  - AI in UI/UX Design
  - Product Design trends
- **Output:** PDF + Markdown report, saved to `reports/`
- **Stack:** Python, Anthropic SDK, ReportLab

#### Gmail Integration

**get-gmail-token.mjs**
- **Purpose:** OAuth2 token generation for Gmail API
- **Usage:** `node scripts/get-gmail-token.mjs`
- **Output:** Saves refresh token to `.env.local`
- **Scopes:** Mail read/write, compose, send

#### QA Automation Scripts

**send-qa-rejections.mjs** (and variants)
- **Purpose:** Send QA rejection notifications
- **Functions:**
  - Preview QA rejections
  - Batch send to contacts
  - Generate rejection lists
- **Files:**
  - `send-qa-rejections.mjs` — Main script
  - `send-qa-rejections-new.mjs` — Updated version
  - `send-qa-rejections-v2.mjs` — Alternative
  - `send-qa-batch.mjs` — Batch processor
  - `preview-qa-rejections.mjs` — Preview mode
  - `create-qa-folder.mjs` — Folder creation

---

## 🔧 Configuration

### Environment Variables

Create `.env.local` with (never commit):

```bash
# MCP & Research
GEMINI_API_KEY=your-key                    # Google Gemini
GOOGLE_CLIENT_ID=your-id                   # Gmail OAuth
GOOGLE_CLIENT_SECRET=your-secret           # Gmail OAuth

# Design Tools
FIGMA_API_TOKEN=your-token                 # Figma API
FIGMA_FILE_ID=your-file-id                 # Your Figma file

# Automation
ANTHROPIC_API_KEY=your-key                 # Claude API (daily digest)
GITHUB_TOKEN=optional-for-rate-limits      # GitHub API

```

---

## 🚀 Running Integrations

### MCP Server (Local Development)

```bash
# Watch mode (auto-reload)
npm run dev:mcp

# Production build
npm run build:mcp

# Run compiled server
npm run start:mcp
```

### Daily AI Digest

```bash
# Manual run
python scripts/daily_ai_digest.py

# Automatic (GitHub Actions) — runs daily at 7 AM CST
```

### Gmail Token Setup

```bash
# Generate/refresh Gmail token
node scripts/get-gmail-token.mjs
```

### QA Automation

```bash
# Preview rejections (safe, no sending)
node scripts/preview-qa-rejections.mjs

# Send batch (requires confirmation)
node scripts/send-qa-batch.mjs
```

---

## 📁 Directory Structure

```
Claude-C/
├── mcp/
│   ├── server.ts                   # MCP server entry + tool registration
│   ├── lib/
│   │   ├── env.ts                  # Environment variable validation
│   │   └── logger.ts               # Structured logging
│   └── tools/                      # 8 MCP tools
│       ├── fetch_url.ts
│       ├── arxiv_search.ts
│       ├── github_search.ts
│       ├── notebooklm.ts
│       ├── document_research.ts
│       ├── create_research_report.ts
│       ├── figma_read.ts
│       └── figma_variables.ts
│
├── scripts/
│   ├── daily_ai_digest.py          # Daily research digest (GitHub Actions)
│   ├── get-gmail-token.mjs         # Gmail OAuth token generator
│   └── send-qa-*                   # QA rejection automation
│
├── app/                            # Next.js web interface
│   ├── page.tsx                    # Home / dashboard
│   ├── logs/page.tsx               # Logs viewer
│   └── layout.tsx                  # Root layout
│
├── dist/                           # Compiled MCP server (generated)
├── reports/                        # Generated reports (daily digest output)
├── package.json                    # Node.js dependencies
├── tsconfig.json                   # TypeScript config
└── tsconfig.mcp.json               # MCP-specific build config
```

---

## 🔐 Security Notes

### API Keys & Credentials

- ✅ Store in `.env.local` (never commit)
- ✅ Use `.env.local.example` as template
- ✅ Figma token: Read-only preferred
- ✅ Gmail: Use OAuth2 with minimal scopes
- ✅ Anthropic: Set `ANTHROPIC_API_KEY` for daily digest

### Logging

- ✅ All MCP logs to stderr (not stdout)
- ✅ Stdout reserved for MCP protocol
- ✅ Use `logger` utility for all logging

---

## 📊 What's Next?

### Possible New Integrations

- [ ] **Linear** — Issue tracking & automation
- [ ] **Vercel** — Deploy monitoring & logs
- [ ] **Slack** — Notifications & commands
- [ ] **Email** — Automated responses & forwarding
- [ ] **Calendar** — Schedule & meeting automation
- [ ] **Drive** — File operations & document management
- [ ] **YouTube/Podcasts** — Content research & summarization
- [ ] **Analytics** — PostHog/Mixpanel data retrieval

### Improvements

- [ ] Web dashboard for integration status
- [ ] Scheduling system for scripts
- [ ] Webhook support for incoming messages
- [ ] Rate limiting & retry logic
- [ ] Error alerting & recovery
- [ ] Integration testing framework

---

## 🛠️ Development Commands

```bash
# Setup & install
npm install

# Development
npm run dev              # Next.js (localhost:3000)
npm run dev:mcp         # MCP server (watch mode)

# Build
npm run build            # Next.js + MCP compile
npm run build:mcp        # MCP only

# Production
npm run start            # Next.js server
npm run start:mcp        # Compiled MCP server

# Type checking
npm run type-check       # TypeScript validation
```

---

## 📝 Notes for Contributors

1. **MCP Tools** — Add new tools to `mcp/tools/`, register in `mcp/server.ts`
2. **Scripts** — Put automation in `scripts/`, document in this file
3. **Environment** — Always validate in `mcp/lib/env.ts` before using
4. **Logging** — Use `logger` utility, never `console.log` in MCP
5. **Secrets** — Use `.env.local.example` as template, update when adding new keys
6. **Error Handling** — All MCP tools must gracefully handle API failures

---

**Last Updated:** 2026-05-25 (WhatsApp bridge removed)  
**Purpose:** Central hub for PC integrations & automation  
**Maintained By:** Avinro (avinroart@gmail.com)
