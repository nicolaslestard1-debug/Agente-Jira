# Agente Jira

Cursor workspace that connects an agent to **Jira Cloud** via the official Atlassian Rovo MCP. From chat you can search issues, comment, change status and dates, and log time — using your own Atlassian account and permissions.

No tokens or credentials are stored in this repository. Authentication happens in the browser.

## What it can do

- Search and read issues (JQL or natural language)
- Comment and update fields (assignee, due date, description)
- Transition statuses (for example In Review or Completed)
- Add worklogs in Jira (also visible in Tempo if your site uses it)

## Requirements

- [Cursor](https://cursor.com)
- [Node.js](https://nodejs.org) 18 or later (`npx`)
- A **Jira Cloud** account (not Server / Data Center)
- Permission to authorize the **Atlassian Rovo MCP** app on your site

## Setup

1. Clone this repository and open it as the Cursor workspace.
2. In **Customize → MCP**, keep only this project's **atlassian** server enabled. If the global Atlassian plugin uses the same endpoint, disable it — two connections at once break OAuth.
3. Connect the server. Complete Atlassian login, pick your site (`your-company.atlassian.net`), and accept the permissions.
4. When the MCP is green, ask the agent for what you need, for example:
   - *Find issues assigned to me that are in progress*
   - *Comment on PROJ-123 that the dashboard is updated*
   - *Move PROJ-123 to In Review*

## How it is wired

The workspace declares the Atlassian MCP in `.cursor/mcp.json`, using `mcp-remote` against the official Rovo MCP endpoint. Cursor talks to Jira without copying API tokens into the project.

## If it does not connect

- Confirm Node 18+ and that this repo is the open workspace.
- On **atlassian**, use Connect / Authenticate / Restart.
- A VPN or proxy may block `mcp.atlassian.com`.
- An Atlassian admin may need to approve **Atlassian Rovo MCP**.
- The site must be Jira Cloud.

## License

MIT. See [LICENSE](LICENSE). Access to Jira still depends on each user's Atlassian account.
