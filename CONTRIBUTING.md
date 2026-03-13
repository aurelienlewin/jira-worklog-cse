# Contributing

Thanks for contributing to this project.

## Local setup

```bash
npm install
npm run dev
```

- Frontend: `http://localhost:5173`
- API: `http://127.0.0.1:8787`

## Development workflow

1. Fork and create a branch from `main`.
2. Keep changes focused on one topic per PR.
3. Run checks before opening a PR:

```bash
npm run build
```

## Commit style

Use clear, scoped commit messages. Example:

- `feat(ui): add neon onboarding panel`
- `fix(api): handle Jira pagination edge case`
- `docs: update setup instructions`

## Pull requests

Please include:

- Context and intent.
- Screenshots/GIF if UI changes are involved.
- Test/validation steps.

## Code style

- Prefer small, focused functions.
- Keep API failures explicit and user-facing.
- Avoid introducing secrets in code or logs.
