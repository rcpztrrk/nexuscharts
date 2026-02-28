cmake_minimum_required(VERSION 3.20)
project(NexusCharts VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Ensure we are building with Emscripten
if(NOT EMSCRIPTEN)
    message(WARNING "Emscripten not detected. Make sure to use emcmake.")
endif()

# Core library
add_library(nexuscharts_core STATIC
    src/core/data_manager.cpp
    src/graphics/rendering_engine.cpp
    src/math/camera.cpp
)

target_include_directories(nexuscharts_core PUBLIC
    $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/src>
)

# WASM executable/module bridging
add_executable(nexuscharts_wasm src/main.cpp)

target_link_libraries(nexuscharts_wasm PRIVATE nexuscharts_core)

# Emscripten specific flags for performance and API
set(EMSCRIPTEN_LINK_FLAGS
    "-O3"                                 # Maximum optimization
    "-s WASM=1"                           # Output WebAssembly
    "-s NO_EXIT_RUNTIME=1"                # Keep WASM module alive after main()
    "-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','getValue','setValue']"
    "-s EXPORTED_FUNCTIONS=['_main','_malloc','_free']" # Must export malloc/free for data bridge
    "-s ALLOW_MEMORY_GROWTH=1"            # Allow heap to grow
    "-s MAXIMUM_MEMORY=4GB"               # Set max memory limit if growth is allowed
    "-s USE_WEBGL2=1"                     # Use WebGL 2
    "-s FULL_ES3=1"                       # WebGL 2 Full ES3
    "-s MIN_WEBGL_VERSION=2"              # Require WebGL 2 minimum
    "-s MAX_WEBGL_VERSION=2"              # Stick to WebGL 2
    "-s ENVIRONMENT=web,worker"           # Target web environments
    "--bind"                              # Use Embind
)

# Join the flags into a single string
string(REPLACE ";" " " EMSCRIPTEN_LINK_FLAGS_STR "${EMSCRIPTEN_LINK_FLAGS}")

set_target_properties(nexuscharts_wasm PROPERTIES
    LINK_FLAGS "${EMSCRIPTEN_LINK_FLAGS_STR}"
    OUTPUT_NAME "nexuscharts"
    SUFFIX ".js" # Emscripten will generate nexuscharts.js and nexuscharts.wasm
)

# Copy output to public/wasm
add_custom_command(TARGET nexuscharts_wasm POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy
        ${CMAKE_CURRENT_BINARY_DIR}/nexuscharts.js
        ${CMAKE_CURRENT_SOURCE_DIR}/public/wasm/nexuscharts.js
    COMMAND ${CMAKE_COMMAND} -E copy
        ${CMAKE_CURRENT_BINARY_DIR}/nexuscharts.wasm
        ${CMAKE_CURRENT_SOURCE_DIR}/public/wasm/nexuscharts.wasm
)
