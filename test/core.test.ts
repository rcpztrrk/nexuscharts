import test from "node:test";
import assert from "node:assert/strict";

import { SeriesManager } from "../ts-src/core/series/SeriesManager.ts";
import { IndicatorEngine } from "../ts-src/core/indicators/IndicatorEngine.ts";
import { createChartTheme, mergeChartTheme, cloneTheme } from "../ts-src/core/theme/ChartTheme.ts";
import { PerfTracker } from "../ts-src/core/perf/PerfTracker.ts";
import { NexusWasmBridge } from "../ts-src/core/wasm/NexusWasmBridge.ts";
import {
  connectSeriesDataAdapter,
  createCsvDataAdapter,
  createDataAdapter,
  createPollingDataAdapter,
  createWebSocketDataAdapter,
  loadSeriesData,
  parseCsvCandles,
} from "../ts-src/core/data/DataAdapter.ts";
import { ChartEventBus } from "../ts-src/core/events/ChartEventBus.ts";
import {
  subscribeChartEvent,
  subscribeChartEventOnce,
  unsubscribeChartEvent,
} from "../ts-src/core/events/ChartEventSubscriptions.ts";
import { PriceAnnotationManager, resolveMarkerSnapPrice } from "../ts-src/core/annotations/PriceAnnotationManager.ts";
import { calculateAnchoredZoomViewport, getVisibleCandleIndexRange } from "../ts-src/core/ui/ChartViewport.ts";

const baseTheme = createChartTheme();

const createSeriesHooks = (mutations: string[] = []) => ({
  createId: (() => {
    let i = 0;
    return () => `series_${++i}`;
  })(),
  isCompleteCandle: (point: any) => (
    point.time !== undefined && point.open !== undefined && point.high !== undefined && point.low !== undefined && point.close !== undefined
  ),
  onSeriesMutated: (id: string) => mutations.push(id),
});

test("SeriesManager creates series and updates last candle safely", () => {
  const manager = new SeriesManager();
  const mutations: string[] = [];

  const series = manager.createSeries({ type: "line" }, {
    createId: () => "series_1",
    isCompleteCandle: (point) => (
      point.time !== undefined && point.open !== undefined && point.high !== undefined && point.low !== undefined && point.close !== undefined
    ),
    onSeriesMutated: (id) => mutations.push(id),
  }, baseTheme);

  series.setData([{ time: 1, open: 10, high: 12, low: 9, close: 11 }]);
  series.updateLast({ close: 13 });

  const data = series.getData();
  assert.equal(data.length, 1);
  assert.equal(data[0].close, 13);
  assert.deepEqual(mutations, ["series_1", "series_1"]);
});

test("SeriesManager detaches external arrays only when mutation happens", () => {
  const manager = new SeriesManager();
  const hooks = createSeriesHooks();
  const series = manager.createSeries({ type: "line" }, hooks, baseTheme);
  const source = [
    { time: 1, open: 10, high: 12, low: 9, close: 11 },
    { time: 2, open: 11, high: 13, low: 10, close: 12 },
  ];

  series.setData(source);
  assert.equal(manager.get(series.id)?.data, source);

  series.updateLast({ close: 15 });

  assert.equal(source[1].close, 12);
  assert.notEqual(manager.get(series.id)?.data, source);
  assert.equal(manager.get(series.id)?.data[1].close, 15);
});

test("SeriesManager reuses internal last candle during streaming updates", () => {
  const manager = new SeriesManager();
  const hooks = createSeriesHooks();
  const series = manager.createSeries({ type: "line" }, hooks, baseTheme);
  const source = [
    { time: 1, open: 10, high: 12, low: 9, close: 11 },
    { time: 2, open: 11, high: 13, low: 10, close: 12 },
  ];

  series.setData(source);
  series.updateLast({ close: 14 });

  const firstInternalLast = manager.get(series.id)?.data[1];
  assert.notEqual(firstInternalLast, source[1]);
  assert.equal(source[1].close, 12);

  series.updateLast({ high: 16 });

  assert.equal(manager.get(series.id)?.data[1], firstInternalLast);
  assert.equal(manager.get(series.id)?.data[1].close, 14);
  assert.equal(manager.get(series.id)?.data[1].high, 16);
});

