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
- A **Jira Cloud** account (not Server / Data Center)
- Permission to authorize the **Atlassian Rovo MCP** app on your site

## Setup

1. Clone this repository and open it as the Cursor workspace.
2. In **Customize → MCP**, enable **only one** Atlassian connection: this project's `atlassian` server. Turn **off** the marketplace **Plugin atlassian** if it is also listed. Two connections to the same Atlassian MCP break OAuth: the browser login can succeed and Cursor still shows `SSE error: Non-200` (Local) or `Streamable HTTP error` (Cloud).
3. Connect the workspace server. Complete Atlassian login, pick your site (`your-company.atlassian.net`), and accept the permissions.
4. When the MCP is green, ask the agent for what you need, for example:
   - *Find issues assigned to me that are in progress*
   - *Comment on PROJ-123 that the dashboard is updated*
   - *Move PROJ-123 to In Review*

## How it is wired

The workspace declares the Atlassian MCP in `.cursor/mcp.json` with a native HTTP URL against the official Rovo endpoint (`https://mcp.atlassian.com/v1/mcp/authv2`). Cursor talks to Jira without `mcp-remote` and without copying API tokens into the project.

That transport is Streamable HTTP. The old SSE endpoint (`/v1/sse`) is deprecated; Atlassian documents `SSE error: Non-200 status code` as a failure mode of that path. See the [HTTP+SSE deprecation notice](https://community.atlassian.com/forums/Atlassian-Remote-MCP-Server/HTTP-SSE-Deprecation-Notice/ba-p/3205484) and [Atlassian Cursor setup](https://support.atlassian.com/atlassian-ai-gateway/docs/set-up-ides/).

## If authentication succeeds but Cursor still shows an error

1. Disable the extra Atlassian plugin so only this workspace server remains.
2. In the Atlassian MCP modal, **Logout** on both Local and Cloud, then **Retry**.
3. Command palette (`Cmd+Shift+P`) → **Clear all MCP tokens**, then authenticate again.
4. A VPN or proxy may block `mcp.atlassian.com`.
5. An Atlassian admin may need to approve **Atlassian Rovo MCP**.
6. The site must be Jira Cloud.

## License

MIT. See [LICENSE](LICENSE). Access to Jira still depends on each user's Atlassian account.
