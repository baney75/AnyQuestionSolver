import React, { useEffect, useRef } from 'react';
import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import SmilesDrawer from 'smiles-drawer';
import 'katex/dist/katex.min.css';

interface SolutionDisplayProps {
  solution: string;
}

const SmilesRenderer = ({ smiles }: { smiles: string }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current && smiles) {
      try {
        const drawer = new SmilesDrawer();
        drawer.draw(smiles.trim(), canvasRef.current, 'light');
      } catch (error) {
        console.error("Failed to render SMILES:", error);
      }
    }
  }, [smiles]);

  return (
    <div className="flex justify-center my-4 bg-white p-4 rounded-xl border-2 border-gray-200 neo-shadow-sm overflow-x-auto">
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
            code(props) {
              const { children, className, node, ...rest } = props;
              const match = /language-(w+)/.exec(className || '');
              const language = match ? match[1] : '';
              
              if (language === 'smiles') {
                return <SmilesRenderer smiles={String(children).replace(/\n$/, '')} />;
              }
              
              return (
                <code {...rest} className={className}>
                  {children}
                </code>
              );
            }
          }}
        >
          {solution}
        </Markdown>
      </div>
    </div>
  );
}