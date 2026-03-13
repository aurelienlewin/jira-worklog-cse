# Jira Worklog CSE

Assistant local (React + Node.js) pour les utilisateurs non techniques.

Objectif:

- vous guider pas a pas pour creer un token d'acces personnel Jira,
- configurer Codex + la connexion Jira automatiquement,
- verifier la connexion,
- afficher les heures travaillees en 2025 par projet Jira, avec total final,
- afficher le detail complet des issues (tous types) pour OSFO et ROEMO.

## Interface

Le parcours est organise en 4 etapes claires:

1. Creer le PAT Jira
2. Lire le guide Codex
3. Configurer et verifier la connexion
4. Charger le rapport des heures et conges 2025

L'application affiche des etats de chargement explicites et des toasts cumulatives dismissables.
Le theme visuel est volontairement clair et apaisant (printemps, lever de soleil, ambiance campagne).
La cle d'acces est memorisee dans la session navigateur pour reprendre automatiquement sur l'etape 4.

Le rapport inclut:

- les heures totales par projet,
- un detail dedie de toutes les issues (stories, tasks, bugs, sous-taches, etc.) pour `OSFO` et `ROEMO`.
- un suivi des conges annuels base sur l'issue `ZLH-1`.

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
3. verification automatique de la connexion pour confirmer que tout fonctionne

## Open Source

- Licence: [LICENSE](./LICENSE)
- Code de conduite: [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
- Contribuer: [CONTRIBUTING.md](./CONTRIBUTING.md)
- Securite: [SECURITY.md](./SECURITY.md)
- Historique des changements: [CHANGELOG.md](./CHANGELOG.md)

## Soutenir ce projet

Ce projet est ne un vendredi 13.
Pour moi, c'etait un signe de chance, le bon moment pour faire quelque chose d'utile.

Je l'ai construit pour mes collegues, pour leur faire gagner du temps et enlever un peu de charge mentale.
Le contexte est difficile, avec des incertitudes et des suppressions de postes, et je voulais laisser
un outil simple, concret, et positif pour celles et ceux qui continuent le chemin.

J'ai code cette application sur mon temps personnel, avec mon ordinateur personnel,
et avec mes tokens Codex personnels.
Pas pour "faire joli", mais pour rendre service jusqu'au bout, meme en quittant l'entreprise dans quelques jours.

Ces derniers mois ont ete un vrai grand huit.
Mais j'y ai rencontre des personnes remarquables, genereuses, brillantes, et courageuses.
Ce projet est ma facon de dire merci, et de transmettre de bonnes ondes pour la suite.

Si tu veux soutenir ce travail:

- Ko-fi: https://ko-fi.com/aurelienlewin
