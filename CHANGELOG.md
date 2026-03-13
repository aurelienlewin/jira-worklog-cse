# Changelog

All notable changes to this project are documented here.

## [Unreleased]

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
