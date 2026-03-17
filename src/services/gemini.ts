import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import type { SolveMode, GradeResult } from "../types";

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

RESPONSE FORMAT:
**Subject:** [subject/domain]
**Question:** [restate the question precisely]
**Solution:**
[rigorous step-by-step solution with explanations]
**Answer:** [final answer, clearly stated]

If the image contains multiple questions, solve ALL of them.
If it is a research question, provide a thorough, well-structured analysis with key concepts defined.`;

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

export async function gradeWork(
  base64Image: string,
  inkColor: string,
  handwritingBase64?: string | null,
): Promise<GradeResult> {
  const analysisResponse = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: [
      { inlineData: { mimeType: "image/jpeg", data: base64Image } },
      "You are an expert grader. Review the student's work with supreme accuracy. Check all calculations meticulously. Identify any mistakes. Provide a step-by-step correct solution. Use $ for inline math and $$ for block math.",
    ],
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
      tools: [{ googleSearch: {} }],
    },
  });
  const analysisText = analysisResponse.text ?? "";

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
