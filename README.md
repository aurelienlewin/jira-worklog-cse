# Jira Worklog CSE

Assistant local (React + Node.js) pour les utilisateurs non techniques.

Objectif:

- vous guider pas a pas pour creer un token d'acces personnel Jira,
- configurer Codex + la connexion Jira automatiquement,
- verifier la connexion,
- afficher les heures travaillees en 2025 par projet Jira, avec total final,
- afficher les conges 2025 et un resume clair des indicateurs utiles.
- afficher des panneaux de detail pour le bench (`WAROE`) et les conges, avec sous-taches et repartition par type d'issue (tous types).
- afficher les conges/absences sur tout le scope `ZLH-*` (ex: `ZLH-1`, `ZLH-2`, `ZLH-4`) quand du temps est saisi sur votre utilisateur.
- permettre de cibler un autre utilisateur via son e-mail (si votre PAT a les droits).
- exporter un fichier Excel clair avec les resumes, calculs et tableaux utiles.

## Interface

Le parcours est organise en 4 etapes claires:

1. Creer le PAT Jira
2. Lire le guide Codex
3. Configurer et verifier la connexion
4. Charger le rapport des heures et conges 2025

L'application affiche des etats de chargement explicites et des toasts cumulatives dismissables.
Un indicateur de progression en temps reel est affiche pendant la collecte des donnees Jira.
Le theme visuel est volontairement clair et apaisant (printemps, lever de soleil, ambiance campagne).
La cle d'acces est memorisee dans la session navigateur pour reprendre automatiquement sur l'etape 4.
L'e-mail cible (optionnel) est aussi memorise dans la session pour reprendre la meme analyse.
Un footer "Soutenir ce projet" est visible dans l'application avec acces direct a Ko-fi.

Le rapport inclut:

- les heures totales par projet,
- un suivi des conges/absences base sur tout le scope `ZLH-*` pour votre utilisateur.
- des panneaux de synthese: total heures travaillees, total heures/jours de conges, taux WAROE et taux d'utilisation.
- un dashboard de cercles de progression pour visualiser rapidement les ratios cles.
- un panneau bench `WAROE`: repartition par type d'issue, sous-taches, liste complete des tickets.
- un panneau conges `ZLH-*`: repartition par type d'issue, sous-taches, liste complete des tickets.

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

Ce projet est ne un vendredi 13, a l heure ou la ville baille encore.
Un signe de chance, peut-etre, ou juste le bon moment pour faire quelque chose d'utile.

Il a ete construit sur du temps perso, sur un ordinateur perso, avec des tokens Codex persos.
Un geste simple: enlever un peu de poids des epaules, remettre de la clarte dans les chiffres,
et garder un cap quand la mer n'est pas tres calme.

Il y a des periodes ou les couloirs changent de musique.
On ne dit pas toujours les choses, mais on les sent.
Alors ce projet avance comme une lampe de poche dans la brume: pas pour faire du bruit,
juste pour eclairer quelques pas de plus.

J'y ai croise des personnes solides, fines, lumineuses.
Cette page est une facon de leur dire merci, sans grand discours.

Si tu veux soutenir ce travail:

- Ko-fi: https://ko-fi.com/aurelienlewin
