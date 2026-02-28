# 📈 NexusCharts

**Blazing-fast financial charting library powered by WebGL 2.0 and WebAssembly.**

NexusCharts aims to render millions of candlesticks at 60 FPS using a C++ core compiled to WebAssembly, with GPU-accelerated Instanced Rendering via WebGL 2.0. Designed to surpass TradingView's `lightweight-charts` in both performance and extensibility.

![Phase 1 - WebGL Clear Color](https://img.shields.io/badge/Phase_1-Complete-brightgreen)
![License](https://img.shields.io/badge/License-MIT-blue)

## 🚀 Features (Planned)

- **Extreme Performance:** C++ data processing compiled to WASM + GPU rendering via WebGL 2.0 Instanced Rendering.
- **Extensible API:** TypeScript API for custom drawing tools (Fibonacci, Trend Lines, Pitchfork).
- **Plug & Play:** Install via NPM and integrate with React, Vue, or Vanilla JS in seconds.
- **1M+ Data Points:** Pan and zoom through massive datasets without dropping below 60 FPS.

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| **Core Engine** | C++20 → WebAssembly (Emscripten) |
| **Rendering** | WebGL 2.0 (GLES 3.0) |
| **API / Wrapper** | TypeScript (Strict Mode) |
| **Build** | CMake + Emscripten, Rollup |

## 📦 Project Structure

```
nexuscharts/
├── src/                    # C++ Core Engine
│   ├── core/               # Data management (WASM)
│   ├── graphics/           # WebGL rendering engine
│   ├── math/               # Camera, projections, transforms
│   └── main.cpp            # Emscripten entry point & bindings
├── ts-src/                 # TypeScript API Bridge
│   └── index.ts            # NexusCharts class
├── public/                 # Dev server & test page
│   ├── index.html          # Test canvas
│   └── wasm/               # Compiled WASM output (gitignored)
├── CMakeLists.txt          # C++ build config (Emscripten)
├── rollup.config.js        # TypeScript bundler
├── tsconfig.json           # TypeScript config
└── package.json            # NPM scripts & deps
```

## 🏗 Getting Started

### Prerequisites

- [Emscripten SDK](https://emscripten.org/docs/getting_started/downloads.html)
- [Node.js](https://nodejs.org/) (v18+)
- [CMake](https://cmake.org/) (v3.20+)

### Setup

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/nexuscharts.git
cd nexuscharts

# Install Emscripten SDK
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk && ./emsdk install latest && ./emsdk activate latest && cd ..

# Install JS dependencies
npm install

# Build WASM + TypeScript
npm run build

# Start dev server
npm run dev
```

## 🗺 Roadmap

- [x] **Phase 1:** Hello Triangle — Emscripten setup, WebGL2 context, first clear color render.
- [ ] **Phase 2:** Render The Ticks — 2D Camera, Candlestick shader, Instanced Rendering.
- [ ] **Phase 3:** Pan & Zoom — Mouse events → C++ camera matrix, Y-axis auto-scaling.
- [ ] **Phase 4:** Developer Open API — `addDrawing()`, `createSeries()`, NPM publish.

## 📄 License

[MIT](LICENSE)
