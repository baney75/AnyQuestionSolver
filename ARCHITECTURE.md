# AnyQuestionSolver Architecture

## Overview

**AnyQuestionSolver** is a client-side React + Vite SPA for academic help. It accepts questions (text, images, voice), sends them to Google Gemini AI in the browser, and renders rich responses with math, code, charts, and source citations. There is no backend server.

---

## Core Architecture

### Technology Stack

| Layer | Technology |
|-------|------------|
| Framework | React 19 + TypeScript 5.8 |
| Build | Vite 6 |
| Runtime | Bun |
| Styling | Tailwind CSS 4.1 + CSS variables |
| AI | Google Gemini (@google/genai) |
| Search | Google Custom Search, YouTube, Openverse, Wikipedia |

### Key Principle: **No Backend**

All AI processing happens in the browser. API keys are sent to the client bundle via Vite's `envPrefix` configuration (`VITE_`, `GEMINI_`, `GOOGLE_`). The `.env.local` file is required at runtime.

---

## Directory Structure

```
src/
├── main.tsx           # React entry point
├── App.tsx            # Main component + state machine
├── index.css          # Global styles, CSS variables, Tailwind
├── types.ts           # Shared TypeScript types
├── components/       # UI components (see Component Patterns)
├── hooks/             # Custom React hooks
├── services/          # External API integrations (see Services)
└── utils/             # Pure utility functions
```

---

## Application State Machine

`App.tsx` manages a single state machine with these states:

| State | Trigger | Renders |
|-------|---------|---------|
| `IDLE` | Initial, after clear | `Dropzone` |
| `PREVIEWING` | Input received, before submit | `InputPreview` + `Dropzone` |
| `LOADING` | User clicks fast/deep | `LoadingState` |
| `SOLVED` | AI returns answer | `SolutionDisplay` + `ChatPanel` |
| `ERROR` | API failure | `ErrorState` |

**Transitions:**
```
IDLE → PREVIEWING (text/image/voice input)
PREVIEWING → LOADING (user selects fast/deep)
PREVIEWING → IDLE (user clears)
LOADING → SOLVED (success)
LOADING → ERROR (failure)
SOLVED → PREVIEWING (edit/retry) or IDLE (clear)
ERROR → PREVIEWING (edit) or IDLE (clear)
SOLVED → NEWS (user requests news)
NEWS → SOLVED (user returns)
SOLVED → WOTD (user requests word of the day)
WOTD → SOLVED (user returns)
```

**Follow-up Context Preservation:**
When the user asks follow-up questions after receiving a solution:
- Original question text is captured and stored in `originalQuestionRef`
- Original image (if any) is captured as base64 and stored alongside
- On follow-up, both original question and image are sent to `chatWithTutor`
- System prompt instructs AI to "Always keep the original question in mind when answering follow-ups"
- If the tutor asks a numbered clarification question, short replies are treated as answers to that clarification instead of restarting the loop
- `ChatPanel` also seeds purpose-built starter prompts based on the current solution shape (for example video-heavy or homework-safe answers)
- The follow-up UI is a guided workspace: conversation rail on the left, action rail on the right, large suggestion cards, and a dedicated composer card
- `Escape` is owned locally by the follow-up workspace: it clears the draft first, then blurs the focused control, and no longer triggers the app-level solved-screen exit while the panel is active
- This ensures context continuity even in multi-turn tutoring sessions

---

## Input System

### Dropzone Component

The `Dropzone` component (`src/components/Dropzone.tsx`) is the primary input interface:

- **Global keyboard listener**: Captures typed text anywhere on page
- **Enter**: Submits with `fast` model
- **Shift+Enter**: Inserts newline in text composer
- **Paste**: `Cmd+V`/`Ctrl+V` - images go to preview, text goes to textarea
- **Drag & drop**: Image files
- **Click**: Opens file picker
- **Voice input**: Web Speech API or MediaRecorder fallback

### Subject Selection

Users can select a subject (Auto-detect, Mathematics, Physics, Chemistry, etc.) that influences AI routing.

### Solve Modes

| Mode | Model | Grounding | Use Case |
|------|-------|-----------|----------|
| `fast` | Default fast model | No | Quick answers |
| `deep` | Thinking-enabled | No | Step-by-step walkthroughs |
**Automatic Grounding**: The app auto-enables grounding for prompts asking for citations, current information, evidence, or time-sensitive officeholder/current-fact questions (for example, "who is the current president"). The preview UI stays focused on `fast` and `deep`; grounded routing happens automatically when the request requires it.

**Homework-aware rendering**: obvious coursework prompts are solved in the normal flow, but `SolutionDisplay` can hide the final `**Answer:**` section by default so students see the method first and reveal the answer deliberately.

---

## Services Layer

### gemini.ts (Core AI)

The `GeminiService` in `src/services/gemini.ts` handles all AI interactions:

