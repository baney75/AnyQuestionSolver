import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import type { SolveMode, GradeResult } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Maps each solve mode to the appropriate Gemini model identifier.
const MODEL_BY_MODE: Record<SolveMode, string> = {
  deep: "gemini-3.1-pro-preview",
  fast: "gemini-3.1-flash-lite-preview",
  search: "gemini-3-flash-preview",
};

const SYSTEM_PROMPT = `You are an expert tutor capable of solving any academic question across all subjects including mathematics, physics, chemistry, biology, computer science, history, literature, logic, and foreign languages.

When given an image containing a question:
1. First, identify and state the exact question being asked.
2. Identify the subject/topic.
3. Provide a clear, step-by-step solution.
4. State the final answer clearly and concisely.

CRITICAL FORMATTING RULES:
- You MUST use LaTeX for ALL math equations, symbols, variables, and numbers.
- Use single dollar signs ($) for inline math (e.g., $x^2 + y^2 = z^2$).
- Use double dollar signs ($$) for block/display math.
- NEVER use \\( or \\) or \\[ or \\].
- NEVER write math as plain text (like x^2 or 1/3). Always wrap in $.
- For Chemistry, use standard LaTeX subscripts/superscripts for chemical formulas (e.g., $\\text{H}_2\\text{O}$). Do NOT use \\ce{} as it requires an unsupported extension.
- For 2D Chemical Structures (SMILES), output them inside a markdown code block with the language set to "smiles" (e.g., \`\`\`smiles\\nCCO\\n\`\`\`).

If the image contains multiple questions, solve all of them.
If the question is ambiguous or partially cut off, state your assumption and proceed.
If the image contains no identifiable question, say so clearly.

Format your response as:
**Subject:** [subject]
**Question:** [restate the question]
**Solution:**
[step by step]
**Answer:** [final answer]`;

/**
 * Build the generation config for a given solve mode and optional subject hint.
 * Deep mode enables extended thinking; search mode enables Google Search grounding.
 */
function buildConfig(mode: SolveMode, subject: string, detailed: boolean) {
  let prompt = SYSTEM_PROMPT;
  if (subject !== "Auto-detect") {
    prompt += `\n\nThe user has specified the subject is: ${subject}.`;
  }
  if (detailed) {
    prompt += `\n\nProvide an EXTREMELY detailed, step-by-step explanation. Break down every single concept thoroughly.`;
  }

  const config: Record<string, unknown> = { systemInstruction: prompt };

  if (mode === "deep") {
    config.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
  } else if (mode === "search") {
    config.tools = [{ googleSearch: {} }];
  }

  return config;
}

/** Solve a question from an uploaded image. */
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
      "Solve the question in this image.",
    ],
    config: buildConfig(mode, subject, detailed),
  });
  return response.text ?? "";
}

/** Solve a question from pasted/typed text. */
export async function solveTextQuestion(
  text: string,
  mode: SolveMode,
  subject = "Auto-detect",
  detailed = false,
): Promise<string> {
  const response = await ai.models.generateContent({
    model: MODEL_BY_MODE[mode],
    contents: [text, "Solve the question in this text."],
    config: buildConfig(mode, subject, detailed),
  });
  return response.text ?? "";
}

/** Generate an AI-created diagram/visual explanation for a solved problem. */
export async function generateVisualExplanation(
  prompt: string,
): Promise<string | null> {
  const response = await ai.models.generateContent({
    model: "gemini-3-pro-image-preview",
    contents: [{ text: prompt }],
    config: { imageConfig: { aspectRatio: "1:1", imageSize: "1K" } },
  });

  for (const part of response.candidates?.[0]?.content?.parts ?? []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  return null;
}

/** Send a follow-up message to the AI tutor, passing the full chat history. */
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

  // Gemini requires strictly alternating user/model turns.
  for (let i = 0; i < contents.length; i++) {
    const expected = i % 2 === 0 ? "user" : "model";
    if (contents[i].role !== expected) {
      throw new Error(
        `Invalid chat history: turn ${i} must be '${expected}', got '${contents[i].role}'.`,
      );
    }
  }

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents,
    config: {
      systemInstruction:
        "You are a helpful tutor answering follow-up questions about a solved problem. Keep your answers concise and helpful.",
    },
  });
  return response.text ?? "";
}

/**
 * Grade student work by first analysing the image for correctness,
 * then generating a visually-annotated version with corrections.
 */
export async function gradeWork(
  base64Image: string,
  inkColor: string,
  handwritingBase64?: string | null,
): Promise<GradeResult> {
  // Step 1 — deep analysis with thinking + search for maximum accuracy
  const analysisResponse = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: [
      { inlineData: { mimeType: "image/jpeg", data: base64Image } },
      "You are an expert grader. Review the student's work in this image. Check all calculations with supreme accuracy. Identify any mistakes. Provide a step-by-step correct solution. Use $ for inline math and $$ for block math.",
    ],
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
      tools: [{ googleSearch: {} }],
    },
  });
  const analysisText = analysisResponse.text ?? "";

  // Step 2 — generate a visually-marked-up copy of the student's work
  let editedImageBase64: string | null = null;
  try {
    const parts: Record<string, unknown>[] = [
      { inlineData: { mimeType: "image/jpeg", data: base64Image } },
    ];

    let prompt = `Act as a teacher grading this work. Add visual corrections, checkmarks, and write the correct answers where mistakes were made. Use ${inkColor} ink. Make it look like handwritten grading. Based on this analysis: ${analysisText.substring(0, 800)}`;

    if (handwritingBase64) {
      parts.push({
        inlineData: { mimeType: "image/jpeg", data: handwritingBase64 },
      });
      prompt +=
        "\n\nCRITICAL: Match the handwriting style shown in the SECOND image exactly when writing your corrections.";
    }

    parts.push({ text: prompt });

    const editResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: { parts },
    });

    for (const part of editResponse.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData) {
        editedImageBase64 = `data:image/jpeg;base64,${part.inlineData.data}`;
        break;
      }
    }
  } catch (e) {
    console.error("Image edit failed", e);
  }

  return { text: analysisText, image: editedImageBase64 };
}
