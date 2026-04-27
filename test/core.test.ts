import test from "node:test";
import assert from "node:assert/strict";

import { SeriesManager } from "../ts-src/core/series/SeriesManager.ts";
import { IndicatorEngine } from "../ts-src/core/indicators/IndicatorEngine.ts";
import { createChartTheme, mergeChartTheme, cloneTheme } from "../ts-src/core/theme/ChartTheme.ts";
import { PerfTracker } from "../ts-src/core/perf/PerfTracker.ts";
import { NexusWasmBridge } from "../ts-src/core/wasm/NexusWasmBridge.ts";
import { connectSeriesDataAdapter, loadSeriesData } from "../ts-src/core/data/DataAdapter.ts";
import { PriceAnnotationManager } from "../ts-src/core/annotations/PriceAnnotationManager.ts";

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

test("IndicatorEngine normalizes defaults and computes SMA/EMA/RSI", () => {
  const engine = new IndicatorEngine();
  const createId = (() => {
    let i = 0;
    return () => `indicator_${++i}`;
  })();

  const smaId = engine.addIndicator({ type: "sma", period: 3 }, createId, baseTheme);
  const emaId = engine.addIndicator({ type: "ema", period: 3 }, createId, baseTheme);
  const rsiId = engine.addIndicator({ type: "rsi", period: 3 }, createId, baseTheme);

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

  assert.ok(sma);
  assert.ok(ema);
  assert.ok(rsi);
  assert.equal(rsi?.pane, "lower");
  assert.deepEqual(sma?.values.slice(0, 5), [null, null, 11, 12, 13]);
  assert.equal(ema?.values[2], 11);
  assert.equal(rsi?.values[3], 100);
});

test("IndicatorEngine applyTheme updates only default indicator colors", () => {
  const engine = new IndicatorEngine();
  engine.addIndicator({ id: "sma_default", type: "sma", period: 5 }, () => "unused", baseTheme);
  engine.addIndicator({ id: "ema_custom", type: "ema", period: 5, color: "#111111" }, () => "unused", baseTheme);

  const nextTheme = mergeChartTheme(baseTheme, { indicators: { sma: "#fedcba", ema: "#222222" } });
  engine.applyTheme(nextTheme);

  const indicators = engine.getIndicators();
  assert.equal(indicators.find((item) => item.id === "sma_default")?.color, "#fedcba");
  assert.equal(indicators.find((item) => item.id === "ema_custom")?.color, "#111111");
});

test("ChartTheme clone produces isolated nested objects", () => {
  const cloned = cloneTheme(baseTheme);
  cloned.surface.chartBackground = "#000000";
  cloned.series.line = "#ffffff";

  assert.notEqual(cloned.surface.chartBackground, baseTheme.surface.chartBackground);
  assert.notEqual(cloned.series.line, baseTheme.series.line);
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

test("DataAdapter helpers load and stream candles into a series", async () => {
  const manager = new SeriesManager();
  const series = manager.createSeries({ type: "candlestick" }, createSeriesHooks(), baseTheme);
  const candles = [
    { time: 1, open: 10, high: 11, low: 9, close: 10.5 },
    { time: 2, open: 10.5, high: 12, low: 10, close: 11.5 },
  ];
  let streamHandlers: any = null;
  let disconnected = false;

  const adapter = {
    load: () => ({ data: candles, mode: "replace" as const }),
    subscribe: (handlers: any) => {
      streamHandlers = handlers;
      return () => {
        disconnected = true;
      };
    },
  };

  const loaded = await loadSeriesData(series, adapter);
  assert.equal(loaded, candles);
  assert.deepEqual(series.getData(), candles);

  const connection = connectSeriesDataAdapter(series, adapter);
  streamHandlers.onCandle({ time: 3, open: 11.5, high: 13, low: 11, close: 12.5 });
  streamHandlers.onCandle({ time: 3, close: 13 } as any, "updateLast");

  assert.equal(series.getData().length, 3);
  assert.equal(series.getData()[2].close, 13);

  connection.disconnect();
  assert.equal(disconnected, true);
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

  assert.equal(manager.updatePriceLine(priceLineId, { price: 103.75 }), true);
  assert.equal(manager.updateMarker(markerId, { label: "Take Profit", shape: "circle" }), true);

  assert.equal(manager.getPriceLines()[0].price, 103.75);
  assert.equal(manager.getMarkers()[0].label, "Take Profit");
  assert.equal(manager.getMarkers()[0].shape, "circle");

  assert.equal(manager.removePriceLine(priceLineId), true);
  manager.clearMarkers();
  assert.equal(manager.hasAnnotations(), false);
});