test("SeriesManager respects custom colors and refreshes default colors on theme apply", () => {
  const manager = new SeriesManager();
  const hooks = createSeriesHooks();

  const defaultSeries = manager.createSeries({ type: "line" }, hooks, baseTheme);
  const customSeries = manager.createSeries({ type: "line", color: "#123456" }, hooks, baseTheme);

  const nextTheme = mergeChartTheme(baseTheme, { series: { line: "#abcdef" } });
  manager.applyTheme(nextTheme);

  assert.equal(manager.get(defaultSeries.id)?.style.color, "#abcdef");
  assert.equal(manager.get(customSeries.id)?.style.color, "#123456");
});

test("IndicatorEngine normalizes defaults and computes SMA/EMA/RSI/MACD/ATR/Stochastic/Bollinger", () => {
  const engine = new IndicatorEngine();
  const createId = (() => {
    let i = 0;
    return () => `indicator_${++i}`;
  })();

  const smaId = engine.addIndicator({ type: "sma", period: 3 }, createId, baseTheme);
  const emaId = engine.addIndicator({ type: "ema", period: 3 }, createId, baseTheme);
  const rsiId = engine.addIndicator({ type: "rsi", period: 3 }, createId, baseTheme);
  const macdId = engine.addIndicator({ type: "macd", period: 4, fastPeriod: 2 }, createId, baseTheme);
  const atrId = engine.addIndicator({ type: "atr", period: 3 }, createId, baseTheme);
  const stochasticId = engine.addIndicator({ type: "stochastic", period: 3 }, createId, baseTheme);
  const bollingerId = engine.addIndicator({ type: "bollinger", period: 3 }, createId, baseTheme);

  engine.recompute([
    { time: 1, open: 10, high: 11, low: 9, close: 10 },
    { time: 2, open: 11, high: 12, low: 10, close: 11 },
    { time: 3, open: 12, high: 13, low: 11, close: 12 },
    { time: 4, open: 13, high: 14, low: 12, close: 13 },
    { time: 5, open: 14, high: 15, low: 13, close: 14 },
  ]);

  const indicators = engine.getIndicators();
  const sma = indicators.find((item) => item.id === smaId);
  const ema = indicators.find((item) => item.id === emaId);
  const rsi = indicators.find((item) => item.id === rsiId);
  const macd = indicators.find((item) => item.id === macdId);
  const atr = indicators.find((item) => item.id === atrId);
  const stochastic = indicators.find((item) => item.id === stochasticId);
  const bollinger = indicators.find((item) => item.id === bollingerId);

  assert.ok(sma);
  assert.ok(ema);
  assert.ok(rsi);
  assert.ok(macd);
  assert.ok(atr);
  assert.ok(stochastic);
  assert.ok(bollinger);
  assert.equal(rsi?.pane, "lower");
  assert.equal(macd?.pane, "lower");
  assert.equal(atr?.pane, "lower");
  assert.equal(stochastic?.pane, "lower");
  assert.deepEqual(sma?.values.slice(0, 5), [null, null, 11, 12, 13]);
  assert.equal(ema?.values[2], 11);
  assert.equal(rsi?.values[3], 100);
  assert.equal(typeof macd?.values[3], "number");
  assert.deepEqual(atr?.values.slice(0, 5), [null, null, 2, 2, 2]);
  assert.deepEqual(stochastic?.values.slice(0, 5), [null, null, 75, 75, 75]);
  assert.deepEqual(bollinger?.values.slice(0, 5), [null, null, 11, 12, 13]);
  assert.equal(Number(bollinger?.upperValues?.[2]?.toFixed(3)), 12.633);
  assert.equal(Number(bollinger?.lowerValues?.[2]?.toFixed(3)), 9.367);
});

