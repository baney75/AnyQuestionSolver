# AGENTS.md

## Cursor Cloud specific instructions

### Overview

AnyQuestionSolver is a client-side React + Vite SPA that uses Google Gemini AI to solve academic questions. There is no backend server despite `express` and `better-sqlite3` being listed in `package.json` (unused AI Studio template artifacts).

### Running the app

- `npm run dev` starts the Vite dev server on port 3000 (host 0.0.0.0)
- `npm run build` creates a production build in `dist/`
- `npm run lint` runs `tsc --noEmit` for type checking
- Tests: `npx tsx --test src/utils/image.test.ts` (uses Node.js built-in test runner)

### Environment

- Requires `GEMINI_API_KEY` in `.env.local` for AI functionality. Vite exposes it to client code via `import.meta.env.GEMINI_API_KEY` (configured in `vite.config.ts` via `envPrefix`).
- If `GEMINI_API_KEY` is available as a shell environment variable, write it to `.env.local` before starting the dev server: `echo "GEMINI_API_KEY=\"$GEMINI_API_KEY\"" > .env.local`

### Gotchas

- The `.env.local` file is gitignored but required at runtime. Vite reads it automatically with the `envPrefix: ['VITE_', 'GEMINI_']` config.
- Changing `.env.local` requires restarting the Vite dev server for changes to take effect (not hot-reloaded).
- The app makes Gemini API calls directly from the browser (no server proxy), so the API key is exposed in the client bundle.
- The free-tier Gemini API key has strict per-model rate limits. If the pro model quota is exhausted, the chat feature (which uses a lighter model) should still work. Wait ~45s between requests if you hit rate limits.
