import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

/**
 * Expected JSON format inside ```chart code blocks:
 * {
 *   "type": "line" | "bar",
 *   "title": "...",
 *   "xLabel": "...",
 *   "yLabel": "...",
 *   "data": [{ "x": 0, "y": 10 }, ...]
 * }
 */
interface ChartData {
  type: "line" | "bar";
  title?: string;
  xLabel?: string;
  yLabel?: string;
  data: Record<string, number | string>[];
}

interface ChartBlockProps {
  json: string;
}

export function ChartBlock({ json }: ChartBlockProps) {
  let chart: ChartData;
  try {
    chart = JSON.parse(json);
  } catch {
    return (
      <div className="p-4 my-4 rounded-xl border-2 border-red-400 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 text-sm font-mono">
        Invalid chart data
      </div>
    );
  }

  const isBar = chart.type === "bar";

  return (
    <div className="my-6 p-4 bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-900 dark:border-gray-100 neo-shadow-sm">
      {chart.title && (
        <h4 className="text-center font-bold text-lg mb-4 text-gray-900 dark:text-gray-100">
          {chart.title}
        </h4>
      )}
      <ResponsiveContainer width="100%" height={300}>
        {isBar ? (
          <BarChart data={chart.data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="x"
              label={chart.xLabel ? { value: chart.xLabel, position: "insideBottom", offset: -5 } : undefined}
            />
            <YAxis
              label={chart.yLabel ? { value: chart.yLabel, angle: -90, position: "insideLeft" } : undefined}
            />
            <Tooltip />
            <Legend />
            <Bar dataKey="y" fill="#6366f1" radius={[4, 4, 0, 0]} />
          </BarChart>
        ) : (
          <LineChart data={chart.data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="x"
              label={chart.xLabel ? { value: chart.xLabel, position: "insideBottom", offset: -5 } : undefined}
            />
            <YAxis
              label={chart.yLabel ? { value: chart.yLabel, angle: -90, position: "insideLeft" } : undefined}
            />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="y" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