test("IndicatorEngine applyTheme updates only default indicator colors", () => {
  const engine = new IndicatorEngine();
  engine.addIndicator({ id: "sma_default", type: "sma", period: 5 }, () => "unused", baseTheme);
  engine.addIndicator({ id: "ema_custom", type: "ema", period: 5, color: "#111111" }, () => "unused", baseTheme);
  engine.addIndicator({ id: "macd_default", type: "macd", period: 26 }, () => "unused", baseTheme);
  engine.addIndicator({ id: "atr_default", type: "atr", period: 14 }, () => "unused", baseTheme);
  engine.addIndicator({ id: "stochastic_default", type: "stochastic", period: 14 }, () => "unused", baseTheme);
  engine.addIndicator({ id: "bollinger_default", type: "bollinger", period: 20 }, () => "unused", baseTheme);

  const nextTheme = mergeChartTheme(baseTheme, {
    indicators: {
      sma: "#fedcba",
      ema: "#222222",
      macd: "#333333",
      atr: "#444444",
      stochastic: "#555555",
      bollinger: "#666666",
    },
  });
  engine.applyTheme(nextTheme);

  const indicators = engine.getIndicators();
  assert.equal(indicators.find((item) => item.id === "sma_default")?.color, "#fedcba");
  assert.equal(indicators.find((item) => item.id === "ema_custom")?.color, "#111111");
  assert.equal(indicators.find((item) => item.id === "macd_default")?.color, "#333333");
  assert.equal(indicators.find((item) => item.id === "atr_default")?.color, "#444444");
  assert.equal(indicators.find((item) => item.id === "stochastic_default")?.color, "#555555");
  assert.equal(indicators.find((item) => item.id === "bollinger_default")?.color, "#666666");
});

test("ChartTheme clone produces isolated nested objects", () => {
  const cloned = cloneTheme(baseTheme);
  cloned.surface.chartBackground = "#000000";
  cloned.series.line = "#ffffff";

  assert.notEqual(cloned.surface.chartBackground, baseTheme.surface.chartBackground);
  assert.notEqual(cloned.series.line, baseTheme.series.line);
});

test("ChartNavigationController keeps anchored zoom fixed under the cursor", () => {
  const next = calculateAnchoredZoomViewport(
    {
      centerX: 0,
      centerY: 0,
      zoomX: 2,
      zoomY: 1,
    },
    { width: 400, height: 200 },
    { x: 300, y: 50 },
    { x: 1, y: 0.5 },
    0.5,
    "both"
  );

  assert.deepEqual(next, {
    centerX: 0.5,
    centerY: 0.25,
    zoomX: 1,
    zoomY: 0.5,
  });
});

test("ChartViewport resolves visible ranges for non-uniform candle spacing", () => {
  const geometry = {
    minPrice: 1,
    maxPrice: 5,
    scale: 1,
    candles: [-0.9, -0.5, 0.1, 0.15, 0.8].map((x, index) => ({
      x,
      open: 0,
      high: 1,
      low: -1,
      close: 0,
      source: { time: index + 1, open: 1, high: 2, low: 0, close: 1 },
    })),
  };

  assert.deepEqual(getVisibleCandleIndexRange(geometry, 400, {
    centerX: -0.2,
    centerY: 0,
    zoomX: 0.35,
    zoomY: 1,
  }, 0), { start: 1, end: 2 });
});

test("PerfTracker keeps a sliding window and reports aggregate metrics", () => {
  const tracker = new PerfTracker(3);
  tracker.recordSample(5);
  tracker.recordSample(10);
  tracker.recordSample(15);
  tracker.recordSample(20);

  const metrics = tracker.getMetrics();
  assert.equal(metrics.redrawCount, 4);
  assert.equal(metrics.sampleCount, 3);
  assert.equal(metrics.lastRedrawMs, 20);
  assert.equal(metrics.maxRedrawMs, 20);
  assert.equal(metrics.avgRedrawMs, 15);
});

test("NexusWasmBridge grows series sync buffers geometrically", () => {
  const bridge = new NexusWasmBridge();
  const unsafeBridge = bridge as any;

  unsafeBridge.ensureSeriesSyncCapacity(65);
  const firstCapacity = unsafeBridge.seriesSyncScratch.opens.length;
  unsafeBridge.ensureSeriesSyncCapacity(66);
  const secondCapacity = unsafeBridge.seriesSyncScratch.opens.length;
  unsafeBridge.ensureSeriesSyncCapacity(firstCapacity + 1);
  const thirdCapacity = unsafeBridge.seriesSyncScratch.opens.length;

  assert.equal(firstCapacity, 128);
  assert.equal(secondCapacity, firstCapacity);
  assert.equal(thirdCapacity, firstCapacity * 2);
});

