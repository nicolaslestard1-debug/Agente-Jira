# Agente Jira + Agente Santander

This workspace has two layers:

1. **Jira Cloud** via the official Atlassian Rovo MCP (Cursor chat).
2. **Agente Santander** — the one-pager / KPI generator imported from `agente-santander-mex` (Vite + Express + Gemini).

No Jira tokens are stored here. Gemini needs `GEMINI_API_KEY` in `.env.local` for the web app.

## Jira MCP (Cursor)

Search issues, comment, change status, and log time with your Atlassian account.

1. Open this repo as the Cursor workspace.
2. In **Customize → MCP**, enable only this project's `atlassian` server. Turn off the marketplace Atlassian plugin if both are listed — two connections break OAuth.
3. Authenticate, pick your Jira Cloud site, accept permissions.

The server is declared in `.cursor/mcp.json` against `https://mcp.atlassian.com/v1/mcp/authv2` (Streamable HTTP).

## Agente Santander (web app)

Automatic performance report generator for Monks × Santander: raw metrics → executive one-pagers, scorecards, and charts.

View in AI Studio: https://ai.studio/apps/4c13425f-7e9d-4f90-a4d0-76634fd77351

### Run locally

Prerequisites: Node.js 18+

1. `npm install`
2. Copy `.env.example` to `.env.local` and set `GEMINI_API_KEY`
3. `npm run dev`

### Scripts

- `npm run dev` — Express + Vite via `tsx server.ts`
- `npm run build` — Vite client + bundled server
- `npm start` — `node dist/server.cjs`
- `npm run lint` — `tsc --noEmit`

## License

MIT. See [LICENSE](LICENSE). Jira access still depends on each user's Atlassian account. Gemini usage depends on your API key.
