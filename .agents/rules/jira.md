# Jira Agent Integration Rules

Este proyecto incluye una herramienta CLI (`jira_cli.py`) para interactuar directamente con Jira Cloud.

## Comandos disponibles

Cuando el usuario pida consultar issues, cambiar estados o cargar horas (worklog):
1. **Verificar conexión**:
   ```bash
   python3 jira_cli.py test
   ```
2. **Cargar horas de trabajo (Worklog)**:
   ```bash
   python3 jira_cli.py worklog <ISSUE-KEY> <TIEMPO> "<COMENTARIO>"
   ```
   Ejemplo: `python3 jira_cli.py worklog PROJ-101 2h "Desarrollo del endpoint y tests"`
3. **Obtener detalle de un ticket**:
   ```bash
   python3 jira_cli.py get <ISSUE-KEY>
   ```
4. **Buscar tickets**:
   ```bash
   python3 jira_cli.py search "assignee = currentUser() ORDER BY updated DESC" 5
   ```
5. **Comentar en un ticket**:
   ```bash
   python3 jira_cli.py comment <ISSUE-KEY> "<COMENTARIO>"
   ```
6. **Mover ticket / Cambiar estado**:
   ```bash
   python3 jira_cli.py transitions <ISSUE-KEY>
   python3 jira_cli.py transition <ISSUE-KEY> "<NOMBRE_ESTADO>"
   ```

## Notas
- Las credenciales se leen automáticamente desde el archivo `.env` en la raíz del proyecto (`JIRA_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`).
