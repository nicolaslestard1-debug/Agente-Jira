#!/usr/bin/env python3
"""
Jira Cloud CLI Client for Antigravity Agent.
Zero external dependencies (uses standard library urllib, json, base64).
"""

import sys
import os
import json
import base64
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime
from pathlib import Path

def load_env(env_path=None):
    """Simple parser for .env files without requiring python-dotenv."""
    if env_path is None:
        env_path = Path(__file__).resolve().parent / ".env"
    else:
        env_path = Path(env_path)

    if not env_path.exists():
        return

    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, val = line.split("=", 1)
                key = key.strip()
                val = val.strip().strip("'\"")
                if key and key not in os.environ:
                    os.environ[key] = val

load_env()

class JiraClient:
    def __init__(self, base_url=None, email=None, api_token=None):
        self.base_url = (base_url or os.environ.get("JIRA_URL", "")).rstrip("/")
        self.email = email or os.environ.get("JIRA_EMAIL", "")
        self.api_token = api_token or os.environ.get("JIRA_API_TOKEN", "")

        if not self.base_url:
            raise ValueError("Falta JIRA_URL. Configúralo en .env o como variable de entorno.")
        if not self.email:
            raise ValueError("Falta JIRA_EMAIL. Configúralo en .env o como variable de entorno.")
        if not self.api_token:
            raise ValueError("Falta JIRA_API_TOKEN. Configúralo en .env o como variable de entorno.")

        # Ensure base_url has scheme
        if not self.base_url.startswith("http://") and not self.base_url.startswith("https://"):
            self.base_url = "https://" + self.base_url

        auth_str = f"{self.email}:{self.api_token}".encode("utf-8")
        self.auth_header = "Basic " + base64.b64encode(auth_str).decode("ascii")

    def _request(self, method, endpoint, data=None):
        url = f"{self.base_url}{endpoint}"
        headers = {
            "Authorization": self.auth_header,
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "Antigravity-Jira-Agent/1.0"
        }
        req_data = json.dumps(data).encode("utf-8") if data is not None else None
        req = urllib.request.Request(url, data=req_data, headers=headers, method=method)

        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                resp_body = resp.read().decode("utf-8")
                if not resp_body:
                    return {"status": resp.status, "message": "Success (No content)"}
                return json.loads(resp_body)
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8")
            try:
                err_json = json.loads(err_body)
                error_messages = err_json.get("errorMessages", [])
                errors = err_json.get("errors", {})
                detail = "; ".join(error_messages + [f"{k}: {v}" for k, v in errors.items()])
                if not detail:
                    detail = err_body
            except Exception:
                detail = err_body
            raise RuntimeError(f"HTTP {e.code} ({e.reason}): {detail}")
        except urllib.error.URLError as e:
            raise RuntimeError(f"Error de conexión con Jira: {e.reason}")

    def test_connection(self):
        """Verifica la conexión y retorna el usuario autenticado."""
        res = self._request("GET", "/rest/api/3/myself")
        return {
            "displayName": res.get("displayName"),
            "emailAddress": res.get("emailAddress"),
            "accountId": res.get("accountId"),
            "active": res.get("active"),
            "timeZone": res.get("timeZone"),
        }

    def get_issue(self, issue_key):
        """Obtiene detalles clave de un issue."""
        res = self._request("GET", f"/rest/api/3/issue/{issue_key}")
        fields = res.get("fields", {})
        return {
            "key": res.get("key"),
            "summary": fields.get("summary"),
            "status": fields.get("status", {}).get("name"),
            "assignee": fields.get("assignee", {}).get("displayName") if fields.get("assignee") else "Unassigned",
            "issueType": fields.get("issuetype", {}).get("name"),
            "priority": fields.get("priority", {}).get("name"),
            "timeSpent": fields.get("timetracking", {}).get("timeSpent"),
            "created": fields.get("created"),
            "updated": fields.get("updated"),
        }

    def search_issues(self, jql, max_results=10):
        """Busca issues usando JQL."""
        encoded_jql = urllib.parse.quote(jql)
        res = self._request("GET", f"/rest/api/3/search?jql={encoded_jql}&maxResults={max_results}&fields=summary,status,assignee,issuetype,priority")
        issues = []
        for issue in res.get("issues", []):
            f = issue.get("fields", {})
            issues.append({
                "key": issue.get("key"),
                "summary": f.get("summary"),
                "status": f.get("status", {}).get("name"),
                "assignee": f.get("assignee", {}).get("displayName") if f.get("assignee") else "Unassigned",
                "type": f.get("issuetype", {}).get("name")
            })
        return {
            "total": res.get("total", 0),
            "issues": issues
        }

    def _to_adf_doc(self, text):
        """Convierte texto plano en formato Atlassian Document Format (ADF)."""
        return {
            "version": 1,
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [
                        {
                            "type": "text",
                            "text": text
                        }
                    ]
                }
            ]
        }

    def add_worklog(self, issue_key, time_spent, comment=None, started_iso=None):
        """
        Registra horas de trabajo en un ticket.
        time_spent: '2h', '1h 30m', '45m', etc.
        """
        if not started_iso:
            now = datetime.now().astimezone()
            # Format: 2026-10-07T11:15:00.000-0300
            tz_formatted = now.strftime("%z")
            started_iso = now.strftime("%Y-%m-%dT%H:%M:%S.000") + tz_formatted

        payload = {
            "timeSpent": time_spent,
            "started": started_iso
        }
        if comment:
            payload["comment"] = self._to_adf_doc(comment)

        res = self._request("POST", f"/rest/api/3/issue/{issue_key}/worklog", payload)
        return {
            "id": res.get("id"),
            "issueKey": issue_key,
            "timeSpent": res.get("timeSpent"),
            "timeSpentSeconds": res.get("timeSpentSeconds"),
            "started": res.get("started"),
            "author": res.get("author", {}).get("displayName")
        }

    def add_comment(self, issue_key, comment_text):
        """Agrega un comentario al ticket."""
        payload = {
            "body": self._to_adf_doc(comment_text)
        }
        res = self._request("POST", f"/rest/api/3/issue/{issue_key}/comment", payload)
        return {
            "id": res.get("id"),
            "author": res.get("author", {}).get("displayName"),
            "created": res.get("created")
        }

    def get_transitions(self, issue_key):
        """Lista las transiciones de estado disponibles para el issue."""
        res = self._request("GET", f"/rest/api/3/issue/{issue_key}/transitions")
        transitions = []
        for t in res.get("transitions", []):
            transitions.append({
                "id": t.get("id"),
                "name": t.get("name"),
                "to": t.get("to", {}).get("name")
            })
        return transitions

    def transition_issue(self, issue_key, transition_id_or_name):
        """Cambia el estado de un ticket por ID de transición o por nombre de estado destino."""
        transitions = self.get_transitions(issue_key)
        target_id = None
        for t in transitions:
            if t["id"] == str(transition_id_or_name) or t["name"].lower() == str(transition_id_or_name).lower() or t["to"].lower() == str(transition_id_or_name).lower():
                target_id = t["id"]
                break

        if not target_id:
            available = [f"'{t['name']}' (ID: {t['id']})" for t in transitions]
            raise ValueError(f"Transición '{transition_id_or_name}' no encontrada. Disponibles: {', '.join(available)}")

        payload = {
            "transition": {
                "id": target_id
            }
        }
        self._request("POST", f"/rest/api/3/issue/{issue_key}/transitions", payload)
        return {"status": "success", "transitionId": target_id}