test("NexusWasmBridge prevents concurrent WASM engine ownership", async () => {
  const destroyCalls: string[] = [];
  const initCalls: string[] = [];
  const createFakeModule = (name: string) => ({
    initEngine: (canvasSelector: string) => {
      initCalls.push(`${name}:${canvasSelector}`);
      return true;
    },
    destroyEngine: () => {
      destroyCalls.push(name);
    },
    panCamera: () => undefined,
    zoomCamera: () => undefined,
  });
  const bridgeA = new NexusWasmBridge() as any;
  const bridgeB = new NexusWasmBridge() as any;
  const originalConsoleError = console.error;
  const originalConsoleLog = console.log;

  bridgeA.loadWasmModule = async () => createFakeModule("a");
  bridgeB.loadWasmModule = async () => createFakeModule("b");
  console.error = () => undefined;
  console.log = () => undefined;

  try {
    assert.equal(await bridgeA.initialize({
      canvasId: "chart-a",
      width: 800,
      height: 600,
      canvas: null,
      wasmScriptPath: "wasm/nexuscharts.js",
      wasmBinaryPath: "wasm/nexuscharts.wasm",
    }), true);
    assert.equal(await bridgeA.initialize({
      canvasId: "chart-a",
      width: 1024,
      height: 768,
      canvas: null,
      wasmScriptPath: "wasm/nexuscharts.js",
      wasmBinaryPath: "wasm/nexuscharts.wasm",
    }), true);
    assert.equal(await bridgeA.initialize({
      canvasId: "chart-c",
      width: 800,
      height: 600,
      canvas: null,
      wasmScriptPath: "wasm/nexuscharts.js",
      wasmBinaryPath: "wasm/nexuscharts.wasm",
    }), false);
    assert.equal(await bridgeB.initialize({
      canvasId: "chart-b",
      width: 800,
      height: 600,
      canvas: null,
      wasmScriptPath: "wasm/nexuscharts.js",
      wasmBinaryPath: "wasm/nexuscharts.wasm",
    }), false);

    bridgeA.destroy();
    assert.equal(await bridgeB.initialize({
      canvasId: "chart-b",
      width: 800,
      height: 600,
      canvas: null,
      wasmScriptPath: "wasm/nexuscharts.js",
      wasmBinaryPath: "wasm/nexuscharts.wasm",
    }), true);
  } finally {
    console.error = originalConsoleError;
    console.log = originalConsoleLog;
    bridgeA.destroy();
    bridgeB.destroy();
  }

  assert.deepEqual(initCalls, ["a:#chart-a", "b:#chart-b"]);
  assert.deepEqual(destroyCalls, ["a", "b"]);
});

test("SeriesManager reports data mutation reasons", () => {
  const manager = new SeriesManager();
  const mutations: string[] = [];
  const series = manager.createSeries({ type: "line" }, {
    createId: () => "series_1",
    isCompleteCandle: (point) => (
      point.time !== undefined && point.open !== undefined && point.high !== undefined && point.low !== undefined && point.close !== undefined
    ),
    onSeriesMutated: (id, reason) => mutations.push(`${id}:${reason}`),
  }, baseTheme);

  series.setData([{ time: 1, open: 10, high: 12, low: 9, close: 11 }]);
  series.append({ time: 2, open: 11, high: 13, low: 10, close: 12 });
  series.updateLast({ close: 12.5 });
  series.clear();

  assert.deepEqual(mutations, [
    "series_1:setData",
    "series_1:append",
    "series_1:updateLast",
    "series_1:clear",
  ]);
});

