#include <iostream>
#include <emscripten.h>
#include <emscripten/bind.h>
#include <emscripten/html5.h>
#include <GLES3/gl3.h>

#include "core/data_manager.h"
#include "graphics/rendering_engine.h"
#include "math/camera.h"

using namespace emscripten;

// Global engine instances
DataManager* g_dataManager = nullptr;
RenderingEngine* g_renderingEngine = nullptr;
Camera* g_camera = nullptr;

// Main loop for Emscripten (called every frame like requestAnimationFrame)
void MainLoop() {
    if (g_renderingEngine) {
        g_renderingEngine->Render();
    }
}

// Initialization function callable from JS
bool InitEngine() {
    std::cout << "[NexusCharts:WASM] Engine is initializing..." << std::endl;

    // --- Step 1: Create WebGL 2.0 Context ---
    EmscriptenWebGLContextAttributes attrs;
    emscripten_webgl_init_context_attributes(&attrs);
    attrs.majorVersion = 2; // WebGL 2.0
    attrs.minorVersion = 0;
    attrs.alpha = 0;
    attrs.depth = 1;
    attrs.stencil = 0;
    attrs.antialias = 1;

    // Target the canvas element with id "canvas"
    EMSCRIPTEN_WEBGL_CONTEXT_HANDLE ctx = emscripten_webgl_create_context("#canvas", &attrs);
    if (ctx <= 0) {
        std::cerr << "[NexusCharts:WASM] ERROR: Failed to create WebGL2 context! Code: " << ctx << std::endl;
        return false;
    }
    emscripten_webgl_make_context_current(ctx);
    std::cout << "[NexusCharts:WASM] WebGL 2.0 context created successfully." << std::endl;

    // Set canvas size
    emscripten_set_canvas_element_size("#canvas", 800, 600);

    // --- Step 2: Initialize Engine Components ---
    g_dataManager = new DataManager();
    g_renderingEngine = new RenderingEngine();
    g_camera = new Camera();

    // --- Step 3: Start the render loop ---
    // 0 fps = use requestAnimationFrame, 0 = don't simulate infinite loop (let browser breathe)
    emscripten_set_main_loop(MainLoop, 0, 0);

    std::cout << "[NexusCharts:WASM] Engine initialized successfully!" << std::endl;
    return true;
}

// Cleanup function callable from JS
void DestroyEngine() {
    std::cout << "[NexusCharts:WASM] Destroying engine..." << std::endl;

    emscripten_cancel_main_loop();

    delete g_dataManager;
    delete g_renderingEngine;
    delete g_camera;
}

// Bindings to expose functions to JavaScript
EMSCRIPTEN_BINDINGS(nexus_charts_module) {
    function("initEngine", &InitEngine);
    function("destroyEngine", &DestroyEngine);
}

int main() {
    std::cout << "[NexusCharts:WASM] WASM module loaded. Awaiting JS initialization..." << std::endl;
    return 0;
}
