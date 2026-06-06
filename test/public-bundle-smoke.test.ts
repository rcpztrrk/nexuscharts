import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const readProjectFile = (path: string): Promise<string> => (
  readFile(new URL(`../${path}`, import.meta.url), "utf8")
);

test("demo html references the built public bundle and WASM assets", async () => {
  const html = await readProjectFile("public/index.html");

  assert.ok(html.includes('<canvas id="canvas"'));
  assert.ok(html.includes('from "./nexus-charts.esm.js"'));
  assert.ok(html.includes('wasmScriptPath: "wasm/nexuscharts.js"'));
  assert.ok(html.includes('wasmBinaryPath: "wasm/nexuscharts.wasm"'));
  assert.ok(html.includes("window.nexusChart = chart;"));
});

test("built public ESM bundle exposes demo import symbols", async () => {
  const bundle = await readProjectFile("public/nexus-charts.esm.js");
  const exportLine = bundle.match(/export\s*{[^}]+};/s)?.[0] ?? "";

  for (const symbol of [
    "NexusCharts",
    "createDataAdapter",
    "createCsvDataAdapter",
    "createWebSocketDataAdapter",
    "connectSeriesDataAdapter",
    "parseCsvCandles",
  ]) {
    assert.ok(exportLine.includes(symbol), `Expected public bundle export for ${symbol}`);
  }
});

test("demo WASM runtime assets are present", async () => {
  await access(new URL("../public/wasm/nexuscharts.js", import.meta.url));
  await access(new URL("../public/wasm/nexuscharts.wasm", import.meta.url));
});
