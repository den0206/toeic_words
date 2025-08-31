# Repository Guidelines

> Contributor guide for the TOEIC word typing tool (static HTML/JS).

## Project Structure & Module Organization

- `index.html`: Single-page app with HTML, CSS (inlined), and vanilla JS.
- `words/english_words.json`: App data source (array of entries).
- `words/english_words.tsv`: Reference data; JSON is what the app loads.
- `.vscode/`: Local editor settings. Keep optional and non-intrusive.

## Build, Test, and Development Commands

- Serve locally (recommended): `npx serve` then open the printed URL.
- Alternative: `python -m http.server 8000` then visit `http://localhost:8000/`.
- VS Code: “Open with Live Server” on `index.html`.
- Note: Directly opening `index.html` from file:// fails due to CORS when fetching JSON.

## Coding Style & Naming Conventions

- Indentation: 2 spaces for HTML, CSS, and JS.
- JavaScript: camelCase for variables/functions; `const`/`let` only; avoid globals.
- CSS: use CSS variables (kebab-case) and keep selectors simple.
- Files: lowercase; use underscores only if needed (e.g., `english_words.json`).
- Keep JS inside `index.html` organized by small functions (load, state, UI helpers).

## Testing Guidelines

- No automated tests yet. Perform a manual smoke test:
  - Start a local server, load the app, confirm words render.
  - Type correct/incorrect answers; verify feedback, score, and shuffle.
  - Hover Japanese text; ensure English hint appears.
  - Validate JSON fetch error message when `words/` is missing.
- Data shape (per item): `{ "en": "...", "ja": "...", "ja_example": "...", "en_example": "...", "section": "..." }`.

## Commit & Pull Request Guidelines

- Commits: concise, imperative subject (e.g., "Add hint visibility on hover").
- Scope small; group related changes per commit (UI, data, docs).
- PRs: include purpose, before/after screenshots for UI, and test steps.
- Link related issues; call out any data-format changes to `words/*.json`.

## Security & Configuration Tips

- CORS: always use a local server when developing.
- Data: ensure `english_words.json` is valid UTF-8 JSON; avoid sensitive content.
- Performance: large JSON loads synchronously—keep payload lean and fields consistent.
