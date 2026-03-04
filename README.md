# NexusCharts

NexusCharts is a financial charting engine built with a C++ core compiled to WebAssembly and rendered with WebGL 2.0.
The project focuses on high-throughput candlestick rendering and a TypeScript-first integration layer for browser applications.

## Project Status

- Phase 1 completed: WebAssembly runtime, WebGL2 context, render loop, and integration baseline.
- Phase 2 completed: candlestick body and wick rendering with instancing, plus 2D camera matrix integration.
- Phase 3 completed: mouse drag pan and wheel zoom interaction from TypeScript to WASM camera controls.
- Phase 4 completed: public API surface, drawing overlay layer, and WASM series data bridge (`createSeries().setData()`).

## Core Capabilities

- C++20 engine compiled to WebAssembly via Emscripten.
- WebGL 2.0 rendering pipeline using GPU instancing.
- TypeScript wrapper that bootstraps and controls the WASM module.
- Public chart API for series and drawing management.
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
- [ ] **Phase 5:** RL analytics view: real-time agent decision heatmaps, reward/P&L curves, and WASM-based observer data stream.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
