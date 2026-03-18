# Worklog CSE

App locale (React + Node.js) pour récupérer les heures 2025, les congés/absences, puis exporter en `.xlsx` et `.pdf`.

## TL;DR

### Option 1: Interface guidée (simple)

```bash
npm install
npm run dev
```

Puis ouvrir `http://localhost:5173`.

### Option 2: Export direct en CLI (headless)

```bash
npm install
npm start -- --headless -u user@domain.com -t <votre_token>
```

Génère par défaut les 2 fichiers: `.xlsx` + `.pdf`.

## Pour qui ?

- Utilisateur non technique: utilisez l'interface web en 4 étapes.
- Développeur / automatisation: utilisez le mode headless.

## Ce que fait l'outil

- Guide pas-à-pas pour la connexion.
- Vérification de la clé d'accès.
- Calcul des heures par projet (2025).
- Calcul des heures/jours de congés et absences.
- Résumés bench et détails par scopes (`BENCH`, `ROEMO`).
- Export Excel riche (`.xlsx`).
- Export PDF avec rendu proche de l'UI (avatar + cercles de progression inclus).

## Prérequis

- Node.js 20+
- npm
- Accès à votre instance de suivi de tickets
- Codex CLI (requis pour la configuration MCP automatique depuis l'UI)
- Google Chrome (requis pour générer le PDF en mode headless)

## Installation (une seule fois)

```bash
npm install
cp .env.example .env.local
```

Puis adaptez au minimum dans `.env.local`:

```bash
ISSUE_TRACKER_URL="https://example.com"
BENCH_SCOPE_KEY="BENCH"
ROEMO_SCOPE_KEY="ROEMO"
LEAVE_ANCHOR_ISSUE_KEY="ABS-1"
```

## Utilisation: interface web (recommandé pour débuter)

1. Lancez l'app:

```bash
npm run dev
```

2. Ouvrez:

- Frontend: `http://localhost:5173`
- API: `http://127.0.0.1:8787`

3. Suivez les étapes UI:

- créer/entrer le token,
- vérifier la connexion,
- charger les données 2025,
- exporter.

### Démarrage direct en étape 4 (avec token CLI)

```bash
npm start -- -u user@domain.com -t <votre_token>
```

Alias acceptés:

- `--user user@domain.com` ou `--user=user@domain.com`
- `--token <votre_token>` ou `--token=<votre_token>`

## Utilisation: mode headless (dev/CI/scripts)

### Commande standard

```bash
npm start -- --headless -u user@domain.com -t <votre_token>
```

Comportement:

- collecte les données 2025,
- génère `.xlsx` + `.pdf`,
- écrit les fichiers dans le dossier courant,
- termine le process (pas de serveur web).

### Options

- `--xlsx` ou `--xls`: export Excel uniquement
- `--pdf`: export PDF uniquement
- `-o ./exports` ou `--output-dir=./exports`: dossier de sortie
- `--no-ui`: alias de `--headless`

### Exemples

```bash
# Excel + PDF (défaut)
npm start -- --headless -u user@domain.com -t <votre_token>

# Excel uniquement
npm start -- --headless --xls -u user@domain.com -t <votre_token>

# PDF uniquement, dans ./out
npm start -- --headless --pdf -o ./out -u user@domain.com -t <votre_token>

# Headless avec token déjà configuré dans ~/.codex/config.toml
npm start -- --headless
```

### Mode verbeux (diagnostic headless)

Le mode verbose est désormais activé par défaut pour les résumés `codex exec` lancés en headless:

- flux d'événements JSON (`--json`),
- progression curseur (`--progress-cursor`),
- résumé de raisonnement `model_reasoning_summary="detailed"`,
- logs runtime via `RUST_LOG=warn`,
- affichage digest filtré dans la sortie headless avec préfixes `[codex:<scope>]`.

Si vous voulez reproduire manuellement le même comportement:

```bash
RUST_LOG=info codex exec \
  --json \
  --progress-cursor \
  -c 'model_reasoning_summary="detailed"' \
  "Votre prompt" 2>codex-debug.log | tee codex-events.jsonl
```

Notes:

- `--json` affiche le flux d'événements (progression, erreurs, fin de tour).
- `model_reasoning_summary="detailed"` active un résumé de raisonnement quand le provider le supporte.
- pour désactiver le mode verbose par défaut dans l'app: `CODEX_SUMMARY_VERBOSE=false`.
- pour choisir le rendu logs: `CODEX_SUMMARY_LOG_STYLE=digest|raw` (défaut: `digest`).
- pour activer/désactiver la mini UI CLI (spinner + statut): `CODEX_SUMMARY_CLI_UI=true|false`.
- pour ajuster le niveau de logs runtime: `CODEX_SUMMARY_RUST_LOG=debug` (ou `info`, `warn`, ... ; défaut `warn`).
- pour ajuster le niveau de résumé de raisonnement: `CODEX_SUMMARY_REASONING=concise|detailed|auto|none`.
- si la sortie tarde à cause de tentatives de reconnexion, réduisez les retries:

```bash
codex exec \
  -c 'model_providers.osfdigital.stream_max_retries=0' \
  --json \
  "Votre prompt"
```

## Scripts utiles

- `npm run dev`: API + frontend
- `npm run dev:api`: API seule (nodemon)
- `npm run dev:web`: frontend seul (Vite)
- `npm run build`: build frontend + SSR
- `npm start`: API prod (sert aussi le frontend buildé)

## Dépannage rapide

- Erreur `ISSUE_TRACKER_URL` placeholder: mettez une vraie URL dans `.env.local` (pas `example.com`).
- Headless PDF en échec: vérifiez que Google Chrome est installé.
- Aucun token trouvé en headless: passez `-t <token>` ou configurez `~/.codex/config.toml`.
- L'e-mail `-u` n'est pas trouvé: l'app bascule automatiquement sur le compte de la clé.

## Open Source

- Licence: [LICENSE](./LICENSE)
- Code de conduite: [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
- Contribution: [CONTRIBUTING.md](./CONTRIBUTING.md)
- Sécurité: [SECURITY.md](./SECURITY.md)
- Historique: [CHANGELOG.md](./CHANGELOG.md)

## Soutenir

Ko-fi: https://ko-fi.com/aurelienlewin
