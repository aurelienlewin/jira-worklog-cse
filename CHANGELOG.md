# Changelog

All notable changes to this project are documented here.

## [Unreleased]

## [1.15.0] - 2026-03-13 12:28 CET

### Changed

- Fixed all `npm audit` vulnerabilities by upgrading Vite/plugin-react and replacing `xlsx` with `exceljs`.
- Kept Excel export feature with a new browser-safe writer (`exceljs`) and styled worksheet headers.

## [1.14.0] - 2026-03-13 12:26 CET

### Changed

- Replaced the hero title with a simpler French wording focused on 2025 worked hours.
- Improved accessibility UX: visible focus states, skip link, stronger spacing, keyboard step navigation (arrows/home/end), progressbar semantics, and reduced-motion support.
- Normalized French copy accents/apostrophes in UI and API messages.
- Added SSR baseline for production build/start: server-side render with hydration fallback.

## [1.13.0] - 2026-03-13 12:19 CET

### Added

- Added an optional target email field in the token/setup step to analyze another Jira user when the PAT has permissions.
- Added Excel export (`.xlsx`) from step 4 with friendly sheets for summary, projects, bench breakdown, and leaves breakdown.
- Added a visible "Soutenir ce projet" footer section in the UI with a direct Ko-fi link.

### Changed

- Extended report and leaves APIs to accept `userEmail` and filter worklogs for the selected user.
- Reworked the "Soutenir ce projet" wording in the UI footer and README to a more subtle, literary, and implicit tone.

## [1.12.0] - 2026-03-13 12:13 CET

### Added

- Added dashboard-style progress circles in the summary section to visualize key 2025 ratios.
- Added a dedicated data collection progress indicator (percentage + current step) while Jira data is loading.

### Changed

- Leaves/absences aggregation now uses the full `ZLH-*` scope for the connected user in 2025 (including cases like `ZLH-1`, `ZLH-2`, `ZLH-4`).
- Improved leaves user matching robustness on worklogs by comparing additional Jira identity fields.

## [1.11.0] - 2026-03-13 12:09 CET

### Added

- Added a dedicated bench details panel for `WAROE` with issue type totals (all issue types), subtask hours/details, and full issue list with hours.
- Added richer annual leaves details in API response and UI with issue type totals (all issue types), subtask totals/details, and full issue list with hours/days.

### Changed

- Frontend now requests report details specifically for `WAROE` via `detailedProjectKeys`.

## [1.10.0] - 2026-03-13 12:25 CET

### Changed

- Removed the OSFO/ROEMO detailed breakdown section from the step 4 UI.
- Stopped requesting project-specific detailed breakdown data from the frontend report call.
- Disabled backend detailed project computation by default.

## [1.9.0] - 2026-03-13 12:20 CET

### Added

- Added annual leaves tracking endpoint and UI panel based on `ZLH-1`.
- Added dismissable cumulative toast notifications for progress messages.

### Changed

- Persisted token in browser session and auto-resume directly to step 4 when connection check succeeds.
- Hid all hours/details panels until the user is on step 4.

## [1.8.0] - 2026-03-13 12:08 CET

### Changed

- Detailed OSFO/ROEMO report now displays all issue types, not only subtasks.
- Added per-project issue type totals and full issue-level lines in the UI.

## [1.7.0] - 2026-03-13 11:58 CET

### Changed

- Reworked the README support section into a full personal project story and support message.
- Clarified project context: created on personal time, personal computer, and personal Codex tokens.

## [1.6.0] - 2026-03-13 11:48 CET

### Changed

- Reworked the full visual theme from neon/cyber to a peaceful spring sunrise style.
- Updated panels, buttons, table, stepper, and loading visuals for a softer non-geek experience.

## [1.5.0] - 2026-03-13 11:40 CET

### Changed

- Replaced technical and cryptic UI labels/messages with clearer plain-language French text.
- Simplified setup/check feedback wording from the API so non-technical users see understandable status updates.

## [1.4.0] - 2026-03-13 11:33 CET

### Added

- Added backend support for project-specific breakdowns on top of yearly totals.
- Added dedicated OSFO/ROEMO subtask hours details in the UI report.

### Changed

- Extended Jira report API to accept `detailedProjectKeys` and return `detailedProjects`.

## [1.3.0] - 2026-03-13 11:35 CET

### Changed

- Replaced the dashboard-like UI with a guided 4-step wizard for non-technical users.
- Added clear loading states for setup, connection check, and report loading.
- Simplified onboarding copy in French with explicit next actions.

## [1.2.0] - 2026-03-13 11:30 CET

### Changed

- Renamed the project to Jira Worklog CSE in app metadata and HTML title.

## [1.1.0] - 2026-03-13 11:20 CET

### Added

- Open-source governance files: LICENSE, CODE_OF_CONDUCT, CONTRIBUTING, SECURITY.
- GitHub community health files: funding, issue templates, pull request template.
- README funding section with Ko-fi link.

## [1.0.0] - 2026-03-13 11:15 CET

### Added

- Initial React + Node local application.
- MCP setup/check endpoints and Jira 2025 hours aggregation per project.
- Neon UI with onboarding and results table.
