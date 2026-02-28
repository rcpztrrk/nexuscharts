#include "rendering_engine.h"
#include <iostream>
#include <GLES3/gl3.h> // WebGL 2.0 headers via Emscripten

RenderingEngine::RenderingEngine() {
    std::cout << "[NexusCharts] Rendering Engine initialized." << std::endl;
}

void RenderingEngine::Render() {
    // Phase 1 Test: Clear the screen with a bright RED to confirm it works!
    glClearColor(1.0f, 0.0f, 0.0f, 1.0f); 
    glClear(GL_COLOR_BUFFER_BIT);
}
