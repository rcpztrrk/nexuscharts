import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { access, readFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const packageJsonUrl = new URL("../package.json", import.meta.url);

const expectedRuntimeExports = [
  "NexusCharts",
  "createDataAdapter",
  "createCsvDataAdapter",
  "createPollingDataAdapter",
  "createWebSocketDataAdapter",
  "connectSeriesDataAdapter",
  "loadSeriesData",
  "parseCsvCandles",
];

async function readPackageJson(): Promise<any> {
  return JSON.parse(await readFile(packageJsonUrl, "utf8"));
}

function collectExportTargets(value: unknown, targets: Set<string> = new Set()): Set<string> {
  if (typeof value === "string") {
    targets.add(value);
    return targets;
  }

  if (value && typeof value === "object") {
    for (const child of Object.values(value)) {
      collectExportTargets(child, targets);
    }
  }

  return targets;
}

test("package export map points to existing files", async () => {
  const packageJson = await readPackageJson();
  const targets = collectExportTargets(packageJson.exports);

  targets.add(packageJson.main);
  targets.add(packageJson.module);
  targets.add(packageJson.types);

  for (const target of targets) {
    assert.equal(typeof target, "string");
    await access(new URL(`../${target.replace(/^\.\//, "")}`, import.meta.url));
  }
});

test("package ESM build exposes stable runtime exports", async () => {
  const esm = await import(new URL("../build/nexus-charts.esm.js", import.meta.url).href);

  for (const symbol of expectedRuntimeExports) {
    assert.equal(typeof esm[symbol], "function", `Expected ESM export ${symbol}`);
  }
});

test("package CJS build exposes stable runtime exports", () => {
  const cjs = require("../build/nexus-charts.cjs");

  for (const symbol of expectedRuntimeExports) {
    assert.equal(typeof cjs[symbol], "function", `Expected CJS export ${symbol}`);
  }
});
