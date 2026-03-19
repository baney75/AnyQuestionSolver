import { RichResponse } from "./RichResponse";

interface SolutionDisplayProps {
  solution: string;
}

export function SolutionDisplay({ solution }: SolutionDisplayProps) {
  return (
    <div className="rounded-xl border-2 border-gray-900 bg-white p-6 neo-shadow dark:border-gray-100 dark:bg-gray-900 md:p-8">
      <RichResponse text={solution} />
    </div>
  );
}
