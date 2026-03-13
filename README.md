# Jira Worklog CSE

Assistant local (React + Node.js) pour les utilisateurs non techniques.

Objectif:

- vous guider pas a pas pour creer un PAT Jira,
- configurer Codex + MCP automatiquement,
- verifier la connexion,
- afficher les heures travaillees en 2025 par projet Jira, avec total final,
- afficher le detail des sous-taches pour OSFO et ROEMO.

## Interface

Le parcours est organise en 4 etapes claires:

1. Creer le PAT Jira
2. Lire le guide Codex
3. Configurer et verifier la connexion MCP
4. Charger le rapport des heures 2025

L'application affiche des etats de chargement explicites et du feedback en direct.

Le rapport inclut:

- les heures totales par projet,
- un detail dedie des sous-taches pour `OSFO` et `ROEMO`.

## Prerequis

- Node.js 20+
- npm
- Acces a Jira `https://dev.osf.digital`
- Codex CLI installe localement

## Lancer en local

```bash
npm install
npm run dev
```

- Frontend: `http://localhost:5173`
- API: `http://127.0.0.1:8787`

## Scripts

- `npm run dev`: demarre API + frontend en parallele
- `npm run build`: build frontend production
- `npm start`: demarre uniquement l'API

## Fonctionnement du setup MCP

Pendant l'etape de configuration, l'app tente:

1. `codex exec` pour mettre a jour `~/.codex/config.toml`
2. fallback local automatique si necessaire
3. handshake MCP (initialize + tools/list) pour confirmer la connexion

## Open Source

- Licence: [LICENSE](./LICENSE)
- Code de conduite: [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
- Contribuer: [CONTRIBUTING.md](./CONTRIBUTING.md)
- Securite: [SECURITY.md](./SECURITY.md)
- Historique des changements: [CHANGELOG.md](./CHANGELOG.md)

## Funding

Soutien du projet:

- Ko-fi: https://ko-fi.com/aurelienlewin