**Key Methods:**
- `solveQuestion(base64Image, mode, subject, detailed)` - Image + text question
- `solveTextQuestion(text, mode, subject, detailed)` - Text-only question
- `chatWithTutor(history, message, originalQuestion?)` - Follow-up questions with optional original question/image context
- `transcribeAudio(audioBlob)` - Voice to text

**Model Fallback System**: If one model fails (rate limit, quota), it automatically tries the next available model.

**Grounding Logic**: `buildRequestPlan()` determines whether to enable Google Search grounding based on query intent, including explicit source requests, news/current-events, and current officeholder/leadership questions.

### search.ts (Web/Image/Video)

- `searchWeb(query, numResults)` - Google Custom Search API
- `searchImages(query, numResults)` - Google Image Search
- `searchVideos(query, maxResults)` - YouTube Data API with a free Jina-proxied YouTube search fallback when the direct API path is unavailable
- `fetchYouTubeTranscriptPreview(videoId)` - best-effort free caption fetcher for public tracks, with graceful fallback when browser/CORS or the video itself blocks captions

**Fallbacks**: If Google APIs are unavailable, falls back to Openverse (images) and Wikipedia (images).

### wotd.ts (Word of the Day)

The `getWordOfTheDay()` function in `src/services/wotd.ts` sources the daily word from Merriam-Webster's official RSS feed, preferring a fast rss2json mirror first and falling back to feed/proxy parsing when needed.

**Features:**
- Daily word with concise definition, phonetic, and part of speech
- Example sentences when available
- 1-hour caching
- Source link to Merriam-Webster
- Minimal default UI: definition first, optional agent follow-up panel on demand

### news.ts (News Aggregation)

The `fetchAllNews()` and `fetchNewsForQuery()` functions in `src/services/news.ts` aggregate news from multiple trusted RSS sources and enrich each article for direct-source use.

**Sources:**
- Straight Arrow News (Center - original reporting)
- Tangle (Center - curated summaries)
- WSJ Tech/World/US (Center-Right - quality journalism)
- NewsNation (Center - original reporting)

**Features:**
- Parallel fetching from all sources
- Direct/proxied RSS parsing with rss2json fallback for blocked feeds
- Automatic deduplication
- Date-based sorting
- Query filtering for topic-specific news
- Per-article body-text enrichment for agent context
- Best-effort primary-source detection from article links and metadata
- Explicit `directArticleUrl` and optional `primarySourceUrl` fields for UI and citation use

### NewsView Editorial Desk

The `NewsView` component (`src/components/NewsView.tsx`) is a news-only editorial surface:

**Layout:**
- lead story panel
- latest-desk side rail
- additional coverage grid that auto-fits card columns instead of leaving fixed dead space on wide canvases
- source toggles for the approved outlets only

**Per-Article Controls:**
- direct article button
- primary-source button when detected
- ask-about-this-story button

**News Chat Context:**
- uses hydrated article body text, direct article URLs, and detected primary sources
- stays inside news mode instead of re-triggering generic search/news actions

### rss.ts (RSS Parser)

Lightweight RSS/Atom parsing + remote fetch fallback layer for browser-safe feed ingestion.

### Other Services

- `dictionary.ts` - Definition lookups (dictionaryapi.dev)
- `pyodide.ts` - Python code execution in browser

---

## Response Rendering

### RichResponse Component

`src/components/RichResponse.tsx` renders AI responses with:

| Feature | Library/Method |
|---------|---------------|
| Markdown | react-markdown + remark-gfm |
| Math (LaTeX) | remark-math + rehype-katex |
| Code blocks | Syntax highlighting |
| Charts | recharts (JSON chart blocks with line/bar/area/scatter support) |
| Chemical structures | smiles-drawer (dark mode support, error fallback with copy/retry) |
| Image search results | Inline rendering with `ImageRenderer` |
| Video embeds | `VideoEmbed` (YouTube) plus a companion brief card with fit summary, channel/date metadata, and transcript-or-notes fallback |
| Definitions | `DictionaryResult` cards |
| Source citations | Custom source-card UI (not raw markdown) |

In compact mode, `RichResponse` uses a denser but still readability-first prose style for follow-up chat:
- larger line height than a normal chat bubble
- preserved list spacing for numbered steps
- visible blockquote/callout styling
- the same media-marker resolution pipeline as the main answer

### ChatPanel Component

`src/components/ChatPanel.tsx` is a purpose-built tutoring surface rather than a generic messenger:

- conversation history in a dedicated reading pane with themed scroll chrome
- side action rail with a primary composer card, explicit `Esc` behavior, and stronger empty/error states
- large reply cards pulled from tutor clarification choices when available
- otherwise seeded with solution-aware starter prompts (for example next-step, study guide, video recap, or video-comparison prompts)
- retry/edit controls for the last user turn

### SolutionDisplay Component

`src/components/SolutionDisplay.tsx` can split the answer body from the final `**Answer:**` section.

For homework-like prompts:
- the teaching portion renders first with sources intact
- the final answer is hidden behind a reveal button
- students can toggle the answer open only when they want to check their work
- the homework-safe flag is persisted with saved solutions/history so the behavior survives reloads and revisits

