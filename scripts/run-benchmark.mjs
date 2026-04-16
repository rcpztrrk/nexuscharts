import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { platform } from "node:os";

import { chromium } from "playwright-core";

const projectRoot = process.cwd();
const publicRoot = resolve(projectRoot, "public");

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".wasm", "application/wasm"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".ico", "image/x-icon"],
]);

function parseArgs(argv) {
  const options = {
    port: 4173,
    timeoutMs: 600000,
    size: null,
    sweep: true,
    browserPath: process.env.NEXUS_BENCHMARK_BROWSER ?? null,
  };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--sweep") {
      options.sweep = true;
      options.size = null;
      continue;
    }
    if (arg.startsWith("--size=")) {
      options.size = Number(arg.slice("--size=".length));
      options.sweep = false;
      continue;
    }
    if (arg.startsWith("--port=")) {
      options.port = Number(arg.slice("--port=".length));
      continue;
    }
    if (arg.startsWith("--timeout=")) {
      options.timeoutMs = Number(arg.slice("--timeout=".length));
      continue;
    }
    if (arg.startsWith("--browser=")) {
      options.browserPath = arg.slice("--browser=".length);
    }
  }

  return options;
}

function printHelp() {
  console.log(
    [
      "Usage: node scripts/run-benchmark.mjs [--sweep] [--size=100000] [--port=4173] [--timeout=600000]",
      "",
      "Options:",
      "  --sweep          Run the full 100K / 250K / 500K / 1M benchmark sweep (default).",
      "  --size=<number>  Run a single benchmark sample for the given dataset size.",
      "  --port=<number>  Port for the temporary local static server.",
      "  --timeout=<ms>   Total wait timeout for the benchmark run.",
      "  --browser=<path> Explicit browser executable path.",
      "",
      "Env:",
      "  NEXUS_BENCHMARK_BROWSER  Override browser executable path.",
    ].join("\n")
  );
}

function detectBrowserPath() {
  if (platform() === "win32") {
    const candidates = [
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    ];
    return candidates.find((candidate) => existsSync(candidate)) ?? null;
  }

  if (platform() === "darwin") {
    const candidate = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    return existsSync(candidate) ? candidate : null;
  }

  const candidate = "/usr/bin/google-chrome";
  return existsSync(candidate) ? candidate : null;
}

async function serveStatic(req, res) {
  const reqUrl = new URL(req.url ?? "/", "http://127.0.0.1");
  const requestedPath = reqUrl.pathname === "/" ? "/index.html" : reqUrl.pathname;
  const localPath = normalize(join(publicRoot, requestedPath));

  if (!localPath.startsWith(publicRoot)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const file = await readFile(localPath);
    const contentType = mimeTypes.get(extname(localPath)) ?? "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType, "Cache-Control": "no-store" });
    res.end(file);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

function startServer(port) {
  const server = createServer((req, res) => {
    void serveStatic(req, res);
  });

  return new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(port, "127.0.0.1", () => resolvePromise(server));
  });
}

function parseBenchmarkReport(report) {
  const lines = report
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /\| mode: /.test(line));

  return lines.map((line) => {
    const match = line.match(
      /^([\d.,]+) \| mode: ([^|]+) \| redraw avg\/max\/last: ([\d.]+) \/ ([\d.]+) \/ ([\d.]+) ms \| samples: (\d+) \| heap: (.+)$/
    );
    if (!match) {
      return { raw: line };
    }
    return {
      size: Number(match[1].replace(/[.,]/g, "")),
      mode: match[2].trim(),
      avgRedrawMs: Number(match[3]),
      maxRedrawMs: Number(match[4]),
      lastRedrawMs: Number(match[5]),
      samples: Number(match[6]),
      heap: match[7].trim(),
    };
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const browserPath = options.browserPath ?? detectBrowserPath();
  if (!browserPath) {
    throw new Error("Browser executable could not be detected. Set NEXUS_BENCHMARK_BROWSER or use --browser=<path>.");
  }

  const server = await startServer(options.port);
  const targetUrl = options.sweep
    ? `http://127.0.0.1:${options.port}/?autorunBenchmark=1`
    : `http://127.0.0.1:${options.port}/?autorunBenchmark=1&benchmarkSize=${options.size}`;

  let browser;
  try {
    browser = await chromium.launch({
      executablePath: browserPath,
      headless: true,
      args: ["--disable-gpu", "--no-sandbox", "--disable-breakpad", "--disable-crash-reporter"],
    });

    const page = await browser.newPage();
    await page.goto(targetUrl, { waitUntil: "load" });
    await page.waitForFunction(
      () => {
        const state = document.body?.dataset?.benchmarkDone;
        return state === "true" || state === "error";
      },
      undefined,
      { timeout: options.timeoutMs }
    );

    const result = await page.evaluate(() => ({
      report: String(window.__NEXUS_BENCHMARK_REPORT ?? document.getElementById("benchmark-report")?.textContent ?? ""),
      doneState: document.body?.dataset?.benchmarkDone ?? "",
    }));

    if (result.doneState !== "true") {
      throw new Error(result.report || "Benchmark run failed.");
    }

    const parsed = parseBenchmarkReport(result.report);
    console.log(result.report);
    console.log("");
    console.log(JSON.stringify(parsed, null, 2));
  } finally {
    await browser?.close().catch(() => undefined);
    await new Promise((resolvePromise) => server.close(() => resolvePromise()));
  }
}

main().catch((error) => {
  console.error(`[NexusCharts] Benchmark runner failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
