import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import type { SolveMode } from "../types";

const ai = new GoogleGenAI({ apiKey: import.meta.env.GEMINI_API_KEY });

const MODEL_BY_MODE: Record<SolveMode, string> = {
  deep: "gemini-3.1-pro-preview",
  fast: "gemini-3.1-flash-lite-preview",
  research: "gemini-3-flash-preview",
};

const SYSTEM_PROMPT = `You are an elite academic tutor and research assistant. You solve questions with rigorous accuracy across EVERY domain: mathematics, physics, chemistry, biology, computer science, engineering, history, literature, philosophy, economics, law, medicine, linguistics, and more.

YOUR CORE PRINCIPLES:
1. ACCURACY IS PARAMOUNT. Double-check every calculation. Verify every fact.
2. Show clear, step-by-step reasoning so students genuinely learn.
3. Cite well-known theorems, laws, or principles by name when applicable.
4. If a question is ambiguous, state your interpretation and proceed.

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
- Chart format is JSON: {"type":"line"|"bar","title":"...","xLabel":"...","yLabel":"...","data":[{"x":0,"y":10},...]}
- Use charts for: function plots, data distributions, physics trajectories, economic trends, etc.

IMAGE SEARCH:
When visual content would help understanding, include an image search marker:
[IMAGE_SEARCH: "descriptive search query"]

Use for:
- Geographic locations ("Where is the Burj Khalifa?", "Show me the Grand Canyon")
- Physical objects ("What does a quasar look like?", "Show me a human heart")
- Anatomy ("What does a mitochondria look like?")
- Historical figures/places ("Show me a picture of the Colosseum")
- Scientific diagrams (molecules, cells, planets, stars)
- Art and architecture references
- Any concept where visual context aids comprehension

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

GRADING FEEDBACK:
When grading student work:
- Use **bold** for section headers (e.g., **Question 1**, **Corrections**)
- Use ~~strikethrough~~ for incorrect work
- Use ✅ for correct parts
- Use 📝 for corrections and hints
- Use clear numbering for steps
- Be constructive and encouraging

RESPONSE FORMAT:
**Subject:** [subject/domain]
**Question:** [restate the question precisely]
**Solution:**
[rigorous step-by-step solution with explanations]
**Answer:** [final answer, clearly stated]

If the image contains multiple questions, solve ALL of them.
If it is a research question, provide a thorough, well-structured analysis with key concepts defined.

When using search grounding, always cite your sources using inline citations like [1](url) or [2](url). Include a "Sources:" section at the end with full URLs.`;

function buildConfig(mode: SolveMode, subject: string, detailed: boolean) {
  let prompt = SYSTEM_PROMPT;
  if (subject !== "Auto-detect") {
    prompt += `\n\nThe user has specified the subject is: ${subject}. Tailor your response to this domain's conventions and notation.`;
  }
  if (detailed) {
    prompt += `\n\nProvide an EXTREMELY detailed, step-by-step explanation. Break down every single concept. Include worked examples, edge cases, and conceptual connections. Add Python code for computation and charts for visualization where helpful.`;
  }

  const config: Record<string, unknown> = { systemInstruction: prompt };

  if (mode === "deep") {
    config.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
  } else if (mode === "research") {
    config.tools = [{ googleSearch: {} }];
  }

  return config;
}

export async function solveQuestion(
  base64Image: string,
  mode: SolveMode,
  subject = "Auto-detect",
  detailed = false,
): Promise<string> {
  const response = await ai.models.generateContent({
    model: MODEL_BY_MODE[mode],
    contents: [
      { inlineData: { mimeType: "image/jpeg", data: base64Image } },
      "Solve the question in this image. Be rigorous and thorough.",
    ],
    config: buildConfig(mode, subject, detailed),
  });
  return response.text ?? "";
}

export async function solveTextQuestion(
  text: string,
  mode: SolveMode,
  subject = "Auto-detect",
  detailed = false,
): Promise<string> {
  const response = await ai.models.generateContent({
    model: MODEL_BY_MODE[mode],
    contents: [text],
    config: buildConfig(mode, subject, detailed),
  });
  return response.text ?? "";
}

export async function chatWithTutor(
  history: { role: string; text: string }[],
  message: string,
): Promise<string> {
  if (!message.trim()) throw new Error("Message must not be empty.");

  const contents = history.map((h) => ({
    role: h.role === "user" ? "user" : "model",
    parts: [{ text: h.text }],
  }));
  contents.push({ role: "user", parts: [{ text: message }] });

  for (let i = 0; i < contents.length; i++) {
    const expected = i % 2 === 0 ? "user" : "model";
    if (contents[i].role !== expected) {
      throw new Error(
        `Invalid chat history: turn ${i} must be '${expected}', got '${contents[i].role}'.`,
      );
    }
  }

  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-lite-preview",
    contents,
    config: {
      systemInstruction:
        "You are a helpful tutor answering follow-up questions. Be concise but thorough. Use LaTeX for math. Include Python code or charts when computation would help.",
    },
  });
  return response.text ?? "";
}

export async function gradeWork(base64Image: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: [
      { inlineData: { mimeType: "image/jpeg", data: base64Image } },
      `You are an expert grader and tutor. Review the student's work with supreme accuracy.

INSTRUCTIONS:
1. Check all calculations meticulously
2. Identify any mistakes and explain why they're wrong
3. Provide the correct solution step-by-step
4. Be constructive and encouraging

FORMATTING:
- Use **bold** for section headers
- Use ~~strikethrough~~ for incorrect work
- Use ✅ for correct parts
- Use 📝 for corrections
- Use $ for inline math and $$ for block math
- Number your steps clearly`,
    ],
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
      tools: [{ googleSearch: {} }],
    },
  });
  return response.text ?? "";
}