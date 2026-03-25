import {
  GoogleGenAI,
  ThinkingLevel,
  type GenerateContentParameters,
  type GenerateContentResponse,
  type GroundingMetadata,
} from "@google/genai";

import type { SolutionSource, SolveMode } from "../types";
import { embedSourcesInSolution } from "../utils/solution";
import { isLikelyHomeworkRequest, shouldAskClarifyingQuestions } from "../utils/request";

function getAiClient() {
  return new GoogleGenAI({ apiKey: import.meta.env.GEMINI_API_KEY });
}

async function blobToBase64(blob: Blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const chunks: string[] = [];
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    chunks.push(String.fromCharCode.apply(null, chunk as unknown as number[]));
  }

  return btoa(chunks.join(""));
}

const MODEL_CANDIDATES = {
  fast: [import.meta.env.GEMINI_FAST_MODEL, "gemini-2.5-flash-lite", "gemini-2.5-flash"],
  grounded: [import.meta.env.GEMINI_GROUNDED_MODEL, "gemini-2.5-flash", "gemini-2.5-flash-lite"],
  pro: [import.meta.env.GEMINI_PRO_MODEL, "gemini-2.5-pro", "gemini-2.5-flash"],
};
const MAX_RATE_LIMIT_ATTEMPTS_PER_MODEL = 2;
const RATE_LIMIT_BACKOFF_MS = 1200;

type SourceIntent = "general" | "scholarly" | "news";

const PRO_COMPLEXITY_HINTS =
  /\b(prove|proof|derive|derivation|rigorous|formal|analy[sz]e|compare|synthesize|optimi[sz]e|walkthrough|theorem|graduate|dissertation|essay|case law|mechanism|multistep|step-by-step)\b/i;
const GROUNDED_QUESTION_HINTS =
  /\b(source|sources|cite|citation|reference|references|latest|recent|current|today|news|study|studies|paper|papers|journal|journals|guideline|guidelines|evidence|historical|history|law|legal|medical|medicine|statistic|statistics|real world|real-world|president|vice president|prime minister|governor|mayor|ceo|chief executive officer|secretary of state|speaker of the house|pope|king|queen)\b/i;
const SCHOLARLY_HINTS =
  /\b(scholarly|academic|peer-reviewed|peer reviewed|journal|journals|paper|papers|study|studies|meta-analysis|systematic review|doi|research article|literature review)\b/i;
const NEWS_HINTS =
  /\b(news|headline|headlines|breaking|reported|reporting|latest|recent|today|yesterday|this week|current events|election|conflict|war|market|markets|earnings|announced)\b/i;
