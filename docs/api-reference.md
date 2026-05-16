# NexusCharts API Reference

This document summarizes the public API surface that is stable enough for application-level use.

## Create A Chart

```ts
import { NexusCharts } from "nexuscharts";

const chart = new NexusCharts({
  canvasId: "canvas",
  autoResize: true,
  theme: {
    candles: { up: "#22c55e", down: "#fb7185" }
  }
});

await chart.waitUntilReady();
```

Key options:

| Option | Purpose |
|---|---|
| `canvasId` | Target canvas element id. |
| `autoResize` | Enables responsive canvas resizing. |
| `wasmScriptPath` / `wasmBinaryPath` | Overrides WASM runtime asset paths. |
| `theme` | Initial chart theme override. |
| `timeAxis` | Timezone and gap handling options. |

## Series

```ts
const candles = chart.createSeries({ type: "candlestick" });

candles.setData([
  { time: 1, open: 100, high: 105, low: 98, close: 103, volume: 1200 }
]);

candles.updateLast({ time: 1, open: 100, high: 106, low: 98, close: 104 });
candles.append({ time: 2, open: 104, high: 108, low: 101, close: 107 });
```

Supported series types include `candlestick`, `line`, `area`, `histogram`, `volume`, and `custom`.

## Data Adapters

Adapters provide a common bridge for REST-style loads, polling, CSV, and WebSocket feeds.

```ts
import {
  createDataAdapter,
  createCsvDataAdapter,
  createPollingDataAdapter,
  createWebSocketDataAdapter,
  connectSeriesDataAdapter
} from "nexuscharts";

const adapter = createDataAdapter({
  load: async () => fetch("/api/candles").then((response) => response.json()),
  map: (row) => ({
    time: row.t,
    open: Number(row.o),
    high: Number(row.h),
    low: Number(row.l),
    close: Number(row.c),
    volume: Number(row.v)
  })
});

const connection = connectSeriesDataAdapter(candles, adapter);
await connection.load({ limit: 500 });
```

WebSocket feeds can push both appended candles and in-progress candle updates:

```ts
const socketAdapter = createWebSocketDataAdapter({
  url: "wss://example.com/feed",
  map: (row) => ({
    time: row.time,
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.volume
  }),
  getUpdateMode: (point) => point.time === candles.getData().at(-1)?.time
    ? "updateLast"
    : "append"
});

connectSeriesDataAdapter(candles, socketAdapter);
```

## Annotations

```ts
chart.addPriceLine({ price: 101.25, label: "Entry" });
chart.addMarker({ time: 1, price: 0, snapTo: "low", label: "Buy", shape: "arrowUp" });

const snapshot = chart.getAnnotations();
chart.setAnnotations(snapshot);
chart.clearAnnotations();
```

Marker `snapTo` accepts `open`, `high`, `low`, or `close`. When enabled, the marker price is resolved from the nearest primary candlestick.

## Drawings

```ts
chart.addDrawing({
  type: "line",
  points: [
    { time: 1, price: 100 },
    { time: 10, price: 108 }
  ],
  style: { width: 2 }
});
```

Drawings can use normalized coordinates or time/price anchors. Time/price anchors remain stable while panning and zooming.

## Indicators And Analytics

```ts
chart.addIndicator({ type: "sma", period: 10 });
chart.addIndicator({ type: "ema", period: 21 });
chart.addIndicator({ type: "rsi", period: 14, pane: "lower" });

chart.configureAnalytics({ showHeatmap: true, showRewardCurve: true, showPnlCurve: true });
chart.setObserverFrames([
  { time: 1, reward: 0.4, pnl: 0.2, confidence: 0.8, action: "buy", x: -0.5, y: 0.4 }
]);
```

## Events

```ts
const unsubscribe = chart.subscribeVisibleRangeChange((range) => {
  console.log(range.startIndex, range.endIndex);
});

const currentRange = chart.getVisibleRange();
console.log(currentRange.fromTime, currentRange.toTime);

chart.subscribeOnce("selectionChange", (event) => {
  console.log(event.candle);
});

unsubscribe();
```

Common events include `crosshairMove`, `click`, `selectionChange`, `visibleRangeChange`, `timeScaleChange`, `drawingSelected`, `drawingUpdated`, and `drawingDeleted`.

Series data changes can also be observed without wrapping every series method:

```ts
chart.subscribeSeriesDataChange((event) => {
  console.log(event.seriesId, event.reason, event.length, event.isPrimary);
});
```

The `reason` field is one of `setData`, `append`, `updateLast`, or `clear`.

## UI And Theme

```ts
chart.configureUi({
  showCrosshair: true,
  showTooltip: true,
  showControlBar: true,
  autoScaleY: true,
  persistState: true
});

chart.applyTheme({
  candles: { up: "#16a34a", down: "#dc2626" },
  indicators: { sma: "#f59e0b", ema: "#38bdf8" }
});
```

## Accessibility

```ts
const chart = new NexusCharts({
  canvasId: "canvas",
  accessibility: {
    role: "application",
    label: "BTCUSD interactive candlestick chart",
    tabIndex: 0,
    describedBy: "chart-help"
  }
});

chart.configureAccessibility({
  label: "ETHUSD interactive candlestick chart"
});
```

The overlay canvas is marked `aria-hidden`, while the main canvas receives the focus and screen-reader metadata.

## Performance Helpers

```ts
const metrics = chart.getPerfMetrics();
console.log(metrics.redrawMs.avg, metrics.redrawMs.max);
```

Use the demo benchmark controls or `npm run benchmark` for repeatable local performance checks.

## Image Export

```ts
const png = chart.toDataURL({
  type: "image/png",
  includeOverlay: true,
  backgroundColor: "#0b1220"
});

chart.downloadImage("nexuscharts.png", {
  type: "image/png",
  includeOverlay: true
});

const copied = await chart.copyImageToClipboard({
  type: "image/png",
  includeOverlay: true,
  backgroundColor: "#0b1220"
});
```

`includeOverlay` captures annotations, drawings, crosshair, labels, and other canvas overlay elements together with the WebGL chart.
Clipboard export returns `false` when the browser does not support image clipboard writes or the page is not in a compatible secure context.
