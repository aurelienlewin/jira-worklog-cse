# Changelog

Tous les changements notables de ce projet sont listés ici.

## [Unreleased]

## [1.17.3] - 2026-03-13 15:34 CET

### Added

- Détail projet `ROEMO` côté interface (répartition par type, sous-tâches, tickets complets, pagination).
- Résumé des commentaires `ROEMO` (Codex + fallback heuristique), au même format que le détail `WAROE`/bench.
- Export Excel/PDF enrichi avec les sections détaillées `ROEMO` (types, tickets, thèmes, exemples).

### Changed

- Collecte des projets détaillés étendue à `ROEMO` (frontend + API).
- Génération Codex des résumés de commentaires activée pour plusieurs scopes détaillés (`BENCH_SCOPE_KEY`, `ROEMO_SCOPE_KEY`).
- Messages de synthèse commentaires généralisés pour fonctionner par projet, pas uniquement "bench".

## [1.17.2] - 2026-03-13 15:01 CET

### Added

- Paramètres CLI au démarrage API: `-t/--token` et `-u/--user`.
- Endpoint de bootstrap (`GET /api/bootstrap`) pour transmettre les paramètres de lancement à l'interface.

### Changed

- Initialisation frontend: si un token CLI est fourni, l'application ouvre directement l'étape 4, lance automatiquement la vérification de connexion puis la collecte des données.

## [1.17.1] - 2026-03-13 14:59 CET

### Fixed

- Export PDF: correction de l'ouverture `about:blank` sans contenu et suppression du faux message de blocage popup quand la fenêtre est bien autorisée.
- Flux d'impression PDF: ouverture fiable de la fenêtre, rendu du document puis déclenchement d'impression depuis la fenêtre parente.
- Avatar utilisateur: récupération durcie (normalisation URL, fallback image embarquée) pour éviter les échecs d'affichage côté navigateur.

### Changed

- Focus automatique: verrouillage logique sur la barre de progression pendant les étapes de configuration/vérification/collecte, puis bascule vers la section cible (résumé ou résultat de connexion).
- Handshake MCP: messages d'erreur enrichis (initialize/tools/list), prise en charge des sorties prématurées et version de protocole configurable (`MCP_PROTOCOL_VERSION`).

## [1.17.0] - 2026-03-13 14:35 CET

### Changed

- Anonymisation globale du dépôt: suppression des références internes, URLs privées, identifiants de projets et clés d'issues.
- Renommage des constantes et endpoints API vers un vocabulaire neutre (`/api/worklogs/...`).
- Frontend configuré avec URLs paramétrables (`VITE_TOKEN_HELP_URL`, `VITE_SETUP_GUIDE_URL`, `VITE_ISSUE_BROWSE_BASE_URL`).
- API configurée avec variables génériques (`ISSUE_TRACKER_URL`, `BENCH_SCOPE_KEY`, `LEAVE_ANCHOR_ISSUE_KEY`, `MCP_SERVER_SECTION`).
- Réécriture complète du README pour une publication open source sans information sensible.
- Présentation du dépôt enrichie sur GitHub (description, homepage, topics).

## [1.16.14] - 2026-03-13 13:35 CET

### Changed

- Focus automatique + scroll doux (150ms) après actions clés.
- Compatibilité `prefers-reduced-motion` pour les déplacements de focus.

## [1.16.13] - 2026-03-13 13:32 CET

### Changed

- Stepper: états actif/terminé/verrouillé plus lisibles.
- Sections non prêtes mieux différenciées visuellement.

## [1.16.12] - 2026-03-13 13:25 CET

### Changed

- Toasts: fade-out, auto-expiration, gestion fiable de plusieurs notifications.

## [1.16.11] - 2026-03-13 13:23 CET

### Fixed

- Réduction des redémarrages API en développement et correction des erreurs proxy associées.
