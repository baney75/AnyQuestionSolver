/**
 * Lazy-loads Pyodide (Python compiled to WebAssembly) from CDN and provides
 * a simple runPython() helper. The ~10 MB runtime is only fetched when the
 * user clicks "Run" on a Python code block for the first time.
 */

const CDN = "https://cdn.jsdelivr.net/pyodide/v0.27.5/full/pyodide.js";

let pyodidePromise: Promise<unknown> | null = null;

function ensureLoaded(): Promise<unknown> {
  if (pyodidePromise) return pyodidePromise;

  pyodidePromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = CDN;
    script.onload = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const py = await (window as any).loadPyodide();
        resolve(py);
      } catch (e) {
        reject(e);
      }
    };
    script.onerror = () => reject(new Error("Failed to load Pyodide from CDN."));
    document.head.appendChild(script);
  });

  return pyodidePromise;
}

export async function runPython(code: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const py = (await ensureLoaded()) as any;

  // Redirect stdout so we can capture print() output.
  py.runPython(`
import sys, io
sys.stdout = io.StringIO()
sys.stderr = io.StringIO()
`);

  try {
    const result = py.runPython(code);
    const stdout: string = py.runPython("sys.stdout.getvalue()");
    const stderr: string = py.runPython("sys.stderr.getvalue()");
    const parts: string[] = [];
    if (stdout) parts.push(stdout);
    if (result !== undefined && result !== null && String(result) !== "None") {
      parts.push(String(result));
    }
    if (stderr) parts.push(`stderr: ${stderr}`);
    return parts.join("\n") || "(no output)";
  } catch (e) {
    return `Error: ${e instanceof Error ? e.message : String(e)}`;
  }
}
