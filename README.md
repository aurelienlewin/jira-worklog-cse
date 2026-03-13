# Worklog CSE

Application locale (React + Node.js) pour visualiser simplement les heures 2025, les congés/absences, et exporter un fichier Excel lisible.

## Ce que fait l'outil

- guide pas à pas pour saisir votre clé d'accès,
- configure automatiquement votre connecteur MCP,
- vérifie la connexion,
- calcule les heures travaillées par projet,
- calcule les heures/jours de congés et absences,
- n'affiche pas les tickets congés/absences à 0h,
- masque les blocs résumé/détail bench et congés quand le total est à 0h,
- affiche un taux bench et un taux d'utilisation,
- propose des détails (types d'issue, sous-tâches, tickets complets),
- masque les sections "Sous-tâches" lorsqu'elles sont vides,
- affiche l'avatar de l'utilisateur analysé (si disponible),
- résume les commentaires bench (avec Codex + fallback local),
- permet d'interrompre une session restaurée et d'annuler les requêtes en cours,
- exporte un `.xlsx` prêt à partager.

## Parcours utilisateur

1. Créer un jeton personnel.
2. Lire le guide de configuration.
3. Coller la clé + lancer la configuration.
4. Charger les données 2025 et exporter.

L'interface est en français, orientée non technique, avec:

- stepper clair,
- états de chargement visibles,
- toasts flottants cumulables et dismissables (erreurs persistantes jusqu'au clic),
- navigation clavier,
- focus visibles,
- arrêt manuel de session (même pendant une collecte auto-restaurée),
- rendu SSR en production.

## Prérequis

- Node.js 20+
- npm
- Codex CLI installé localement
- Accès à votre instance de suivi de tickets

## Lancer en local

```bash
npm install
npm run dev
```

- Frontend: `http://localhost:5173`
- API: `http://127.0.0.1:8787`

## Variables recommandées

Copier `.env.example` vers `.env.local` puis adapter les valeurs:

```bash
cp .env.example .env.local

# Frontend
VITE_TOKEN_HELP_URL="https://example.com/token"
VITE_SETUP_GUIDE_URL="https://example.com/guide"
VITE_ISSUE_BROWSE_BASE_URL="https://example.com"
VITE_BENCH_SCOPE_KEY="BENCH"
VITE_LEAVE_ANCHOR_ISSUE_KEY="ABS-1"
VITE_LEAVE_SCOPE_LABEL="ABS-*"

# API
ISSUE_TRACKER_URL="https://example.com"
BENCH_SCOPE_KEY="BENCH"
LEAVE_ANCHOR_ISSUE_KEY="ABS-1"
WORKING_DAY_HOURS="7"
MCP_SERVER_SECTION="issue-tracker"
```

Notes:

- l'API charge `.env` puis `.env.local` au démarrage (`.env.local` est prioritaire),
- si `ISSUE_TRACKER_URL` reste sur une valeur placeholder (`example.com`), l'API bloque les appels avec un message de configuration explicite.

## Scripts

- `npm run dev`: démarre API + frontend
- `npm run build`: build frontend + bundle SSR serveur
- `npm start`: démarre l'API et sert le frontend

## Open Source

- Licence: [LICENSE](./LICENSE)
- Code de conduite: [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
- Contribution: [CONTRIBUTING.md](./CONTRIBUTING.md)
- Sécurité: [SECURITY.md](./SECURITY.md)
- Historique: [CHANGELOG.md](./CHANGELOG.md)

## Soutenir ce projet

Ce projet est né un vendredi 13, dans un matin encore calme.
Un clin d'œil à la chance, peut-être. Ou juste le bon moment.

Il a été construit sur mon temps perso, sur mon ordinateur perso,
avec mes propres tokens Codex.

L'idée était simple: apporter un peu d'air, un peu d'ordre,
un outil qui aide sans bruit, quand les périodes deviennent plus rudes.

On ne dit pas toujours tout à voix haute.
Parfois, on se contente d'être là, de faire quelque chose d'utile,
et de laisser une lumière douce pour celles et ceux qui continuent la route.

Si ce travail vous aide, vous pouvez soutenir le projet ici:

- Ko-fi: https://ko-fi.com/aurelienlewin
