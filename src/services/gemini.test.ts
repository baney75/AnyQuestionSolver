import { describe, expect, test } from "bun:test";

import {
  buildRequestPlan,
  extractReliableSources,
  getSourceIntent,
  stripTrailingSourcesSection,
} from "./gemini";

describe("gemini routing", () => {
  test("auto-enables grounding for citation-sensitive prompts", () => {
    const plan = buildRequestPlan("fast", "Cite current sources about influenza guidelines.", false);

    expect(plan.useGrounding).toBe(true);
  });

  test("auto-enables pro routing for complex walkthroughs", () => {
    const plan = buildRequestPlan("fast", "Prove the spectral theorem and explain each step rigorously.", false);

    expect(plan.modelCandidates.includes("gemini-2.5-pro")).toBe(true);
  });

  test("strips trailing raw sources sections from model text", () => {
    const cleaned = stripTrailingSourcesSection("Body text\n\nSources:\n1. https://example.edu\n2. https://nih.gov");

    expect(cleaned).toBe("Body text");
  });
});

describe("grounded source extraction", () => {
  test("detects scholarly and news intent separately", () => {
    expect(getSourceIntent("Find peer-reviewed journal sources on CRISPR.")).toBe("scholarly");
    expect(getSourceIntent("What is the latest news on the ceasefire talks?")).toBe("news");
  });

  test("prefers academically credible sources and removes low-trust hosts", () => {
    const sources = extractReliableSources({
      groundingChunks: [
        { web: { uri: "https://brainly.com/question/1", title: "Brainly thread" } },
        { web: { uri: "https://ocw.mit.edu/example", title: "MIT OpenCourseWare" } },
        { web: { uri: "https://www.nih.gov/example", title: "NIH Guidance" } },
      ],
    }, "Use scholarly sources for this biology question.");

    expect(sources.length).toBe(2);
    expect(sources[0]?.category).toBe("University");
    expect(sources[1]?.category).toBe("Government / Official");
  });

  test("prefers high-trust newsrooms for news prompts", () => {
    const sources = extractReliableSources({
      groundingChunks: [
        { web: { uri: "https://www.reuters.com/world/example", title: "Reuters dispatch" } },
        { web: { uri: "https://www.example.com/opinion", title: "Opinion blog" } },
        { web: { uri: "https://apnews.com/article/example", title: "AP report" } },
      ],
    }, "Give me the latest news sources on this event.");

    expect(sources.length).toBe(2);
    expect(sources[0]?.host.includes("reuters.com") || sources[1]?.host.includes("reuters.com")).toBe(true);
    expect(sources[0]?.host.includes("apnews.com") || sources[1]?.host.includes("apnews.com")).toBe(true);
  });

  test("uses title-derived hosts when grounding URIs are Google proxy links", () => {
    const sources = extractReliableSources({
      groundingChunks: [
        {
          web: {
            uri: "https://vertexaisearch.cloud.google.com/result/123",
            title: "parliament.uk",
          },
        },
      ],
    }, "Use official sources for this history question.");

    expect(sources.length).toBe(1);
    expect(sources[0]?.host).toBe("parliament.uk");
    expect(sources[0]?.category).toBe("Government / Official");
  });

  test("drops tertiary and advocacy sources when better options are available", () => {
    const sources = extractReliableSources({
      groundingChunks: [
        { web: { uri: "https://vertexaisearch.cloud.google.com/result/1", title: "wikipedia.org" } },
        { web: { uri: "https://vertexaisearch.cloud.google.com/result/2", title: "amnesty.org" } },
        { web: { uri: "https://www.reuters.com/world/example", title: "Reuters report" } },
      ],
    }, "Give me the latest news sources on this event.");

    expect(sources.length).toBe(1);
    expect(sources[0]?.host).toBe("reuters.com");
  });
});