def print_help():
    help_text = """
Uso de jira_cli.py:

  python3 jira_cli.py test
      Verifica la conexión con Jira y muestra los datos del usuario logueado.

  python3 jira_cli.py get <ISSUE-KEY>
      Obtiene información básica del issue (estado, asignado, resumen, etc.).

  python3 jira_cli.py search "<JQL>" [max_results]
      Busca issues según consulta JQL (ej: "assignee = currentUser() AND status = 'In Progress'").

  python3 jira_cli.py worklog <ISSUE-KEY> <TIEMPO> [COMENTARIO]
      Registra horas de trabajo en el issue.
      Ejemplos de tiempo: '2h', '1h 30m', '45m'.

  python3 jira_cli.py comment <ISSUE-KEY> "<COMENTARIO>"
      Agrega un comentario al issue.

  python3 jira_cli.py transitions <ISSUE-KEY>
      Lista las transiciones de estado posibles para el issue.

  python3 jira_cli.py transition <ISSUE-KEY> "<NOMBRE_O_ID>"
      Mueve el issue al nuevo estado (ej: 'In Progress', 'In Review', 'Done').
"""
    print(help_text)

def main():
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help", "help"):
        print_help()
        sys.exit(0)

    cmd = sys.argv[1].lower()

    try:
        client = JiraClient()
    except Exception as e:
        print(f"Error de configuración: {e}", file=sys.stderr)
        print("Asegúrate de configurar el archivo .env con JIRA_URL, JIRA_EMAIL y JIRA_API_TOKEN.", file=sys.stderr)
        sys.exit(1)

    try:
        if cmd == "test":
            res = client.test_connection()
            print("✅ Conexión exitosa con Jira Cloud:")
            print(json.dumps(res, indent=2, ensure_ascii=False))

        elif cmd == "get":
            if len(sys.argv) < 3:
                print("Error: falta ISSUE-KEY. Ejemplo: python3 jira_cli.py get ABC-123")
                sys.exit(1)
            res = client.get_issue(sys.argv[2])
            print(json.dumps(res, indent=2, ensure_ascii=False))

        elif cmd == "search":
            if len(sys.argv) < 3:
                print('Error: falta JQL. Ejemplo: python3 jira_cli.py search "project = PROJ"')
                sys.exit(1)
            jql = sys.argv[2]
            max_r = int(sys.argv[3]) if len(sys.argv) > 3 else 10
            res = client.search_issues(jql, max_results=max_r)
            print(json.dumps(res, indent=2, ensure_ascii=False))

        elif cmd == "worklog":
            if len(sys.argv) < 4:
                print("Error: faltan argumentos. Uso: python3 jira_cli.py worklog <ISSUE-KEY> <TIEMPO> [COMENTARIO]")
                sys.exit(1)
            issue_key = sys.argv[2]
            time_spent = sys.argv[3]
            comment = sys.argv[4] if len(sys.argv) > 4 else None
            res = client.add_worklog(issue_key, time_spent, comment)
            print(f"✅ Horas registradas exitosamente en {issue_key}:")
            print(json.dumps(res, indent=2, ensure_ascii=False))

        elif cmd == "comment":
            if len(sys.argv) < 4:
                print('Error: faltan argumentos. Uso: python3 jira_cli.py comment <ISSUE-KEY> "<COMENTARIO>"')
                sys.exit(1)
            issue_key = sys.argv[2]
            comment = sys.argv[3]
            res = client.add_comment(issue_key, comment)
            print(f"✅ Comentario publicado en {issue_key}:")
            print(json.dumps(res, indent=2, ensure_ascii=False))

        elif cmd == "transitions":
            if len(sys.argv) < 3:
                print("Error: falta ISSUE-KEY. Uso: python3 jira_cli.py transitions <ISSUE-KEY>")
                sys.exit(1)
            res = client.get_transitions(sys.argv[2])
            print(json.dumps(res, indent=2, ensure_ascii=False))

        elif cmd == "transition":
            if len(sys.argv) < 4:
                print('Error: faltan argumentos. Uso: python3 jira_cli.py transition <ISSUE-KEY> "<NOMBRE_O_ID>"')
                sys.exit(1)
            issue_key = sys.argv[2]
            target = sys.argv[3]
            res = client.transition_issue(issue_key, target)
            print(f"✅ Estado de {issue_key} actualizado:")
            print(json.dumps(res, indent=2, ensure_ascii=False))

        else:
            print(f"Comando desconocido: '{cmd}'")
            print_help()
            sys.exit(1)

    except Exception as e:
        print(f"❌ Error ejecutando '{cmd}': {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
