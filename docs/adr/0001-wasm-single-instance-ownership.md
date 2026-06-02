# ADR 0001: WASM Single-Instance Ownership

## Status

Accepted

## Date

2026-06-02

## Context

NexusCharts currently boots an Emscripten-generated runtime through a shared `window.Module` object and a cached WASM load promise. The C++ side also owns process-level engine state for the data manager, renderer, camera, WebGL context, canvas selector, and initialization flag.

That shape is efficient for the current demo and package use case, but it means two active chart instances cannot safely own separate WebGL canvases at the same time. Without an explicit guard, a second chart can appear to initialize while still sharing the first chart's WASM runtime and C++ globals.

## Decision

NexusCharts supports one active WASM/WebGL chart instance at a time.

Applications should create one `NexusCharts` instance, call `destroy()` before mounting another instance on a different canvas, and avoid concurrent active charts until the WASM runtime is redesigned for multi-instance ownership.

The JavaScript WASM bridge enforces this decision by tracking the active bridge and canvas id. Re-initializing the same bridge for the same canvas is idempotent. Initializing another bridge, or reusing the same bridge for a different canvas before `destroy()`, is rejected.

## Consequences

- The runtime behavior is explicit instead of silently sharing global engine state.
- Single-chart applications keep the current fast startup and cached WASM runtime path.
- Multi-chart dashboards must serialize chart ownership or wait for multi-instance support.
- Tests and documentation can treat concurrent chart initialization as unsupported by design.

## Path To Multi-Instance Support

A future multi-instance implementation should avoid shared mutable engine state:

- Replace C++ globals with an engine-instance registry or Embind-owned instance objects.
- Scope WebGL context, camera, renderer, and data manager to each chart.
- Avoid assigning all runtimes to a single `window.Module` object, or provide a runtime factory that can bind a canvas per instance.
- Decide whether WASM binary compilation stays shared while engine state is per instance.
- Add browser-level tests with two canvases rendering different data at the same time.