test("NexusWasmBridge parses modern css color formats for theme sync", () => {
  const bridge = new NexusWasmBridge() as any;

  assert.deepEqual(bridge.parseColor("#0f8", [1, 1, 1]).map((v: number) => Number(v.toFixed(3))), [0, 1, 0.533]);
  assert.deepEqual(bridge.parseColor("#0f8c", [1, 1, 1]).map((v: number) => Number(v.toFixed(3))), [0, 1, 0.533]);
  assert.deepEqual(bridge.parseColor("#336699cc", [1, 1, 1]).map((v: number) => Number(v.toFixed(3))), [0.2, 0.4, 0.6]);
  assert.deepEqual(bridge.parseColor("rgb(12 34 56)", [1, 1, 1]).map((v: number) => Number(v.toFixed(3))), [0.047, 0.133, 0.22]);
  assert.deepEqual(bridge.parseColor("rgb(100% 0% 50%)", [1, 1, 1]).map((v: number) => Number(v.toFixed(3))), [1, 0, 0.5]);
  assert.deepEqual(bridge.parseColor("rgba(10, 20, 30, 0.5)", [1, 1, 1]).map((v: number) => Number(v.toFixed(3))), [0.039, 0.078, 0.118]);
  assert.deepEqual(bridge.parseColor("hsl(150 50% 40%)", [1, 1, 1]).map((v: number) => Number(v.toFixed(3))), [0.2, 0.6, 0.4]);
  assert.deepEqual(bridge.parseColor("not-a-color", [0.1, 0.2, 0.3]), [0.1, 0.2, 0.3]);
});

test("ChartEventBus supports one-shot subscriptions", () => {
  const bus = new ChartEventBus();
  const ranges: Array<[number, number]> = [];

  const unsubscribe = bus.subscribeOnce("visibleRangeChange", (range) => {
    ranges.push([range.startIndex, range.endIndex]);
  });

  bus.emit("visibleRangeChange", {
    startIndex: 1,
    endIndex: 10,
    fromTime: 1,
    toTime: 10,
    fromPrice: 100,
    toPrice: 110,
  });
  bus.emit("visibleRangeChange", {
    startIndex: 2,
    endIndex: 12,
    fromTime: 2,
    toTime: 12,
    fromPrice: 101,
    toPrice: 111,
  });
  unsubscribe();

  assert.deepEqual(ranges, [[1, 10]]);
});

test("Chart event subscription helpers proxy typed bus subscriptions", () => {
  const bus = new ChartEventBus();
  const seen: Array<string | null> = [];
  const handler = (event: { candle: { time: number | string } | null }) => {
    seen.push(event.candle?.time ?? null);
  };

  const unsubscribe = subscribeChartEvent(bus, "crosshairMove", handler);
  bus.emit("crosshairMove", { candle: null });
  assert.equal(unsubscribeChartEvent(bus, "crosshairMove", handler), true);
  bus.emit("crosshairMove", { candle: null });

  subscribeChartEventOnce(bus, "crosshairMove", handler);
  bus.emit("crosshairMove", { candle: { time: 2 } as any });
  bus.emit("crosshairMove", { candle: { time: 3 } as any });
  unsubscribe();

  assert.deepEqual(seen, [null, 2]);
});

test("DataAdapter helpers load and stream candles into a series", async () => {
  const manager = new SeriesManager();
  const series = manager.createSeries({ type: "candlestick" }, createSeriesHooks(), baseTheme);
  const candles = [
    { time: 1, open: 10, high: 11, low: 9, close: 10.5 },
    { time: 2, open: 10.5, high: 12, low: 10, close: 11.5 },
  ];
  let streamHandlers: any = null;
  let disconnected = false;
  let batchedLoads = 0;

  const adapter = {
    load: () => ({ data: candles, mode: "replace" as const }),
    subscribe: (handlers: any) => {
      streamHandlers = handlers;
      return () => {
        disconnected = true;
      };
    },
  };

  const loaded = await loadSeriesData(series, adapter, undefined, {
    batch: (callback) => {
      batchedLoads += 1;
      return callback();
    },
  });
  assert.equal(loaded, candles);
  assert.deepEqual(series.getData(), candles);
  assert.equal(batchedLoads, 1);

  const connection = connectSeriesDataAdapter(series, adapter);
  await connection.load(undefined, {
    batch: (callback) => {
      batchedLoads += 1;
      return callback();
    },
  });
  assert.equal(batchedLoads, 2);

  streamHandlers.onCandle({ time: 3, open: 11.5, high: 13, low: 11, close: 12.5 });
  streamHandlers.onCandle({ time: 3, close: 13 } as any, "updateLast");

  assert.equal(series.getData().length, 3);
  assert.equal(series.getData()[2].close, 13);

  connection.disconnect();
  assert.equal(disconnected, true);
});

