#include <iostream>
#include <algorithm>
#include <cmath>
#include <string>
#include <vector>
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
EMSCRIPTEN_WEBGL_CONTEXT_HANDLE g_webglContext = 0;
bool g_engineInitialized = false;

namespace {

float SanitizeFiniteFloat(double value, float fallback = 0.0f) {
    if (std::isfinite(value)) {
        return static_cast<float>(value);
    }
    return fallback;
}

double SanitizeFiniteDouble(double value, double fallback = 0.0) {
    if (std::isfinite(value)) {
        return value;
    }
    return fallback;
}

int ClampActionCode(int actionCode) {
    if (actionCode < -1) return -1;
    if (actionCode > 1) return 1;
    return actionCode;
}

} // namespace

// Main loop for Emscripten (called every frame like requestAnimationFrame)
void MainLoop() {
    if (g_camera) {
        g_camera->Update();
    }
    if (g_renderingEngine) {
        g_renderingEngine->Render();
    }
}

void PanCamera(float deltaX, float deltaY) {
    if (g_camera) {
        g_camera->Pan(deltaX, deltaY);
    }
}

void ZoomCamera(float zoomFactor) {
    if (g_camera) {
        g_camera->Zoom(zoomFactor);
    }
}

void SetSeriesData(val opens, val highs, val lows, val closes) {
    if (g_dataManager == nullptr) {
        std::cerr << "[NexusCharts:WASM] setSeriesData called before DataManager initialization." << std::endl;
        return;
    }

    const int opensLength = opens["length"].as<int>();
    const int highsLength = highs["length"].as<int>();
    const int lowsLength = lows["length"].as<int>();
    const int closesLength = closes["length"].as<int>();

    if (opensLength != highsLength || opensLength != lowsLength || opensLength != closesLength) {
        std::cerr << "[NexusCharts:WASM] setSeriesData length mismatch. Ignoring update." << std::endl;
        return;
    }

    if (opensLength <= 0) {
        g_dataManager->ClearCandles();
        return;
    }

    std::vector<DataManager::Candle> candles;
    candles.reserve(static_cast<std::size_t>(opensLength));

    for (int i = 0; i < opensLength; ++i) {
        const float open = static_cast<float>(opens[i].as<double>());
        const float highRaw = static_cast<float>(highs[i].as<double>());
        const float lowRaw = static_cast<float>(lows[i].as<double>());
        const float close = static_cast<float>(closes[i].as<double>());

        const float high = std::max({highRaw, open, close, lowRaw});
        const float low = std::min({lowRaw, open, close, highRaw});
        candles.push_back({open, high, low, close});
    }

    g_dataManager->SetCandles(candles);
}

void PushObserverFrame(
    double time,
    double reward,
    double pnl,
    double confidence,
    int actionCode,
    double x,
    double y
) {
    if (g_dataManager == nullptr) {
        std::cerr << "[NexusCharts:WASM] pushObserverFrame called before DataManager initialization." << std::endl;
        return;
    }

    DataManager::ObserverFrame frame = {
        SanitizeFiniteDouble(time, 0.0),
        SanitizeFiniteFloat(reward, 0.0f),
        SanitizeFiniteFloat(pnl, 0.0f),
        std::clamp(SanitizeFiniteFloat(confidence, 0.0f), 0.0f, 1.0f),
        ClampActionCode(actionCode),
        std::clamp(SanitizeFiniteFloat(x, 0.0f), -1.0f, 1.0f),
        std::clamp(SanitizeFiniteFloat(y, 0.0f), -1.0f, 1.0f)
    };

    g_dataManager->PushObserverFrame(frame);
}

void ClearObserverFrames() {
    if (g_dataManager == nullptr) {
        std::cerr << "[NexusCharts:WASM] clearObserverFrames called before DataManager initialization." << std::endl;
        return;
    }
    g_dataManager->ClearObserverFrames();
}

int GetObserverFrameCount() {
    if (g_dataManager == nullptr) {
        return 0;
    }
    return static_cast<int>(g_dataManager->GetObserverFrameCount());
}

double GetObserverLastReward() {
    if (g_dataManager == nullptr) {
        return 0.0;
    }
    return static_cast<double>(g_dataManager->GetLastObserverReward());
}

