import { Image as ImageIcon } from "lucide-react";

interface VisualExplanationProps {
  url: string;
}

export function VisualExplanation({ url }: VisualExplanationProps) {
  return (
    <div className="bg-white dark:bg-gray-900 p-6 rounded-xl border-2 border-gray-900 dark:border-gray-100 neo-shadow">
      <h3 className="font-bold font-sans text-xl text-gray-900 dark:text-gray-100 mb-6 flex items-center gap-2">
        <ImageIcon className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
        Visual Corrections / Explanation
      </h3>
      <img
        src={url}
        alt="Visual Explanation"
        className="w-full rounded-lg border-2 border-gray-900 dark:border-gray-100 neo-shadow-sm"
      />
    </div>
  );
}
