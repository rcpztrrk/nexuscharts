import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const readPublicType = (fileName: string): Promise<string> => (
  readFile(new URL(`../build/public-types/${fileName}`, import.meta.url), "utf8")
);

const assertIncludes = (source: string, expected: string): void => {
  assert.equal(
    source.includes(expected),
    true,
    `Expected public declarations to include: ${expected}`
  );
};

test("public NexusCharts declaration exposes the stable chart API", async () => {
  const chartTypes = await readPublicType("NexusCharts.d.ts");
  const expectedMethods = [
    "constructor(options: InitOptions);",
    "waitUntilReady(): Promise<void>;",
    "createSeries(options?: SeriesOptions): SeriesApi;",
    "addPriceLine(options: PriceLineOptions): string;",
    "setAnnotations(annotations: ChartAnnotationsInput): ChartAnnotationsApplyResult;",
    "addAlert(options: ChartAlertOptions): string;",
    "applyTheme(themeInput: ThemeInput): void;",
    "configureUi(options: UiOptions): void;",
    "getPerfMetrics(window?: number): PerfMetrics;",
    "subscribe<K extends ChartEventName>(eventName: K, handler: ChartEventHandler<K>): () => void;",
    "subscribeAlertTriggered(handler: ChartEventHandler<\"alertTriggered\">): () => void;",
    "copyImageToClipboard(options?: ChartImageExportOptions): Promise<boolean>;",
  ];

  for (const method of expectedMethods) {
    assertIncludes(chartTypes, method);
  }
  assert.equal(chartTypes.includes("private "), false);
});

test("public package declaration exposes DataAdapter helper exports", async () => {
  const indexTypes = await readPublicType("index.d.ts");
  const expectedExports = [
    "createDataAdapter,",
    "createCsvDataAdapter,",
    "createPollingDataAdapter,",
    "createWebSocketDataAdapter,",
    "connectSeriesDataAdapter,",
    "loadSeriesData,",
    "parseCsvCandles,",
    "type SeriesDataAdapterConnection,",
  ];

  for (const exportName of expectedExports) {
    assertIncludes(indexTypes, exportName);
  }
});

test("public type declarations expose supported indicator types", async () => {
  const publicTypes = await readPublicType("types.d.ts");

  assertIncludes(publicTypes, 'export type IndicatorType = "sma" | "ema" | "rsi" | "macd" | "atr" | "stochastic" | "bollinger" | "vwap";');
  assertIncludes(publicTypes, "atr: string;");
  assertIncludes(publicTypes, "stochastic: string;");
  assertIncludes(publicTypes, "bollinger: string;");
  assertIncludes(publicTypes, "vwap: string;");
  assertIncludes(publicTypes, "upperValues?: Array<number | null>;");
  assertIncludes(publicTypes, "lowerValues?: Array<number | null>;");
});
