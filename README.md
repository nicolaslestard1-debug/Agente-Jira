# Agente Jira

Workspace and toolkit that connects AI agents (like **Cursor** and **Google Antigravity**) to **Jira Cloud**. From the chat or command line, you can search issues, comment, change status and dates, and log work hours (worklogs) — using your own Atlassian account and permissions.

---

## What it can do

- **Search & read issues**: JQL or natural language
- **Comment & update fields**: Assignee, description, dates
- **Status transitions**: Move issues (e.g. *In Review*, *Done*)
- **Worklogs**: Log time worked directly on tickets (compatible with Tempo)

---

## Connection Options

You can connect your agent to Jira Cloud using either of the following two options:

### Option 1: Cursor Workspace (via Official Atlassian Rovo MCP)

Ideal if you are working inside [Cursor](https://cursor.com) and prefer browser OAuth login without handling API tokens.

#### Setup:
1. Open this repository as your Cursor workspace.
2. In **Customize → MCP**, enable **only one** Atlassian connection: this project's `atlassian` server (`.cursor/mcp.json`). Turn **off** any marketplace Atlassian plugin to prevent OAuth conflicts.
3. Connect the workspace server. Complete the Atlassian browser login, select your site (`your-company.atlassian.net`), and grant permissions.
4. When the MCP status turns green, you can ask Cursor in chat:
   - *Find issues assigned to me that are in progress*
   - *Log 2 hours on PROJ-123 with comment: updated dashboard*
   - *Move PROJ-123 to In Review*

#### How it is wired:
Declared in `.cursor/mcp.json` using the native Streamable HTTP endpoint:
```json
{
  "mcpServers": {
    "atlassian": {
      "url": "https://mcp.atlassian.com/v1/mcp/authv2"
    }
  }
}
```

---

### Option 2: Antigravity / Direct CLI Integration (via Atlassian API Token)

Ideal if you are working in **Antigravity**, terminal, or any environment where you want direct agent interaction using an API Token and Python (zero external dependencies).

#### Setup:
1. Generate an Atlassian API Token:
   - Visit [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens).
   - Click **Create API token** and copy the value.
2. Create your `.env` file from the provided `.env.example`:
   ```bash
   cp .env.example .env
   ```
3. Edit `.env` with your Jira details:
   ```env
   JIRA_URL="https://your-company.atlassian.net"
   JIRA_EMAIL="your-email@company.com"
   JIRA_API_TOKEN="your-api-token"
   ```
   *(Note: `.env` is ignored by `.gitignore` so your credentials are never committed).*

4. **Test the connection**:
   ```bash
   python3 jira_cli.py test
   ```

#### Usage with Antigravity:
The repository includes agent rules in `.agents/rules/jira.md`. Once configured, you can simply ask the Antigravity agent in natural language:
- *"Log 1h 30m on ABC-123 with comment: Code review and tests"*
- *"Show me details for ABC-123"*
- *"Search for my open issues in project ABC"*

#### CLI Commands:
You can also run commands manually:
```bash
# Test connection
python3 jira_cli.py test

# Get issue details
python3 jira_cli.py get PROJ-123

# Search issues with JQL
python3 jira_cli.py search "assignee = currentUser() AND status = 'In Progress'"

# Log work (hours)
python3 jira_cli.py worklog PROJ-123 2h "Bug investigation and fix"

# Add a comment
python3 jira_cli.py comment PROJ-123 "PR ready for review"

# List available status transitions
python3 jira_cli.py transitions PROJ-123

# Change issue status
python3 jira_cli.py transition PROJ-123 "In Review"
```

---

## Troubleshooting (Option 1 - Cursor MCP)

If browser login succeeds but Cursor shows an SSE or Streamable HTTP error:
1. Disable any secondary Atlassian plugins so only this workspace server remains active.
2. In the Atlassian MCP modal, click **Logout** on both Local and Cloud, then **Retry**.
3. In Command Palette (`Cmd+Shift+P`), run **Clear all MCP tokens**, then authenticate again.
4. Ensure your VPN or corporate proxy is not blocking `mcp.atlassian.com`.
5. Verify that an Atlassian site administrator has approved **Atlassian Rovo MCP**.

---

## License

MIT. See [LICENSE](LICENSE). Access to Jira depends on each user's Atlassian account permissions.
