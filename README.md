# AnyQuestionSolver

AnyQuestionSolver is a client-side React + Vite study app that sends text and image questions directly to Gemini from the browser.

## What it does

- Type or paste a question and press `Enter` for the default fast answer.
- Use `Shift+Enter` for a new line in the text composer.
- Upload or paste screenshots of problems or worked solutions.
- Automatically check shown work when an image or pasted text already contains an attempt.
- Offer deeper walkthroughs, automatic grounding for current or citation-sensitive prompts, follow-up chat, image search, charts, code execution, and local history.

## Run locally

1. Install dependencies with `bun install`
2. Create `.env.local` with:

```bash
GEMINI_API_KEY="your-key"
GOOGLE_API_KEY="your-key" # optional, falls back to GEMINI_API_KEY
```

3. Start the app with `bun dev`
4. Open `http://localhost:3000`

## Verification

- `bun lint`
- `bun test src/utils/image.test.ts src/utils/input.test.ts src/utils/solution.test.ts src/utils/request.test.ts src/services/gemini.test.ts src/services/news.test.ts src/services/wotd.test.ts`
- `bun run build`

## Notes

- There is no backend. API calls happen in the browser.
- Changing `.env.local` requires restarting the Vite dev server.
- The Gemini key is exposed to the client bundle by design in this architecture.
