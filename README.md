# NexusCharts

NexusCharts is a financial charting engine built with a C++ core compiled to WebAssembly and rendered with WebGL 2.0.
The project focuses on high-throughput candlestick rendering and a TypeScript-first integration layer for browser applications.

## Project Status

- Phase 1-8 completed: WASM/WebGL2 core, instanced candlesticks, interaction, API, indicators, multipane UX, drawings, and time/price anchoring.
- Phase 9 largely complete: realtime updates (append/update last candle), perf metrics, and large dataset render optimizations.
- Phase 10 largely complete: unified theme model, `applyTheme()`, and demo presets are now in place.
- Phase 11 largely complete: NexusCharts.ts has been split into focused modules (series, indicators, drawings, WASM bridge).
- Phase 12 in progress: performance tuning (benchmark/profiling for 500K-1M candles).
- Phase 14 started: responsive layout and HiDPI-aware canvas sizing are now available.
- Demo now supports benchmark mode for large datasets (50k+), reducing overlay load to keep interaction responsive.

## Core Capabilities

- C++20 engine compiled to WebAssembly via Emscripten.
- WebGL 2.0 rendering pipeline using GPU instancing.
- TypeScript wrapper that bootstraps and controls the WASM module.
- Public chart API for series and drawing management.
- Observer analytics API (`setObserverFrames`, `pushObserverFrame`, `configureAnalytics`).
- UI control API (`configureUi`, `getUiState`) with in-chart control bar and keyboard shortcuts.
- Theme API via constructor `theme` option and runtime `applyTheme()` / `getTheme()`.
- Interactive chart UX: hover crosshair, OHLC tooltip, candle selection, fit-to-data, and pointer-anchored zoom.
- Dynamic axis labeling with visible-window time labels and nice-stepped price ticks.
- Optional Y-axis auto-scale for the visible window (autoScaleY).
- Persistent UI preferences (`localStorage`) and tooltip mode switching (`follow` / `fixed`).
- Indicator engine (SMA/EMA/RSI) with a secondary pane overlay.
- Real-time updates via `append` and `updateLast` helpers for live candles.
- Responsive canvas sizing with `ResizeObserver`, HiDPI pixel ratio support, and manual `resize()` fallback.
- Performance metrics via `getPerfMetrics()` (avg/max/last redraw and heap telemetry where available).
- Development demo page served from `public/`, including dataset benchmark mode and theme presets.

## API Snapshot

```ts
const chart = new NexusCharts({
  canvasId: "canvas",
  autoResize: true
});
await chart.waitUntilReady();

const series = chart.createSeries({ type: "candlestick" });
series.setData([
  { time: 1, open: 100, high: 105, low: 98, close: 103 }
]);

chart.addDrawing({
  type: "line",
  points: [{ x: -0.8, y: -0.2 }, { x: 0.7, y: 0.4 }]
});

chart.configureAnalytics({ showHeatmap: true, showRewardCurve: true, showPnlCurve: true });
chart.setObserverFrames([
  { time: 1, reward: 0.35, pnl: 0.35, action: "buy", confidence: 0.72, x: -0.7, y: 0.5 }
]);

chart.configureUi({
  showAxes: true,
  showCrosshair: true,
  showTooltip: true,
  showControlBar: true,
  tooltipMode: "follow",
  persistState: true,
  autoScaleY: true
});

chart.addIndicator({ type: "sma", period: 10, color: "#fbbf24" });
chart.addIndicator({ type: "ema", period: 21, color: "#7dd3fc" });
chart.addIndicator({ type: "rsi", period: 14, pane: "lower", color: "#a78bfa" });

chart.applyTheme({
  candles: { up: "#22c55e", down: "#fb7185" },
  controls: { toggleActiveFill: "rgba(18, 74, 122, 0.92)" }
});

chart.resize();

const ui = chart.getUiState();
console.log(ui.showCrosshair, ui.showHeatmap);
```

## Technology Stack

| Layer | Technology |
|---|---|
| Core Engine | C++20 -> WebAssembly (Emscripten) |
| Rendering | WebGL 2.0 (GLES 3.0) |
| Wrapper API | TypeScript (strict mode) |
| Build | CMake, Emscripten, Rollup |

## Repository Structure

```text
nexuscharts/
|-- src/
|   |-- core/                  # Data and processing components
|   |-- graphics/              # Rendering engine and shader pipeline
|   |-- math/                  # Camera and transform utilities
|   `-- main.cpp               # Emscripten entry point and bindings
|-- ts-src/
|   `-- index.ts               # TypeScript wrapper
|-- public/
|   |-- index.html             # Demo page
|   `-- wasm/                  # Generated WASM artifacts (ignored in git)
|-- CMakeLists.txt
|-- rollup.config.js
|-- tsconfig.json
`-- package.json
```

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [CMake](https://cmake.org/) 3.20+
- [Emscripten SDK](https://emscripten.org/docs/getting_started/downloads.html)

## Build and Run

```bash
git clone https://github.com/rcpztrrk/nexuscharts.git
cd nexuscharts
npm install
npm run build
npm run dev
```

On Windows PowerShell systems with restricted script execution, run npm commands through `cmd /c`:

```powershell
cmd /c npm run build
cmd /c npm run dev
```

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).