test("createDataAdapter maps external rows into candle data", async () => {
  const adapter = createDataAdapter({
    load: async (request) => [
      { ts: request?.from ?? 1000, o: "10", h: "12", l: "9", c: "11", v: "1500" },
      { ts: request?.to ?? 2000, o: "11", h: "13", l: "10", c: "12", v: "1750" },
    ],
    map: (row) => ({
      time: row.ts,
      open: Number(row.o),
      high: Number(row.h),
      low: Number(row.l),
      close: Number(row.c),
      volume: Number(row.v),
    }),
  });

  const loaded = await adapter.load({ from: 1000, to: 2000 });

  assert.deepEqual(loaded, {
    mode: "replace",
    data: [
      { time: 1000, open: 10, high: 12, low: 9, close: 11, volume: 1500 },
      { time: 2000, open: 11, high: 13, low: 10, close: 12, volume: 1750 },
    ],
  });
});

test("createPollingDataAdapter streams new rows and updates the latest candle", async () => {
  let rows = [
    { time: 1, open: 10, high: 12, low: 9, close: 11 },
  ];
  const emitted: Array<{ time: number | string; mode?: string; close: number }> = [];

  const adapter = createPollingDataAdapter({
    intervalMs: 1000,
    emitInitial: true,
    load: async () => rows,
  });

  await adapter.load();
  rows = [
    { time: 1, open: 10, high: 12, low: 9, close: 11.5 },
    { time: 2, open: 11.5, high: 13, low: 11, close: 12.5 },
  ];

  const unsubscribe = adapter.subscribe?.({
    onCandle: (point, mode) => {
      emitted.push({ time: point.time, mode, close: point.close });
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 20));
  unsubscribe?.();

  assert.deepEqual(emitted, [
    { time: 1, mode: "updateLast", close: 11.5 },
    { time: 2, mode: "append", close: 12.5 },
  ]);
});

test("CSV data adapter parses header and index based candle rows", async () => {
  const csv = [
    "time,open,high,low,close,volume",
    "1,10,12,9,11,1500",
    "2,11,13,10,12,1750",
  ].join("\n");

  assert.deepEqual(parseCsvCandles(csv), [
    { time: 1, open: 10, high: 12, low: 9, close: 11, volume: 1500 },
    { time: 2, open: 11, high: 13, low: 10, close: 12, volume: 1750 },
  ]);

  const adapter = createCsvDataAdapter({
    hasHeader: false,
    mode: "append",
    load: () => "3;12;14;11;13\n4;13;15;12;14",
    delimiter: ";",
  });

  assert.deepEqual(await adapter.load(), {
    mode: "append",
    data: [
      { time: 3, open: 12, high: 14, low: 11, close: 13 },
      { time: 4, open: 13, high: 15, low: 12, close: 14 },
    ],
  });
});

test("CSV data adapter reports malformed required values", () => {
  assert.throws(
    () => parseCsvCandles("time,open,high,low,close\n1,10,nope,9,11"),
    /CSV value 'high' is invalid on line 2/
  );
  assert.throws(
    () => parseCsvCandles("time,open,low,close\n1,10,9,11"),
    /CSV column 'high' is missing on line 2/
  );
  assert.throws(
    () => parseCsvCandles("time,open,high,low,close\n,10,12,9,11"),
    /CSV time value is empty/
  );
});

test("loadSeriesData respects append mode and batching", async () => {
  const manager = new SeriesManager();
  const series = manager.createSeries({ type: "candlestick" }, createSeriesHooks(), baseTheme);
  series.setData([{ time: 1, open: 10, high: 12, low: 9, close: 11 }]);
  let batchCalls = 0;

  const adapter = createDataAdapter({
    mode: "append",
    load: async () => [
      { time: 2, open: 11, high: 13, low: 10, close: 12 },
      { time: 3, open: 12, high: 14, low: 11, close: 13 },
    ],
  });

  const loaded = await loadSeriesData(series, adapter, undefined, {
    batch: (callback) => {
      batchCalls += 1;
      return callback();
    },
  });

  assert.equal(batchCalls, 1);
  assert.equal(loaded.length, 2);
  assert.deepEqual(series.getData().map((point) => point.time), [1, 2, 3]);
});

test("WebSocket data adapter streams mapped candle messages", async () => {
  let socket: any = null;
  const emitted: Array<{ time: number | string; close: number; mode?: string }> = [];
  const adapter = createWebSocketDataAdapter({
    url: "wss://example.test/feed",
    webSocketFactory: () => {
      const listeners = new Map<string, Function[]>();
      socket = {
        closed: false,
        addEventListener: (type: string, listener: Function) => {
          listeners.set(type, [...(listeners.get(type) ?? []), listener]);
        },
        removeEventListener: (type: string, listener: Function) => {
          listeners.set(type, (listeners.get(type) ?? []).filter((item) => item !== listener));
        },
        emit: (type: string, event: unknown) => {
          for (const listener of listeners.get(type) ?? []) {
            listener(event);
          }
        },
        close: () => {
          socket.closed = true;
        },
      };
      return socket;
    },
    map: (row: any) => ({
      time: row.t,
      open: Number(row.o),
      high: Number(row.h),
      low: Number(row.l),
      close: Number(row.c),
    }),
    getUpdateMode: (point) => point.time === 1 ? "updateLast" : "append",
  });

  const loaded = await adapter.load();
  assert.deepEqual(loaded, { data: [], mode: "replace" });

  const unsubscribe = adapter.subscribe?.({
    onCandle: (point, mode) => {
      emitted.push({ time: point.time, close: point.close, mode });
    },
  });

  socket.emit("message", { data: JSON.stringify({ t: 1, o: "10", h: "12", l: "9", c: "11" }) });
  socket.emit("message", {
    data: JSON.stringify([
      { t: 1, o: "10", h: "12", l: "9", c: "11.5" },
      { t: 2, o: "11.5", h: "13", l: "11", c: "12.5" },
    ]),
  });
  unsubscribe?.();
  socket.emit("message", { data: JSON.stringify({ t: 3, o: "12", h: "14", l: "11", c: "13" }) });

  assert.equal(socket.closed, true);
  assert.deepEqual(emitted, [
    { time: 1, close: 11, mode: "updateLast" },
    { time: 1, close: 11.5, mode: "updateLast" },
    { time: 2, close: 12.5, mode: "append" },
  ]);
});

test("WebSocket data adapter reports parse errors and ignores messages after unsubscribe", () => {
  let socket: any = null;
  const errors: unknown[] = [];
  const emitted: CandleDataPoint[] = [];
  const adapter = createWebSocketDataAdapter({
    url: "wss://example.test/feed",
    webSocketFactory: () => {
      const listeners = new Map<string, Function[]>();
      socket = {
        closed: false,
        addEventListener: (type: string, listener: Function) => {
          listeners.set(type, [...(listeners.get(type) ?? []), listener]);
        },
        removeEventListener: (type: string, listener: Function) => {
          listeners.set(type, (listeners.get(type) ?? []).filter((item) => item !== listener));
        },
        emit: (type: string, event: unknown) => {
          for (const listener of listeners.get(type) ?? []) {
            listener(event);
          }
        },
        close: () => {
          socket.closed = true;
        },
      };
      return socket;
    },
  });

  const unsubscribe = adapter.subscribe?.({
    onCandle: (point) => {
      emitted.push(point);
    },
    onError: (error) => {
      errors.push(error);
    },
  });

  socket.emit("message", { data: "{bad json" });
  socket.emit("message", { data: null });
  socket.emit("error", new Error("socket failed"));
  socket.emit("message", { data: JSON.stringify({ time: 1, open: 10, high: 12, low: 9, close: 11 }) });
  unsubscribe?.();
  socket.emit("message", { data: JSON.stringify({ time: 2, open: 11, high: 13, low: 10, close: 12 }) });

  assert.equal(errors.length, 2);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].time, 1);
  assert.equal(socket.closed, true);
});


