# Changelog

Tous les changements notables de ce projet sont listés ici.

## [Unreleased]

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
