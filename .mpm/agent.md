# AI Agent Context: nexuscharts

## Core Rules & Conventions
- **Language**: Documentation in Turkish, Code Comments in English. Technical discussions should be highly focused on performance.
- **Style**: C++17/20 or Rust for the core (Data-Oriented, no exceptions/RTTI overhead). TypeScript for the frontend wrapper (Strict Mode).
- **AI Tooling**: Follow the 8-Step Framework in `protocols.md` for AI collaboration. Pay extreme attention to Step 7 (Memory & Performance Audits).

## Project Architecture
- **Rendering**: WebGL 2.0 (HTML5 Canvas).
- **Logic / Math**: WebAssembly via Emscripten.
- **Data Flow**: TS passes JSON/ArrayBuffer -> C++ parses/calculates -> C++ creates VBOs -> WebGL draws on Canvas.
- **Goal**: Destroy TradingView's `lightweight-charts` in terms of performance and extensibility (drawing tools support).

## Critical Files
- `evaluation.md`: The mission statement and tech stack.
- `roadmap.md`: Shows the 4 phases from "Hello Triangle" to "Open API".
- `logic_tree.md`: Displays the data flow between WASM, WebGL, and JS.