test("PriceAnnotationManager stores and updates price lines and markers", () => {
  const manager = new PriceAnnotationManager();
  const createId = (() => {
    let i = 0;
    return () => `ann_${++i}`;
  })();

  const priceLineId = manager.addPriceLine({ price: 101.25, label: "Entry" }, createId);
  const markerId = manager.addMarker({ time: 2, price: 102.5, label: "Buy", shape: "arrowUp" }, createId);

  assert.equal(manager.getPriceLines().length, 1);
  assert.equal(manager.getMarkers().length, 1);
  assert.equal(manager.hasAnnotations(), true);

  const alertId = manager.addAlert({ id: "breakout", price: 108.5, label: "Breakout", condition: "above" }, createId);
  assert.equal(alertId, "breakout");
  assert.equal(manager.getAlerts().length, 1);
  assert.equal(manager.getAlerts()[0].condition, "above");
  assert.equal(manager.updateAlert(alertId, { enabled: false, price: 109 }), true);
  assert.equal(manager.getAlerts()[0].enabled, false);
  assert.equal(manager.getAlerts()[0].price, 109);

  assert.equal(manager.updatePriceLine(priceLineId, { price: 103.75 }), true);
  assert.equal(manager.updateMarker(markerId, { label: "Take Profit", shape: "circle" }), true);

  assert.equal(manager.getPriceLines()[0].price, 103.75);
  assert.equal(manager.getMarkers()[0].label, "Take Profit");
  assert.equal(manager.getMarkers()[0].shape, "circle");

  assert.equal(manager.removePriceLine(priceLineId), true);
  assert.equal(manager.removeAlert(alertId), true);
  manager.clearMarkers();
  assert.equal(manager.hasAnnotations(), false);

  const priceLineIds = manager.setPriceLines([
    { id: "entry", price: 101, label: "Entry" },
    { price: 104, label: "Target" },
  ], createId);
  const markerIds = manager.setMarkers([
    { id: "buy", time: 3, price: 100, shape: "arrowUp" },
    { time: 4, price: 105, shape: "arrowDown" },
  ], createId);

  assert.deepEqual(priceLineIds, ["entry", "ann_3"]);
  assert.deepEqual(markerIds, ["buy", "ann_4"]);
  assert.equal(manager.getPriceLines().length, 2);
  assert.equal(manager.getMarkers().length, 2);

  const annotationIds = manager.setAnnotations({
    priceLines: [{ id: "stop", price: 99, label: "Stop" }],
    markers: [{ id: "exit", time: 5, price: 99, shape: "arrowDown" }],
  }, createId, createId);

  assert.deepEqual(annotationIds, {
    priceLineIds: ["stop"],
    markerIds: ["exit"],
  });
  assert.deepEqual(manager.getPriceLines().map((line) => line.id), ["stop"]);
  assert.deepEqual(manager.getMarkers().map((marker) => marker.id), ["exit"]);

  manager.addAlert({ id: "target-alert", price: 110, label: "Target" }, createId);
  assert.equal(manager.getAlerts()[0].condition, "crossing");
  manager.clearAlerts();
  assert.equal(manager.getAlerts().length, 0);

  manager.clearAnnotations();
  assert.equal(manager.hasAnnotations(), false);
});

test("Marker snap helper resolves marker price from nearest candle OHLC", () => {
  const candles = [
    { time: 10, open: 100, high: 105, low: 98, close: 103 },
    { time: 20, open: 103, high: 108, low: 101, close: 107 },
  ];

  assert.deepEqual(
    resolveMarkerSnapPrice({ time: 20, price: 0, snapTo: "high" }, candles),
    { time: 20, price: 108, snapTo: "high" }
  );
  assert.deepEqual(
    resolveMarkerSnapPrice({ time: 18, price: 0, snapTo: "low" }, candles),
    { time: 20, price: 101, snapTo: "low" }
  );
  assert.deepEqual(
    resolveMarkerSnapPrice({ time: "missing", price: 12, snapTo: "close" }, candles),
    { time: "missing", price: 12, snapTo: "close" }
  );
});
