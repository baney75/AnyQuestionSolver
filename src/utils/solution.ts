import type { SolutionSource } from "../types";

const SOURCES_BLOCK_REGEX = /```aqs-sources\s*([\s\S]*?)```/g;

function normalizeSolutionSpacing(value: string) {
  return value.replace(/\n{3,}/g, "\n\n").trim();
}

export function stripRenderMarkers(value: string) {
  return normalizeSolutionSpacing(
    value
      .replace(/\[IMAGE_SEARCH:[^\]]*\]/g, "")
      .replace(/\[VIDEO_SEARCH:[^\]]*\]/g, "")
      .replace(/\[WEB_SEARCH:[^\]]*\]/g, "")
      .replace(/\[DEFINITION\]([\s\S]*?)\[END_DEFINITION\]/g, "$1"),
  );
}

export function extractEmbeddedSources(solution: string): {
  body: string;
  sources: SolutionSource[];
} {
  const collected: SolutionSource[] = [];

  const body = solution.replace(SOURCES_BLOCK_REGEX, (_, json: string) => {
    try {
      const parsed = JSON.parse(json.trim());
      if (Array.isArray(parsed)) {
        for (const source of parsed) {
          if (
            source &&
            typeof source.index === "number" &&
            typeof source.title === "string" &&
            typeof source.url === "string" &&
            typeof source.host === "string" &&
            typeof source.category === "string"
          ) {
            collected.push(source as SolutionSource);
          }
        }
      }
    } catch {
      /* ignore malformed embedded source blocks */
    }

    return "";
  });

  return {
    body: normalizeSolutionSpacing(body),
    sources: collected,
  };
}

export function stripSolutionClientArtifacts(solution: string) {
  return stripRenderMarkers(extractEmbeddedSources(solution).body);
}

export function embedSourcesInSolution(solution: string, sources: SolutionSource[]) {
  if (!sources.length) {
    return normalizeSolutionSpacing(solution);
  }

  return `${normalizeSolutionSpacing(solution)}\n\n\`\`\`aqs-sources\n${JSON.stringify(
    sources,
    null,
    2,
  )}\n\`\`\``;
}

export function getCopyableSolution(solution: string) {
  const { body, sources } = extractEmbeddedSources(solution);
  const copyableBody = stripRenderMarkers(body);
  if (!sources.length) {
    return copyableBody;
  }

  const sourceLines = sources.map(
    (source) => `${source.index}. ${source.title} (${source.category})\n   ${source.url}`,
  );

  return `${copyableBody}\n\nSources:\n${sourceLines.join("\n")}`;
}