const CURRENT_FACT_HINTS =
  /\b(current|currently|right now|today|as of|latest|most recent|incumbent|who is|who's|whos)\b/i;
const CALCULUS_HINTS =
  /\b(calculus|differentiat|derivativ|integral|integrat|limit|series|taylor|maclaurin|critical point|optimization|maxim|minim|concavity|inflection|related rates|differential equation)\b/i;
const GRAPHING_HINTS =
  /\b(graph|plot|sketch|curve|function shape|intercept|asymptote|turning point|critical point|domain|range|slope field|phase portrait)\b/i;
const LOW_TRUST_HOSTS = [
  "reddit.com",
  "quora.com",
  "brainly.com",
  "coursehero.com",
  "chegg.com",
  "wikihow.com",
  "forums",
  "stackexchange.com",
];
const PROXY_HOSTS = ["vertexaisearch.cloud.google.com", "vertexaisearch.cloud.googleusercontent.com"];
const TERTIARY_REFERENCE_HOSTS = ["wikipedia.org", "britannica.com"];
const ADVOCACY_OR_IDEOLOGY_HOSTS = [
  "amnesty.org",
  "hrw.org",
  "greenpeace.org",
  "heritage.org",
  "brookings.edu",
  "cato.org",
  "realinstitutoelcano.org",
  "rand.org",
];
const HIGH_TRUST_NEWS_HOSTS = [
  "reuters.com",
  "apnews.com",
  "bbc.com",
  "pbs.org",
  "npr.org",
];
const CURATED_NEWS_HOSTS = [
  "san.com",
  "readtangle.com",
  "wsj.com",
  "newsnationnow.com",
  "thecentersquare.com",
];
const SCHOLARLY_HOST_HINTS = [
  "pubmed",
  "nature.com",
  "science.org",
  "sciencedirect.com",
  "springer.com",
  "jstor.org",
  "wiley.com",
  "nejm.org",
  "thelancet.com",
  "cell.com",
  "ieee.org",
  "acm.org",
  "arxiv.org",
];
const OFFICIAL_ORG_HOSTS = [
  "who.int",
  "cdc.gov",
  "fda.gov",
  "nih.gov",
  "ncbi.nlm.nih.gov",
  "worldbank.org",
  "imf.org",
  "oecd.org",
  "un.org",
  "europa.eu",
  "parliament.uk",
];

const MEDIA_MARKER_PROMPT = `IMAGE SEARCH:
When visual content would help understanding, include an image search marker:
[IMAGE_SEARCH: "descriptive search query"]

Use for:
- Geographic locations, physical objects, anatomy, diagrams, architecture, historical places, and anything the user explicitly wants to see.

VIDEO SEARCH:
When the best answer includes a real video, lecture, interview, tutorial, documentary, performance, or official clip, include:
[VIDEO_SEARCH: "descriptive YouTube search query"]

Use for:
- Music videos, speeches, lectures, walkthroughs, tutorials, demonstrations, documentaries, and user requests to "show me the video" or "find this on YouTube."

WEB SEARCH:
When the user explicitly wants further reading, official pages, primary documents, or a short list of links, include:
[WEB_SEARCH: "descriptive web search query"]`;

const SYSTEM_PROMPT = `You are an elite academic tutor and research assistant. You solve questions with rigorous accuracy across EVERY domain: mathematics, physics, chemistry, biology, computer science, engineering, history, literature, philosophy, economics, law, medicine, linguistics, and more.

YOUR CORE PRINCIPLES:
1. ACCURACY IS PARAMOUNT. Double-check every calculation. Verify every fact.
2. Show clear, step-by-step reasoning so students genuinely learn.
3. Cite well-known theorems, laws, or principles by name when applicable.
4. If a question is ambiguous, state your interpretation and proceed.
5. Be proactive. If the user provides partial or completed work, inspect that work first and continue tutoring from it.
6. For mathematics, prefer exact symbolic answers first, then give decimal approximations only when useful.
7. For time-sensitive facts, verify them with live search grounding and state the exact date or time context when it matters.
8. Match reasoning depth to the task. Be fast and direct for simple questions; reason deeply only when the problem is genuinely multi-step, ambiguous, or high-stakes.

FORMATTING RULES:
- Use LaTeX with single dollar signs ($) for inline math and double ($$) for display math.
- NEVER use \\( \\) or \\[ \\]. NEVER write math as plain text.
- For chemistry: use LaTeX subscripts for formulas (e.g., $\\text{H}_2\\text{O}$, $\\text{NaOH}$).
- For 2D molecular structures, output SMILES inside a \`\`\`smiles code block.
- For organic reactions, write balanced equations using LaTeX with \\rightarrow.

CODE & COMPUTATION:
- When a problem benefits from computation, include runnable Python code in a \`\`\`python block.
- For physics simulations, statistical analysis, or numerical methods — always include Python.
- Code must be self-contained and print its results clearly.

DATA VISUALIZATION:
- When data or a function plot would help understanding, output a chart in a \`\`\`chart block.
- Chart format is JSON: {"type":"line"|"bar"|"area"|"scatter","title":"...","xLabel":"...","yLabel":"...","xKey":"x","series":[{"key":"y","label":"f(x)"}],"data":[{"x":0,"y":10},...]}
- For function graphs, include enough sample points to make the curve look correct, and mention key intercepts, extrema, asymptotes, or discontinuities in prose.
- Use charts for: function plots, data distributions, physics trajectories, economic trends, comparative series, and scatter data.

${MEDIA_MARKER_PROMPT}

VIDEO REQUESTS:
- If the user asks for a video, tutorial, or YouTube content, include a [VIDEO_SEARCH: "query"] marker so the client can render an actual video.
- DO NOT describe videos that don't exist. Include the marker so the system can find real video content.

FEATURE INVOCATION:
When the user wants to access built-in features, respond with a special action marker:

To show Word of the Day:
[ACTION: show_wotd]

To show Latest News:
[ACTION: show_news]

When you invoke these, you can ALSO answer any related questions about the content shown.

EXAMPLES:
- User: "Show me the word of the day" → [ACTION: show_wotd] + explanation
- User: "What's today's news?" → [ACTION: show_news] + explanation
- User: "Tell me about the word of the day and give me an example" → [ACTION: show_wotd] + "The word is X, which means..."

NEWS REQUESTS:
- For news, current events, or recent developments, ALWAYS use [ACTION: show_news] to show real, up-to-date news.
- Do NOT make up news stories or claim to have access to current events.
- After invoking [ACTION: show_news], you can summarize or discuss the articles shown.

DEFINITIONS:
When defining a word, structure the response as:
[DEFINITION]
**word** /phonetic pronunciation/
*part of speech*
1. Definition here.
   - Example: "quote showing usage"
2. Second definition if applicable.

Synonyms: word1, word2, word3
[END_DEFINITION]

WORK-CHECKING BEHAVIOR:
- Decide whether the user needs a fresh solution, a work check, or both.
- If the user shares their own attempt, notes, or final answer, do NOT ask them to choose a separate mode.
- Start by identifying what is already correct.
- Pinpoint the first meaningful mistake, missing assumption, or unfinished step.
- Continue with the corrected reasoning and tell the user what to do next if they want to keep working independently.
- If their work is already correct, say so clearly and offer a shorter verification, alternative method, or next insight.
- Be constructive and encouraging without becoming vague.
- Be proactive with underspecified but ordinary requests. If the user asks for a definition, summary, quick explanation, or a common reference item, choose a sensible default and answer directly instead of asking them to pick a source unless the source truly changes the answer.
- IMPORTANT: For "word of the day" requests, ALWAYS use [ACTION: show_wotd] to show the actual word of the day from Merriam-Webster. Do NOT make up a word.
- If the request is genuinely underspecified for a correct answer, ask up to 3 concise clarification questions instead of guessing.
- If the request is clearly homework or coursework, teach the method first. Keep any final answer in the dedicated **Answer:** section only so the UI can hide it by default.

RESPONSE FORMAT:
**Subject:** [subject/domain]
**Question:** [restate the question precisely]
**Work Check:** [only include this section when the user shared work, a draft, or an answer to verify]
**Solution:**
[rigorous step-by-step solution with explanations]
**Answer:** [final answer, clearly stated]

If the image contains multiple questions, solve ALL of them.
If it is a research question, provide a thorough, well-structured analysis with key concepts defined.

When search grounding is active:
- Prefer university, government, peer-reviewed, official, or other academically reliable sources.
- For scholarly questions, prefer peer-reviewed journals, university sources, official agencies, and primary research over general websites.
- For news or current events, prefer Reuters, AP, BBC, PBS, NPR, and primary official statements over opinion or partisan outlets.
- For time-sensitive identity questions such as the current president, prime minister, CEO, or office holder, verify the answer live and give the exact date context of that answer.
- Do NOT rely on forums, homework mills, or anonymous community posts unless absolutely unavoidable.
- Be explicitly truth-seeking: separate verified facts from interpretation, and avoid partisan framing or sensational language.
- Use inline citations like [1], [2], [3] in the answer body when a claim depends on a source.
- Do NOT add a separate "Sources:" list at the end; the client renders sources separately.`;

function getRequestText(input: string | null | undefined) {
  return input?.trim() ?? "";
}

function shouldAutoUsePro(text: string, mode: SolveMode, detailed: boolean) {
  if (mode === "deep" || detailed) {
    return true;
  }

  return text.length > 650 || PRO_COMPLEXITY_HINTS.test(text);
}

function shouldAutoUseGrounding(text: string, mode: SolveMode) {
  if (mode === "research") {
    return true;
  }

  return GROUNDED_QUESTION_HINTS.test(text) || (CURRENT_FACT_HINTS.test(text) && /\b(president|vice president|prime minister|governor|mayor|ceo|chief executive officer|secretary|speaker|pope|king|queen)\b/i.test(text));
}

export function getSourceIntent(text: string): SourceIntent {
  if (SCHOLARLY_HINTS.test(text)) {
    return "scholarly";
  }
  if (NEWS_HINTS.test(text)) {
    return "news";
  }

  return "general";
}

function extractDomainFromText(text: string) {
  const match = text.toLowerCase().match(/\b([a-z0-9-]+(?:\.[a-z0-9-]+)+)\b/);
  return match?.[1] ?? "";
}

function isProxyHost(host: string) {
  return PROXY_HOSTS.some((entry) => host.includes(entry));
}

function isHighTrustNewsHost(host: string) {
  return HIGH_TRUST_NEWS_HOSTS.some((entry) => host.includes(entry));
}

function isCuratedNewsHost(host: string) {
  return CURATED_NEWS_HOSTS.some((entry) => host.includes(entry));
}

function isScholarlyHost(host: string) {
  return (
    host.endsWith(".edu") ||
    host.includes(".ac.") ||
    SCHOLARLY_HOST_HINTS.some((entry) => host.includes(entry))
  );
}

function isOfficialHost(host: string) {
  return host.endsWith(".gov") || host.includes(".gov.") || OFFICIAL_ORG_HOSTS.some((entry) => host.includes(entry));
}

function isAdvocacyOrIdeologyHost(host: string) {
  return ADVOCACY_OR_IDEOLOGY_HOSTS.some((entry) => host.includes(entry));
}

function isTertiaryReferenceHost(host: string) {
  return TERTIARY_REFERENCE_HOSTS.some((entry) => host.includes(entry));
}

function normalizeGroundingSource(chunk: NonNullable<GroundingMetadata["groundingChunks"]>[number]) {
  const rawUrl = chunk.web?.uri?.trim() ?? "";
  const rawTitle = chunk.web?.title?.trim() ?? "";

  let host = "";
  try {
    host = rawUrl ? new URL(rawUrl).hostname.replace(/^www\./, "") : "";
  } catch {
    host = "";
  }

  const titleDomain = rawTitle ? extractDomainFromText(rawTitle) : "";
  const displayHost = isProxyHost(host) && titleDomain ? titleDomain.replace(/^www\./, "") : host;
  const displayTitle =
    rawTitle && rawTitle.toLowerCase() !== displayHost ? rawTitle : displayHost || rawTitle || rawUrl;

  return {
    url: rawUrl,
    title: displayTitle,
    host: displayHost,
  };
}

function getSourceCategory(host: string) {
  if (isOfficialHost(host)) {
    return "Government / Official";
  }
  if (host.endsWith(".edu") || host.includes(".ac.")) {
    return "University";
  }
  if (SCHOLARLY_HOST_HINTS.some((entry) => host.includes(entry))) {
    return "Journal / Research";
  }
  if (isHighTrustNewsHost(host)) {
    return "Major Newsroom";
  }
  if (isCuratedNewsHost(host)) {
    return "Curated Newsroom";
  }
  if (isTertiaryReferenceHost(host)) {
    return "Reference";
  }
  if (host.includes("org")) {
    return "Reference / Organization";
  }

  return "Reliable Web Source";
}

function getHostScore(host: string, intent: SourceIntent) {
  if (!host) {
    return 0;
  }
  if (isProxyHost(host)) {
    return 0;
  }
  if (LOW_TRUST_HOSTS.some((entry) => host.includes(entry))) {
    return 0;
  }
  if (isAdvocacyOrIdeologyHost(host)) {
    return intent === "general" ? 1 : 0;
  }
  if (isTertiaryReferenceHost(host)) {
    return intent === "general" ? 2 : 0;
  }
  if (intent === "news" && isHighTrustNewsHost(host)) {
    return 6;
  }
  if (intent === "news" && isCuratedNewsHost(host)) {
    return 5;
  }
  if (intent === "scholarly" && (isScholarlyHost(host) || isOfficialHost(host))) {
    return 6;
  }
  if (isOfficialHost(host)) {
    return 6;
  }
  if (host.endsWith(".edu") || host.includes(".ac.")) {
    return 5;
  }
  if (SCHOLARLY_HOST_HINTS.some((entry) => host.includes(entry))) {
    return 5;
  }
  if (host.includes("org")) {
    return 4;
  }
  if (isHighTrustNewsHost(host)) {
    return 3;
  }
  if (isCuratedNewsHost(host)) {
    return 3;
  }

  return 2;
}

export function extractReliableSources(
  groundingMetadata?: GroundingMetadata,
  requestText = "",
): SolutionSource[] {
  const intent = getSourceIntent(requestText);
  const chunks = groundingMetadata?.groundingChunks ?? [];
  const deduped = new Map<string, SolutionSource & { score: number }>();

  for (const chunk of chunks) {
    const normalized = normalizeGroundingSource(chunk);
    const url = normalized.url;
    const title = normalized.title;
    const host = normalized.host;
    if (!url || !title || !host) {
      continue;
    }

    const score = getHostScore(host, intent);
    const existing = deduped.get(url);
    if (existing && existing.score >= score) {
      continue;
    }

    deduped.set(url, {
      index: 0,
      title,
      url,
      host,
      category: getSourceCategory(host),
      score,
    });
  }

  let ranked = [...deduped.values()].sort((left, right) => right.score - left.score);
  if (intent === "scholarly") {
    const scholarlyOnly = ranked.filter((source) => source.score >= 5);
    if (scholarlyOnly.length > 0) {
      ranked = scholarlyOnly;
    }
  }
  if (intent === "news") {
    const newsOnly = ranked.filter(
      (source) => isHighTrustNewsHost(source.host) || source.category === "Government / Official",
    );
    if (newsOnly.length > 0) {
      ranked = newsOnly;
    }
  }
  const reliableOnly = ranked.filter((source) => source.score >= 4);
  if (reliableOnly.length > 0) {
    ranked = reliableOnly;
  }

  return ranked.slice(0, 4).map((source, index) => ({
    index: index + 1,
    title: source.title,
    url: source.url,
    host: source.host,
    category: source.category,
  }));
}

export function stripTrailingSourcesSection(text: string) {
  return text
    .replace(/\n{0,2}(?:#{1,6}\s*)?Sources\s*:?\s*(?:\n(?:[-*]|\d+\.)[^\n]+)+\s*$/i, "")
    .replace(/\n{0,2}(?:#{1,6}\s*)?Sources\s*:?\s*(?:\nhttps?:\/\/[^\n]+)+\s*$/i, "")
    .trim();
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isModelAvailabilityIssue(message: string) {
  return (
    message.includes("404") ||
    message.includes("not found") ||
    message.includes("unsupported") ||
    message.includes("Unknown model") ||
    message.includes("not available")
  );
}

export function isRateLimitIssue(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("429") ||
    normalized.includes("quota") ||
    normalized.includes("rate limit") ||
    normalized.includes("resource_exhausted") ||
    normalized.includes("too many requests")
  );
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function generateWithFallback(
  modelCandidates: Array<string | undefined>,
  params: Omit<GenerateContentParameters, "model">,
): Promise<GenerateContentResponse> {
  const tried = new Set<string>();
  let lastError: unknown;

  for (const candidate of modelCandidates) {
    if (!candidate || tried.has(candidate)) {
      continue;
    }

    tried.add(candidate);
    for (let attempt = 0; attempt < MAX_RATE_LIMIT_ATTEMPTS_PER_MODEL; attempt += 1) {
      try {
        return await getAiClient().models.generateContent({
          ...params,
          model: candidate,
        });
      } catch (error) {
        lastError = error;
        const message = getErrorMessage(error);

        if (isModelAvailabilityIssue(message)) {
          break;
        }

        if (isRateLimitIssue(message)) {
          const hasMoreAttemptsForCandidate = attempt < MAX_RATE_LIMIT_ATTEMPTS_PER_MODEL - 1;
          if (hasMoreAttemptsForCandidate) {
            await wait(RATE_LIMIT_BACKOFF_MS * (attempt + 1));
            continue;
          }

          break;
        }

        throw error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("No usable Gemini model was available.");
}

function finalizeResponse(response: GenerateContentResponse, requestText: string) {
  const body = stripTrailingSourcesSection(response.text ?? "");
  const sources = extractReliableSources(response.candidates?.[0]?.groundingMetadata, requestText);
  return embedSourcesInSolution(body, sources);
}

export function buildRequestPlan(mode: SolveMode, text: string, detailed: boolean) {
  const useGrounding = shouldAutoUseGrounding(text, mode);
  const usePro = shouldAutoUsePro(text, mode, detailed) || (useGrounding && text.length > 180);

  return {
    useGrounding,
    modelCandidates: usePro
      ? MODEL_CANDIDATES.pro
      : useGrounding
        ? MODEL_CANDIDATES.grounded
        : MODEL_CANDIDATES.fast,
  };
}

function buildConfig(mode: SolveMode, subject: string, detailed: boolean, requestText = "") {
  let prompt = SYSTEM_PROMPT;
  if (subject !== "Auto-detect") {
    prompt += `\n\nThe user has specified the subject is: ${subject}. Tailor your response to this domain's conventions and notation.`;
  }
  if (detailed) {
    prompt += `\n\nProvide an EXTREMELY detailed, step-by-step explanation. Break down every single concept. Include worked examples, edge cases, and conceptual connections. Add Python code for computation and charts for visualization where helpful.`;
  }
  if (CALCULUS_HINTS.test(requestText)) {
    prompt += `\n\nFor calculus and higher math:
- verify derivatives by differentiating your final antiderivative or by checking with an equivalent method when practical
- verify integrals, limits, and extrema carefully before stating the answer
- prefer exact forms before decimals
- if a numeric approximation is needed, state the rounding clearly`;
  }
  if (GRAPHING_HINTS.test(requestText)) {
    prompt += `\n\nFor graphing requests:
- do not only describe the graph; include a chart block when the graph is central to the answer
- sample enough points for a smooth, trustworthy plot
- identify intercepts, asymptotes, extrema, inflection points, domain, and range when relevant`;
  }
  if (CURRENT_FACT_HINTS.test(requestText)) {
    prompt += `\n\nFor time-sensitive factual questions:
- verify the answer using live grounding
- include the exact date context when saying who currently holds an office or role
- if sources disagree, say so plainly and explain which source is primary`;
  }

  const config: Record<string, unknown> = { systemInstruction: prompt };

  if (mode === "deep") {
    config.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
  }

  return config;
}

export async function solveQuestion(
  base64Image: string,
  mode: SolveMode,
  subject = "Auto-detect",
  detailed = false,
): Promise<string> {
  const requestText = getRequestText(subject === "Auto-detect" ? "" : `Subject: ${subject}`);
  const plan = buildRequestPlan(mode, requestText, detailed);
  const config = buildConfig(mode, subject, detailed, requestText);
  const useGroundingForImage = plan.useGrounding || subject === "Auto-detect";
  if (useGroundingForImage) {
    config.tools = [{ googleSearch: {} }];
  }

  const response = await generateWithFallback(plan.modelCandidates, {
    contents: [
      { inlineData: { mimeType: "image/jpeg", data: base64Image } },
      `Analyze the uploaded image carefully. It may contain a question, a partial attempt, completed student work, or both.

If the image includes the user's work, proactively check it before giving the final answer:
- say what is correct,
- identify the first mistake or missing step,
- continue from the last correct idea,
- and then provide the corrected solution.

If the image is only the question prompt, solve it directly. Assume this may be coursework. Teach the method first and keep any final numeric/result statement isolated in the **Answer:** section only.

If the image is too ambiguous to answer correctly, ask concise clarification questions instead of guessing.`,
    ],
    config,
  });
  return finalizeResponse(response, requestText);
}

export async function solveTextQuestion(
  text: string,
  mode: SolveMode,
  subject = "Auto-detect",
  detailed = false,
): Promise<string> {
  const requestText = getRequestText(text);
  const plan = buildRequestPlan(mode, requestText, detailed);
  const config = buildConfig(mode, subject, detailed, requestText);
  const looksLikeHomework = isLikelyHomeworkRequest(requestText, { subject });
  const shouldClarify = shouldAskClarifyingQuestions(requestText);
  if (plan.useGrounding) {
    config.tools = [{ googleSearch: {} }];
  }

  const response = await generateWithFallback(plan.modelCandidates, {
    contents: [
      `User request:

${text}

If the user pasted their own attempt, notes, or answer, proactively check that work first and then continue tutoring. If it is just a question, solve it directly.

${looksLikeHomework ? "This looks like student coursework. Teach the underlying method first and keep the final answer confined to the **Answer:** section only." : ""}
${shouldClarify ? "This may be too vague for a correct answer. If key details are missing, ask up to 3 concise clarification questions and stop there." : ""}`,
    ],
    config,
  });
  return finalizeResponse(response, requestText);
}

export async function chatWithTutor(
  history: { role: string; text: string }[],
  message: string,
  originalQuestion?: { text?: string; imageBase64?: string },
): Promise<string> {
  if (!message.trim()) throw new Error("Message must not be empty.");

  const contents: Array<{ role: "user" | "model"; parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> }> = [];

  // Add original question context if provided
  if (originalQuestion) {
    const originalParts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
    if (originalQuestion.imageBase64) {
      originalParts.push({
        inlineData: { mimeType: "image/jpeg", data: originalQuestion.imageBase64 },
      });
    }
    if (originalQuestion.text) {
      originalParts.push({ text: `The user originally asked: ${originalQuestion.text}` });
    } else if (originalParts.length > 0) {
      originalParts.push({ text: "The image above shows the user's original question." });
    }
    if (originalParts.length > 0) {
      contents.push({ role: "user", parts: originalParts });
    }
  }

  // Add conversation history
  for (const h of history) {
    contents.push({
      role: h.role === "user" ? "user" : "model",
      parts: [{ text: h.text }],
    });
  }

  // Add current message
  contents.push({ role: "user", parts: [{ text: message }] });

  for (let i = 0; i < contents.length; i++) {
    const expected = i % 2 === 0 ? "user" : "model";
    if (contents[i].role !== expected) {
      throw new Error(
        `Invalid chat history: turn ${i} must be '${expected}', got '${contents[i].role}'.`,
      );
    }
  }

  const plan = buildRequestPlan("fast", message, false);
  const response = await generateWithFallback(plan.modelCandidates, {
    contents,
    config: {
      systemInstruction:
        `You are a helpful tutor answering follow-up questions. Be concise but thorough. If the user asks whether their work is right, verify it directly before expanding. Use LaTeX for math. Include Python code or charts when computation would help.

IMPORTANT: Always keep the original question in mind when answering follow-ups. Reference specific aspects of the original question and any original image when relevant. Build upon or correct the original reasoning as needed.

If the follow-up is too vague to answer correctly, ask concise clarification questions instead of guessing.
If the original problem is clearly coursework, continue teaching method-first and keep any final result isolated in the **Answer:** section only.

${MEDIA_MARKER_PROMPT}

If the user asks for a picture, diagram, video, YouTube result, or a set of links, emit the appropriate marker so the client can render it directly.`,
      ...(plan.useGrounding ? { tools: [{ googleSearch: {} }] } : {}),
    },
  });
  return finalizeResponse(response, message);
}

export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  if (!audioBlob.size) {
    throw new Error("Audio recording was empty.");
  }

  const mimeType = audioBlob.type || "audio/ogg";
  const base64Audio = await blobToBase64(audioBlob);
  const response = await generateWithFallback(MODEL_CANDIDATES.fast, {
    contents: [
      {
        inlineData: {
          mimeType,
          data: base64Audio,
        },
      },
      `Transcribe the spoken audio into clean plain text.

Rules:
- Return only the transcript text.
- Keep the wording faithful to the speaker.
- Fix obvious punctuation and capitalization.
- Do not add commentary, labels, or quotes.
- If the audio is unclear, transcribe the intelligible parts only.`,
    ],
    config: {
      systemInstruction:
        "You are a precise transcription assistant. Return only the user's transcript with clean punctuation.",
    },
  });

  return (response.text ?? "").trim();
}