### Print / PDF Output

`src/index.css` defines a dedicated print layer so `window.print()` exports cleaner PDFs:
- hides interactive chrome via `.no-print`
- removes grid/shadow effects
- sets tighter page margins and print-safe typography
- avoids splitting major cards, charts, tables, and code blocks across pages when possible
- prints links with their URLs for shareable PDFs

### Media Markers

Gemini responses may contain markers that get resolved client-side:
```
[IMAGE_SEARCH: "descriptive query"]
[VIDEO_SEARCH: "descriptive query"]
[WEB_SEARCH: "descriptive query"]
```

These resolve to actual content or fall back to external search links.

---

## Component Patterns

### Naming Conventions
- PascalCase for component files: `SolutionDisplay.tsx`
- camelCase for hooks: `useHistory.ts`
- kebab-case for utilities: `input.ts`

### Import Order
1. React
2. External libraries
3. Internal modules
4. Types

### Common Patterns

**State Updates (Functional)**:
```typescript
setState(prev => ...newValue)
```

**Component Props**: Define in `types.ts` for shared interfaces.

**Accessibility**:
- All buttons have `type="button"`
- Labels use `htmlFor` or wrapping
- Keyboard-accessible interactive elements
- No `aria-hidden` on focusable elements

---

## Styling System

### CSS Variables (index.css)

```css
--aqs-accent: #7a1f34           /* Maroon primary */
--aqs-accent-strong: #5d1526     /* Darker maroon */
--aqs-accent-soft: #f7ecf0       /* Light maroon bg */
--aqs-gold: #b88c3a             /* Gold accent */
```

### Design Tokens

| Token | Light Mode | Dark Mode |
|-------|------------|-----------|
| Neo-shadow | `4px 4px 0px 0px rgba(17,24,39,1)` | `4px 4px 0px 0px white` |
| Border | `border-2 border-gray-900` | `border-2 border-gray-100` |
| Container radius | `rounded-[2.2rem]` | same |

### Typography
- Sans: Space Grotesk
- Mono: JetBrains Mono

---

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `GEMINI_API_KEY` | Yes | Gemini AI API key |
| `GOOGLE_API_KEY` | No | Google search features |
| `GEMINI_FAST_MODEL` | No | Override default fast model |
| `GEMINI_GROUNDED_MODEL` | No | Override grounded model |
| `GEMINI_PRO_MODEL` | No | Override pro model |

Vite exposes these via `import.meta.env` because `vite.config.ts` uses `envPrefix: ['VITE_', 'GEMINI_', 'GOOGLE_']`.

---

## Commands

```bash
bun install  # Install dependencies
bun dev      # Dev server on port 3000 (0.0.0.0)
bun run build # Production build to dist/
bun lint     # TypeScript check (tsc --noEmit)
bun test src/utils/image.test.ts src/utils/input.test.ts src/utils/solution.test.ts src/services/gemini.test.ts src/services/news.test.ts src/services/wotd.test.ts
```

---

## Important Notes

1. **.env.local is required** at runtime and is NOT hot-reloaded. Restart `bun dev` after changes.

2. **API key in bundle**: The Gemini key is shipped to the client bundle in this architecture.

3. **Rate limits**: Free tiers hit limits quickly. If `deep` fails, retry with `fast`.

4. **Auto-upgrading**: The app auto-upgrades to grounded or Pro-tier model routing for source-sensitive or complex prompts.

5. **Image fallbacks**: Image rendering has public fallbacks (Openverse, Wikimedia) so image cards still work without `GOOGLE_API_KEY`.

6. **KaTeX bundled**: KaTeX styles come through npm imports. Do NOT add redundant CDN stylesheets in `index.html`.

7. **Web Speech API**: Browser-dependent. Test on Chrome/Edge over `localhost` or HTTPS.

---

## Adding New Features

When adding new features:

1. **Components**: Add to `src/components/` following existing patterns
2. **Services**: Add to `src/services/` for external API calls
3. **Utils**: Add pure functions to `src/utils/`
4. **Types**: Define shared interfaces in `types.ts`
5. **Tests**: Add unit tests alongside source files (`*.test.ts`)
6. **Styling**: Use existing CSS variables and Tailwind classes

### Service Integration Pattern

```typescript
// src/services/newService.ts
export async function newService(param: string): Promise<Result> {
  const response = await fetch(...);
  if (!response.ok) throw new Error(...);
  return response.json();
}
```

### Component Pattern

```typescript
// src/components/NewComponent.tsx
import { useState, useCallback } from 'react';
import type { SomeType } from '@/types';

interface Props {
  value: SomeType;
  onChange: (value: SomeType) => void;
}

export function NewComponent({ value, onChange }: Props) {
  const [local, setLocal] = useState(value);
  
  const handleChange = useCallback((next: SomeType) => {
    setLocal(next);
    onChange(next);
  }, [onChange]);
  
  return <div>...</div>;
}
```
