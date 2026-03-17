import React, { useEffect, useRef } from "react";
import Markdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import SmilesDrawer from "smiles-drawer";
import "katex/dist/katex.min.css";

import { CodeBlock } from "./CodeBlock";
import { ChartBlock } from "./ChartBlock";

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

export function SolutionDisplay({ solution }: SolutionDisplayProps) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-900 dark:border-gray-100 neo-shadow p-6 md:p-8">
      <div className="prose prose-lg prose-gray dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-gray-50 dark:prose-pre:bg-gray-800 prose-pre:text-gray-900 dark:prose-pre:text-gray-100 prose-pre:border-2 prose-pre:border-gray-900 dark:prose-pre:border-gray-100 prose-pre:rounded-xl prose-pre:neo-shadow-sm prose-headings:font-sans prose-headings:font-bold prose-headings:tracking-tight prose-a:text-indigo-600 dark:prose-a:text-indigo-400 prose-table:border-2 prose-table:border-gray-900 dark:prose-table:border-gray-100 prose-th:border-b-2 prose-th:border-gray-900 dark:prose-th:border-gray-100 prose-td:border-b prose-td:border-gray-200 dark:prose-td:border-gray-700">
        <Markdown
          remarkPlugins={[remarkMath, remarkGfm]}
          rehypePlugins={[rehypeKatex]}
          components={{
            // Route fenced code blocks to the appropriate renderer
            code(props) {
              const { children, className, node, ...rest } = props;
              const match = /language-(\w+)/.exec(className || "");
              const lang = match ? match[1] : "";
              const content = String(children).replace(/\n$/, "");

              // SMILES molecular structures
              if (lang === "smiles") {
                return <SmilesRenderer smiles={content} />;
              }

              // Chart / data visualization
              if (lang === "chart") {
                return <ChartBlock json={content} />;
              }

              // Python, JS, or any other code — show interactive block
              if (lang) {
                return <CodeBlock code={content} language={lang} />;
              }

              // Inline code
              return (
                <code {...rest} className={className}>
                  {children}
                </code>
              );
            },

            // Render code blocks outside of <pre> so our custom components
            // can handle their own container styling
            pre({ children }) {
              return <>{children}</>;
            },
          }}
        >
          {solution}
        </Markdown>
      </div>
    </div>
  );
}