double GetObserverLastPnl() {
    if (g_dataManager == nullptr) {
        return 0.0;
    }
    return static_cast<double>(g_dataManager->GetLastObserverPnl());
}

double GetObserverAverageReward(int window) {
    if (g_dataManager == nullptr) {
        return 0.0;
    }
    const std::size_t sanitizedWindow = (window > 0) ? static_cast<std::size_t>(window) : 0;
    return static_cast<double>(g_dataManager->GetAverageObserverReward(sanitizedWindow));
}

// Initialization function callable from JS
bool InitEngine(std::string canvasSelector, int width, int height) {
    if (g_engineInitialized) {
        std::cout << "[NexusCharts:WASM] Engine is already initialized. Skipping duplicate init." << std::endl;
        return true;
    }

    if (canvasSelector.empty()) {
        std::cerr << "[NexusCharts:WASM] ERROR: canvas selector cannot be empty." << std::endl;
        return false;
    }

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

    // Target the canvas element selector provided by JS wrapper.
    g_webglContext = emscripten_webgl_create_context(canvasSelector.c_str(), &attrs);
    if (g_webglContext <= 0) {
        std::cerr << "[NexusCharts:WASM] ERROR: Failed to create WebGL2 context! Code: " << g_webglContext << std::endl;
        g_webglContext = 0;
        return false;
    }
    emscripten_webgl_make_context_current(g_webglContext);
    std::cout << "[NexusCharts:WASM] WebGL 2.0 context created successfully." << std::endl;

    int targetWidth = width;
    int targetHeight = height;

    // Set canvas size if values are provided from JS API.
    if (width > 0 && height > 0) {
        emscripten_set_canvas_element_size(canvasSelector.c_str(), width, height);
    } else {
        targetWidth = 800;
        targetHeight = 600;
        emscripten_get_canvas_element_size(canvasSelector.c_str(), &targetWidth, &targetHeight);
    }

    // --- Step 2: Initialize Engine Components ---
    g_dataManager = new DataManager();
    g_camera = new Camera();
    g_camera->SetViewport(targetWidth, targetHeight);

    g_renderingEngine = new RenderingEngine(targetWidth, targetHeight);
    g_renderingEngine->SetCamera(g_camera);
    g_renderingEngine->SetDataManager(g_dataManager);
    g_renderingEngine->SetViewportSize(targetWidth, targetHeight);

    // --- Step 3: Start the render loop ---
    // 0 fps = use requestAnimationFrame, 0 = don't simulate infinite loop (let browser breathe)
    emscripten_set_main_loop(MainLoop, 0, 0);

    g_engineInitialized = true;
    std::cout << "[NexusCharts:WASM] Engine initialized successfully!" << std::endl;
    return true;
}

// Cleanup function callable from JS
void DestroyEngine() {
    if (!g_engineInitialized) {
        std::cout << "[NexusCharts:WASM] Destroy requested but engine is not initialized. Skipping." << std::endl;
        return;
    }

    std::cout << "[NexusCharts:WASM] Destroying engine..." << std::endl;

    emscripten_cancel_main_loop();

    delete g_dataManager;
    delete g_renderingEngine;
    delete g_camera;
    g_dataManager = nullptr;
    g_renderingEngine = nullptr;
    g_camera = nullptr;

    if (g_webglContext > 0) {
        emscripten_webgl_destroy_context(g_webglContext);
        g_webglContext = 0;
    }

    g_engineInitialized = false;
}

// Bindings to expose functions to JavaScript
EMSCRIPTEN_BINDINGS(nexus_charts_module) {
    function("initEngine", &InitEngine);
    function("destroyEngine", &DestroyEngine);
    function("panCamera", &PanCamera);
    function("zoomCamera", &ZoomCamera);
    function("setSeriesData", &SetSeriesData);
    function("pushObserverFrame", &PushObserverFrame);
    function("clearObserverFrames", &ClearObserverFrames);
    function("getObserverFrameCount", &GetObserverFrameCount);
    function("getObserverLastReward", &GetObserverLastReward);
    function("getObserverLastPnl", &GetObserverLastPnl);
    function("getObserverAverageReward", &GetObserverAverageReward);
}

int main() {
    std::cout << "[NexusCharts:WASM] WASM module loaded. Awaiting JS initialization..." << std::endl;
    return 0;
}
