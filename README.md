# NexusCharts

NexusCharts is a financial charting engine built with a C++ core compiled to WebAssembly and rendered with WebGL 2.0.
The project focuses on high-throughput candlestick rendering and a TypeScript-first integration layer for browser applications.

## Project Status

- Phase 1 completed: WebAssembly runtime, WebGL2 context, render loop, and integration baseline.
- Phase 2 completed: candlestick body and wick rendering with instancing, plus 2D camera matrix integration.
- Phase 3 completed: mouse drag pan and wheel zoom interaction from TypeScript to WASM camera controls.
- Phase 4 completed: public API surface, drawing overlay layer, and WASM series data bridge (`createSeries().setData()`).
- Phase 5 completed: observer analytics overlay, WASM observer stream bridge, and live metrics readback.
- Phase 6 completed: chart UX foundation (axes, crosshair axis labels, tooltip modes, candle selection/navigation, control bar, and keyboard shortcuts).
- Phase 7 completed: technical indicators and multi-pane composition layer.
- Phase 8 completed: drawing tools with hit-testing, drag/resize, and context actions.
- Phase 9 completed: time/price anchoring for drawings and tooltips.
- Phase 12 completed: realtime updates (append/update last candle) + perf instrumentation.
- Phase 13 in progress: large dataset performance tuning and optimization.

## Core Capabilities

- C++20 engine compiled to WebAssembly via Emscripten.
- WebGL 2.0 rendering pipeline using GPU instancing.
- TypeScript wrapper that bootstraps and controls the WASM module.
- Public chart API for series and drawing management.
- Observer analytics API (`setObserverFrames`, `pushObserverFrame`, `configureAnalytics`).
- UI control API (`configureUi`, `getUiState`) with in-chart control bar and keyboard shortcuts.
- Interactive chart UX: hover crosshair, OHLC tooltip, candle selection, fit-to-data, and pointer-anchored zoom.
- Dynamic axis labeling with visible-window time labels and nice-stepped price ticks.
- Optional Y-axis auto-scale for the visible window (autoScaleY).
- Persistent UI preferences (`localStorage`) and tooltip mode switching (`follow` / `fixed`).
- Indicator engine (SMA/EMA/RSI) with a secondary pane overlay.
- Real-time updates via `append` and `updateLast` helpers for live candles.
- Performance metrics via `getPerfMetrics()` (avg/max/last redraw and heap telemetry where available).
- Development demo page served from `public/`.

## API Snapshot

```ts
const chart = new NexusCharts({ canvasId: "canvas" });
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

## Development Roadmap

- [x] Phase 1: Runtime and context bootstrap
- [x] Phase 2: Candlestick pipeline completion (wicks, camera integration)
- [x] Phase 3: Interactive pan and zoom
- [x] Phase 4: Developer Open API and package publishing
- [x] Phase 5: RL analytics view: real-time agent decision heatmaps, reward/P&L curves, and WASM-based observer data stream.
- [x] Phase 6: Chart UX refinement: polished time scale labels, crosshair axis labels, tooltip modes, and navigation ergonomics.
- [x] **Phase 7:** Indicator and pane engine: moving averages/oscillators, secondary panes, and synchronized scales.
- [x] Phase 8: Multi-series rendering (line/area/histogram) + volume histogram support.
- [x] Phase 9: Multi-pane layout with synchronized crosshair and independent scales.
- [x] Phase 10: Drawing tools (trend/fib/box/hline) with drag/resize + hit-testing.
- [x] Phase 11: Time/price anchoring for drawings and tooltips (not only normalized screen space).
- [x] Phase 12: Real-time updates (append candle, update last candle) + perf instrumentation.
- [ ] Phase 13: Large dataset performance tuning + GC/memory optimization.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).



