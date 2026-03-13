# Jira Neon Codex Setup (React + Node)

Webapp locale en francais pour:

1. Guider la creation du PAT Jira.
2. Guider le setup Codex.
3. Configurer MCP (`mcp-atlassian-dev-osf`) avec le token.
4. Verifier la connexion avec un handshake MCP (bouton skip possible).
5. Extraire toutes les heures 2025 par projet Jira + total final.

## Lancer

```bash
npm install
npm run dev
```

- Frontend: http://localhost:5173
- API: http://127.0.0.1:8787

## Notes

- Le setup essaye d'abord `codex exec` puis fallback sur un patch local de `~/.codex/config.toml`.
- Le token est utilise en local pour:
  - config MCP (`JIRA_PERSONAL_TOKEN`),
  - appels Jira (`Authorization: Bearer <token>`).
- Le rapport cible l'annee civile 2025 (du 1er janvier au 31 decembre).

## Scripts

- `npm run dev`: API + web en parallele.
- `npm run build`: build frontend.
- `npm start`: demarre uniquement l'API.
