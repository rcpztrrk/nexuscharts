import test from "node:test";
import assert from "node:assert/strict";

import {
  parseArgs,
  parseBenchmarkReport,
} from "../scripts/run-benchmark.mjs";

test("benchmark runner defaults to the full sweep", () => {
  const options = parseArgs([]);

  assert.equal(options.port, 4173);
  assert.equal(options.timeoutMs, 600000);
  assert.equal(options.size, null);
  assert.equal(options.sweep, true);
});

test("benchmark runner smoke mode uses a fast single sample", () => {
  const options = parseArgs(["--smoke"]);

  assert.equal(options.sweep, false);
  assert.equal(options.size, 1000);
  assert.equal(options.timeoutMs, 120000);
});

test("benchmark runner parses explicit CLI overrides", () => {
  const options = parseArgs([
    "--size=250000",
    "--port=4999",
    "--timeout=45000",
    "--browser=C:\\Browsers\\msedge.exe",
  ]);

  assert.equal(options.sweep, false);
  assert.equal(options.size, 250000);
  assert.equal(options.port, 4999);
  assert.equal(options.timeoutMs, 45000);
  assert.equal(options.browserPath, "C:\\Browsers\\msedge.exe");
});

test("benchmark report parser extracts known benchmark lines", () => {
  const parsed = parseBenchmarkReport([
    "NexusCharts benchmark report",
    "100,000 | mode: webgl | redraw avg/max/last: 1.25 / 8.50 / 1.10 ms | samples: 42 | heap: 12.3 MB",
    "250.000 | mode: wasm | redraw avg/max/last: 2.00 / 9.75 / 1.95 ms | samples: 77 | heap: n/a",
  ].join("\n"));

  assert.deepEqual(parsed, [
    {
      size: 100000,
      mode: "webgl",
      avgRedrawMs: 1.25,
      maxRedrawMs: 8.5,
      lastRedrawMs: 1.1,
      samples: 42,
      heap: "12.3 MB",
    },
    {
      size: 250000,
      mode: "wasm",
      avgRedrawMs: 2,
      maxRedrawMs: 9.75,
      lastRedrawMs: 1.95,
      samples: 77,
      heap: "n/a",
    },
  ]);
});

test("benchmark report parser preserves malformed benchmark lines", () => {
  const parsed = parseBenchmarkReport("bad row | mode: webgl | redraw avg/max/last: nope");

  assert.deepEqual(parsed, [
    { raw: "bad row | mode: webgl | redraw avg/max/last: nope" },
  ]);
});
