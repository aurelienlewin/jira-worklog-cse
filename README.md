# Jira Worklog CSE

Assistant local (React + Node.js) pensé pour les utilisatrices et utilisateurs non techniques.

## Objectif

- vous guider pas à pas pour créer un token d'accès personnel Jira,
- configurer Codex + la connexion Jira automatiquement,
- vérifier la connexion,
- afficher les heures travaillées en 2025 par projet Jira, avec total final,
- afficher les congés 2025 et un résumé clair des indicateurs utiles,
- afficher des panneaux de détail pour le bench (`WAROE`) et les congés, avec sous-tâches et répartition par type d'issue (tous types),
- afficher les congés/absences sur tout le scope `ZLH-*` (ex : `ZLH-1`, `ZLH-2`, `ZLH-4`) quand du temps est saisi sur votre utilisateur,
- permettre de cibler un autre utilisateur via son e-mail (si votre PAT a les droits),
- exporter un fichier Excel clair avec les résumés, calculs et tableaux utiles.
- proposer une interface plus accessible (focus visibles, navigation clavier, structure sémantique).

## Interface

Le parcours est organisé en 4 étapes claires :

1. Créer le PAT Jira
2. Lire le guide Codex
3. Configurer et vérifier la connexion
4. Charger le rapport des heures et congés 2025

L'application affiche des états de chargement explicites et des toasts cumulatifs dismissables.
Un indicateur de progression en temps réel est affiché pendant la collecte des données Jira.
Le thème visuel est volontairement clair et apaisant (printemps, lever de soleil, ambiance campagne).
La clé d'accès est mémorisée dans la session navigateur pour reprendre automatiquement sur l'étape 4.
L'e-mail cible (optionnel) est aussi mémorisé dans la session pour reprendre la même analyse.
Un footer « Soutenir ce projet » est visible dans l'application avec accès direct à Ko-fi.
L'application intègre une base SSR en production (HTML pré-rendu + hydratation côté client).

Le rapport inclut :

- les heures totales par projet,
- un suivi des congés/absences basé sur tout le scope `ZLH-*` pour votre utilisateur,
- des panneaux de synthèse : total heures travaillées, total heures/jours de congés, taux WAROE et taux d'utilisation,
- un dashboard de cercles de progression pour visualiser rapidement les ratios clés,
- un panneau bench `WAROE` : répartition par type d'issue, sous-tâches, liste complète des tickets,
- un panneau congés `ZLH-*` : répartition par type d'issue, sous-tâches, liste complète des tickets.

## Prérequis

- Node.js 20+
- npm
- Accès à Jira `https://dev.osf.digital`
- Codex CLI installé localement

## Lancer en local

```bash
npm install
npm run dev
```

- Frontend : `http://localhost:5173`
- API : `http://127.0.0.1:8787`

## Scripts

- `npm run dev` : démarre API + frontend en parallèle
- `npm run build` : build frontend + bundle SSR serveur
- `npm start` : démarre l'API et sert le frontend (SSR si build disponible)

## Fonctionnement du setup MCP

Pendant l'étape de configuration, l'app tente :

1. `codex exec` pour mettre à jour `~/.codex/config.toml`
2. fallback local automatique si nécessaire
3. vérification automatique de la connexion pour confirmer que tout fonctionne

## Open Source

- Licence : [LICENSE](./LICENSE)
- Code de conduite : [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
- Contribuer : [CONTRIBUTING.md](./CONTRIBUTING.md)
- Sécurité : [SECURITY.md](./SECURITY.md)
- Historique des changements : [CHANGELOG.md](./CHANGELOG.md)

## Soutenir ce projet

Ce projet est né un vendredi 13, à l'heure où la ville bâille encore.
Un signe de chance, peut-être, ou juste le bon moment pour faire quelque chose d'utile.

Il a été construit sur du temps perso, sur un ordinateur perso, avec des tokens Codex persos.
Un geste simple : enlever un peu de poids des épaules, remettre de la clarté dans les chiffres,
et garder un cap quand la mer n'est pas très calme.

Il y a des périodes où les couloirs changent de musique.
On ne dit pas toujours les choses, mais on les sent.
Alors ce projet avance comme une lampe de poche dans la brume : pas pour faire du bruit,
juste pour éclairer quelques pas de plus.

J'y ai croisé des personnes solides, fines, lumineuses.
Cette page est une façon de leur dire merci, sans grand discours.

Si tu veux soutenir ce travail :

- Ko-fi : https://ko-fi.com/aurelienlewin
