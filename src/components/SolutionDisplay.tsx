import React, { useEffect, useRef, useState, useMemo } from "react";
import Markdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import SmilesDrawer from "smiles-drawer";
import "katex/dist/katex.min.css";

import { CodeBlock } from "./CodeBlock";
import { ChartBlock } from "./ChartBlock";
import { ImageRenderer } from "./ImageRenderer";
import { searchImages } from "../services/search";

interface SolutionDisplayProps {
  solution: string;
}

/** Renders SMILES molecular structure notation on a canvas. */
const SmilesRenderer = ({ smiles }: { smiles: string }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let active = true;

    if (canvasRef.current && smiles) {
      (async () => {
        try {
          const drawer = new SmilesDrawer();
          await drawer.draw(smiles.trim(), canvasRef.current!, "light");
          if (!active) return;
        } catch (err) {
          if (active) console.error("SMILES render failed:", err);
        }
      })();
    }

    return () => {
      active = false;
    };
  }, [smiles]);

  return (
    <div className="flex justify-center my-4 bg-white p-4 rounded-xl border-2 border-gray-200 dark:border-gray-700 neo-shadow-sm overflow-x-auto">
      <canvas ref={canvasRef} />
    </div>
  );
};

/** Definition card component */
const DefinitionCard = ({ content }: { content: string }) => {
  // Parse definition content
  const lines = content.trim().split('\n');
  const wordLine = lines.find(l => l.startsWith('**') && l.includes('/')) || lines[0] || '';
  const wordMatch = wordLine.match(/\*\*(.+?)\*\*/);
  const phoneticMatch = wordLine.match(/\/(.+?)\//);
  
  const word = wordMatch?.[1] || 'Unknown';
  const phonetic = phoneticMatch?.[1] || '';
  
  const partsOfSpeech: { type: string; definitions: { def: string; example?: string }[] }[] = [];
  let currentPart: { type: string; definitions: { def: string; example?: string }[] } | null = null;
  
  for (const line of lines.slice(1)) {
    if (line.startsWith('*') && line.endsWith('*')) {
      if (currentPart) partsOfSpeech.push(currentPart);
      currentPart = { type: line.slice(1, -1), definitions: [] };
    } else if (line.match(/^\d+\./) && currentPart) {
      const defMatch = line.match(/^\d+\.\s*(.+)/);
      if (defMatch) currentPart.definitions.push({ def: defMatch[1] });
    } else if (line.trim().startsWith('- Example:') && currentPart?.definitions.length) {
      const exMatch = line.match(/- Example:\s*["'](.+?)["']/);
      if (exMatch) currentPart.definitions[currentPart.definitions.length - 1].example = exMatch[1];
    }
  }
  if (currentPart) partsOfSpeech.push(currentPart);

  const synonymsMatch = content.match(/Synonyms:\s*(.+)/i);
  const synonyms = synonymsMatch?.[1]?.split(',').map(s => s.trim()) || [];

  return (
    <div className="my-6 bg-amber-50 dark:bg-amber-900/20 rounded-xl border-2 border-amber-400 dark:border-amber-600 p-6">
      <div className="flex items-baseline gap-3 mb-4">
        <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{word}</h3>
        {phonetic && <span className="text-lg font-mono text-gray-600 dark:text-gray-400">/{phonetic}/</span>}
      </div>
      
      {partsOfSpeech.map((part, i) => (
        <div key={`${part.type}-${i}`} className="mb-4">
          <span className="inline-block text-xs font-bold font-mono uppercase px-2 py-1 rounded bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 mb-2">
            {part.type}
          </span>
          <ol className="list-decimal list-inside space-y-2 ml-2">
            {part.definitions.map((d, j) => (
              <li key={`${part.type}-def-${j}-${d.def.slice(0, 20)}`} className="text-gray-900 dark:text-gray-100">
                <span className="font-medium">{d.def}</span>
                {d.example && (
                  <p className="ml-6 mt-1 text-sm italic text-gray-600 dark:text-gray-400">
                    &ldquo;{d.example}&rdquo;
                  </p>
                )}
              </li>
            ))}
          </ol>
        </div>
      ))}
      
      {synonyms.length > 0 && (
        <p className="text-sm text-gray-700 dark:text-gray-300">
          <span className="font-semibold">Synonyms:</span> {synonyms.join(', ')}
        </p>
      )}
    </div>
  );
};

/** Image search result component */
const ImageSearchResult = ({ query }: { query: string }) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);

    searchImages(query, 3)
      .then(results => {
        if (!active) return;
        if (results.items.length > 0) {
          // Pick the first good image
          const item = results.items[0];
          setImageUrl(item.image?.url || item.link);
        }
      })
      .catch(err => {
        if (active) {
          console.error('Image search failed:', err);
          setError(true);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [query]);

  if (loading) {
    return (
      <div className="my-4 flex items-center justify-center p-8 bg-gray-100 dark:bg-gray-800 rounded-xl">
        <div className="text-gray-500 dark:text-gray-400">Loading image...</div>
      </div>
    );
  }

  if (error || !imageUrl) {
    return null;
  }

  return (
    <ImageRenderer
      src={imageUrl}
      alt={query}
    />
  );
};

/** Process solution for markers */
function processSolution(solution: string): { processed: string; elements: Array<{ type: 'image' | 'definition'; id: string; content: string }> } {
  const elements: Array<{ type: 'image' | 'definition'; id: string; content: string }> = [];
  let processed = solution;
  let idCounter = 0;

  // Process IMAGE_SEARCH markers
  processed = processed.replace(/\[IMAGE_SEARCH:\s*"([^"]+)"\]/g, (_, query) => {
    const id = `img-${idCounter++}`;
    elements.push({ type: 'image', id, content: query });
    return `\n\n__IMAGE_MARKER_${id}__\n\n`;
  });

  // Process DEFINITION markers
  processed = processed.replace(/\[DEFINITION\]([\s\S]*?)\[END_DEFINITION\]/g, (_, content) => {
    const id = `def-${idCounter++}`;
    elements.push({ type: 'definition', id, content: content.trim() });
    return `\n\n__DEFINITION_MARKER_${id}__\n\n`;
  });

  return { processed, elements };
}

export function SolutionDisplay({ solution }: SolutionDisplayProps) {
  const { processed, elements } = useMemo(() => processSolution(solution), [solution]);

  // Split content by markers
  const parts = useMemo(() => {
    const result: Array<{ type: 'markdown' | 'image' | 'definition'; content: string; id?: string }> = [];
    const markerRegex = /__(IMAGE_MARKER_|DEFINITION_MARKER_)([^_]+)__/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    match = markerRegex.exec(processed);
    while (match !== null) {
      // Add markdown before marker
      if (match.index > lastIndex) {
        result.push({ type: 'markdown', content: processed.slice(lastIndex, match.index) });
      }
      
      // Add element
      const id = match[2];
      const element = elements.find(e => e.id === id);
      if (element) {
        result.push({ type: element.type, content: element.content, id });
      }
      
      lastIndex = markerRegex.lastIndex;
      match = markerRegex.exec(processed);
    }

    // Add remaining markdown
    if (lastIndex < processed.length) {
      result.push({ type: 'markdown', content: processed.slice(lastIndex) });
    }

    return result;
  }, [processed, elements]);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-900 dark:border-gray-100 neo-shadow p-6 md:p-8">
      {parts.map((part, index) => {
        if (part.type === 'image') {
          return <ImageSearchResult key={part.id || `img-${index}`} query={part.content} />;
        }
        if (part.type === 'definition') {
          return <DefinitionCard key={part.id || `def-${index}`} content={part.content} />;
        }
        return (
          <div key={`md-${part.content.slice(0, 30)}`} className="prose prose-lg prose-gray dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-gray-50 dark:prose-pre:bg-gray-800 prose-pre:text-gray-900 dark:prose-pre:text-gray-100 prose-pre:border-2 prose-pre:border-gray-900 dark:prose-pre:border-gray-100 prose-pre:rounded-xl prose-pre:neo-shadow-sm prose-headings:font-sans prose-headings:font-bold prose-headings:tracking-tight prose-a:text-indigo-600 dark:prose-a:text-indigo-400 prose-table:border-2 prose-table:border-gray-900 dark:prose-table:border-gray-100 prose-th:border-b-2 prose-th:border-gray-900 dark:prose-th:border-gray-100 prose-td:border-b prose-td:border-gray-200 dark:prose-td:border-gray-700">
            <Markdown
              remarkPlugins={[remarkMath, remarkGfm]}
              rehypePlugins={[rehypeKatex]}
              components={{
                code(props) {
                  const { children, className, node, ...rest } = props;
                  const match = /language-(\w+)/.exec(className || "");
                  const lang = match ? match[1] : "";
                  const content = String(children).replace(/\n$/, "");

                  if (lang === "smiles") {
                    return <SmilesRenderer smiles={content} />;
                  }

                  if (lang === "chart") {
                    return <ChartBlock json={content} />;
                  }

                  if (lang) {
                    return <CodeBlock code={content} language={lang} />;
                  }

                  return (
                    <code {...rest} className={className}>
                      {children}
                    </code>
                  );
                },
                pre({ children }) {
                  return <>{children}</>;
                },
              }}
            >
              {part.content}
            </Markdown>
          </div>
        );
      })}
    </div>
  );
}