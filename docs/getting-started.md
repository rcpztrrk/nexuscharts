# Getting Started

This guide shows the shortest path from an empty page to a live NexusCharts candlestick chart.

## 1. Install And Build

```bash
npm install
npm run build
```

For local development:

```bash
npm run dev
```

Open the printed local URL and use the `public/` demo to validate data sources, annotations, themes, and navigation.

## 2. Add A Canvas

```html
<canvas id="chart" width="900" height="600"></canvas>
<script type="module" src="./app.js"></script>
```

## 3. Create The Chart

```ts
import {
  NexusCharts,
  createDataAdapter,
  connectSeriesDataAdapter
} from "nexuscharts";

const chart = new NexusCharts({
  canvasId: "chart",
  autoResize: true,
  accessibility: {
    label: "Demo interactive financial chart",
    tabIndex: 0
  },
  ui: {
    showAxes: true,
    showCrosshair: true,
    showTooltip: true,
    autoScaleY: true
  }
});

await chart.waitUntilReady();
```

## 4. Create A Candlestick Series

```ts
const series = chart.createSeries({ type: "candlestick" });

series.setData([
  { time: 1, open: 100, high: 106, low: 98, close: 104, volume: 1200 },
  { time: 2, open: 104, high: 109, low: 101, close: 107, volume: 1400 },
  { time: 3, open: 107, high: 108, low: 102, close: 103, volume: 1300 }
]);
```

## 5. Connect A Data Adapter

Use adapters when your data comes from a REST endpoint, CSV file, polling source, or WebSocket feed.

```ts
const adapter = createDataAdapter({
  load: async () => {
    const response = await fetch("/api/candles");
    return response.json();
  },
  map: (row) => ({
    time: row.t,
    open: Number(row.o),
    high: Number(row.h),
    low: Number(row.l),
    close: Number(row.c),
    volume: Number(row.v)
  })
});

const connection = connectSeriesDataAdapter(series, adapter);
await connection.load({ limit: 500 });
```

## 6. Stream Live Candles

For live feeds, update the current candle while it is still forming and append when the next candle starts.

```ts
series.updateLast({ close: 108.25, high: 110.10 });

series.append({
  time: 4,
  open: 108.25,
  high: 111,
  low: 107.5,
  close: 110.4,
  volume: 1600
});
```

## 7. Add Annotations

```ts
chart.setAnnotations({
  priceLines: [
    { price: 104, label: "Entry", color: "#60a5fa" },
    { price: 111, label: "Target", color: "#22c55e" }
  ],
  markers: [
    { time: 2, price: 0, snapTo: "low", label: "Buy", shape: "arrowUp" }
  ]
});

chart.addAlert({ price: 108, label: "Breakout", condition: "above" });
chart.subscribeAlertTriggered((event) => {
  console.log("alert triggered", event.alert.label, event.price);
});
```

`snapTo` can be `open`, `high`, `low`, or `close`. It anchors the marker to the nearest primary candlestick value.

## 8. Listen To Events

```ts
const unsubscribeRange = chart.subscribeVisibleRangeChange((range) => {
  console.log("visible bars", range.startIndex, range.endIndex);
});

console.log("current range", chart.getVisibleRange());

const unsubscribeClick = chart.subscribeClick((event) => {
  console.log("clicked candle", event.candle);
});

const unsubscribeData = chart.subscribeSeriesDataChange((event) => {
  console.log("series changed", event.seriesId, event.reason, event.length);
});

// Later:
unsubscribeRange();
unsubscribeClick();
unsubscribeData();
```

## 9. Apply A Theme

```ts
chart.applyTheme({
  surface: {
    chartBackground: "#0b1220"
  },
  candles: {
    up: "#22c55e",
    down: "#fb7185",
    wick: "#cbd5e1"
  },
  indicators: {
    sma: "#fbbf24",
    ema: "#7dd3fc",
    rsi: "#a78bfa"
  }
});
```

## 10. Export An Image

```ts
chart.downloadImage("chart.png", {
  type: "image/png",
  includeOverlay: true,
  backgroundColor: "#0b1220"
});

chart.downloadSVG("chart.svg", {
  includeOverlay: true,
  backgroundColor: "#0b1220"
});

await chart.copyImageToClipboard({
  type: "image/png",
  includeOverlay: true,
  backgroundColor: "#0b1220"
});
```

## 11. Next Steps

- Use `docs/api-reference.md` for the full public API surface.
- Use the local demo to test large datasets and interaction behavior.
- Use `npm test` before larger refactors.
- Use `npm run benchmark` when touching rendering or large-data paths.
