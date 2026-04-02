#include "rendering_engine.h"

#include "core/data_manager.h"
#include "math/camera.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <iostream>
#include <limits>
#include <vector>

namespace {

struct CandleOhlc {
    float x;
    float open;
    float high;
    float low;
    float close;
};

struct RenderInstance {
    float x;
    float y0;
    float y1;
    float halfWidth;
    float colorR;
    float colorG;
    float colorB;
};

constexpr const char* kVertexShaderSource = R"(#version 300 es
precision highp float;

in vec2 aVertex;
in float aX;
in float aY0;
in float aY1;
in float aHalfWidth;
in vec3 aColor;

uniform mat4 uViewProj;

out vec3 vColor;

void main() {
    float yBottom = min(aY0, aY1);
    float yTop = max(aY0, aY1);
    float yT = (aVertex.y * 0.5) + 0.5;

    vec2 worldPos = vec2(
        aX + (aVertex.x * aHalfWidth),
        mix(yBottom, yTop, yT)
    );

    gl_Position = uViewProj * vec4(worldPos, 0.0, 1.0);
    vColor = aColor;
}
)";

constexpr const char* kFragmentShaderSource = R"(#version 300 es
precision mediump float;

in vec3 vColor;
out vec4 fragColor;

void main() {
    fragColor = vec4(vColor, 1.0);
}
)";

GLuint CompileShader(GLenum shaderType, const char* source) {
    const GLuint shader = glCreateShader(shaderType);
    glShaderSource(shader, 1, &source, nullptr);
    glCompileShader(shader);

    GLint compileStatus = GL_FALSE;
    glGetShaderiv(shader, GL_COMPILE_STATUS, &compileStatus);
    if (compileStatus == GL_TRUE) {
        return shader;
    }

    GLint logLength = 0;
    glGetShaderiv(shader, GL_INFO_LOG_LENGTH, &logLength);
    std::vector<char> infoLog(static_cast<size_t>(std::max(logLength, 1)));
    glGetShaderInfoLog(shader, logLength, nullptr, infoLog.data());
    std::cerr << "[NexusCharts] Shader compilation failed: " << infoLog.data() << std::endl;

    glDeleteShader(shader);
    return 0;
}

GLuint CreateProgram(const char* vertexSource, const char* fragmentSource) {
    const GLuint vertexShader = CompileShader(GL_VERTEX_SHADER, vertexSource);
    const GLuint fragmentShader = CompileShader(GL_FRAGMENT_SHADER, fragmentSource);
    if (vertexShader == 0 || fragmentShader == 0) {
        if (vertexShader != 0) {
            glDeleteShader(vertexShader);
        }
        if (fragmentShader != 0) {
            glDeleteShader(fragmentShader);
        }
        return 0;
    }

    const GLuint program = glCreateProgram();
    glAttachShader(program, vertexShader);
    glAttachShader(program, fragmentShader);
    glLinkProgram(program);

    glDeleteShader(vertexShader);
    glDeleteShader(fragmentShader);

    GLint linkStatus = GL_FALSE;
    glGetProgramiv(program, GL_LINK_STATUS, &linkStatus);
    if (linkStatus == GL_TRUE) {
        return program;
    }

    GLint logLength = 0;
    glGetProgramiv(program, GL_INFO_LOG_LENGTH, &logLength);
    std::vector<char> infoLog(static_cast<size_t>(std::max(logLength, 1)));
    glGetProgramInfoLog(program, logLength, nullptr, infoLog.data());
    std::cerr << "[NexusCharts] Program linking failed: " << infoLog.data() << std::endl;

    glDeleteProgram(program);
    return 0;
}

std::vector<CandleOhlc> BuildSampleCandles() {
    constexpr int kCandleCount = 40;
    constexpr float kStartX = -0.92f;
    constexpr float kStep = 1.84f / static_cast<float>(kCandleCount - 1);

    std::vector<CandleOhlc> candles;
    candles.reserve(kCandleCount);

    float previousClose = -0.45f;
    for (int i = 0; i < kCandleCount; ++i) {
        const float wave = std::sin(static_cast<float>(i) * 0.52f) * 0.24f;
        const float pull = std::cos(static_cast<float>(i) * 0.21f) * 0.10f;
        const float open = previousClose;
        float close = open + wave + pull;
        close = std::clamp(close, -0.85f, 0.85f);

        const float minBody = 0.05f;
        if (std::abs(close - open) < minBody) {
            close = std::clamp(open + ((close >= open) ? minBody : -minBody), -0.85f, 0.85f);
        }

        const float wickTop = std::clamp(
            std::max(open, close) + 0.05f + std::abs(std::sin(static_cast<float>(i) * 0.31f)) * 0.06f,
            -0.95f,
            0.95f
        );
        const float wickBottom = std::clamp(
            std::min(open, close) - 0.05f - std::abs(std::cos(static_cast<float>(i) * 0.27f)) * 0.06f,
            -0.95f,
            0.95f
        );

        candles.push_back({
            kStartX + (kStep * static_cast<float>(i)),
            open,
            wickTop,
            wickBottom,
            close
        });
        previousClose = close;
    }

    return candles;
}

std::vector<CandleOhlc> BuildCandlesFromDataManager(const DataManager* dataManager) {
    if (dataManager == nullptr) {
        return BuildSampleCandles();
    }

    const std::vector<DataManager::Candle>& source = dataManager->GetCandles();
    if (source.empty()) {
        // Show sample data before the first external data push.
        if (dataManager->GetRevision() == 0) {
            return BuildSampleCandles();
        }
        return {};
    }

    float minLow = std::numeric_limits<float>::max();
    float maxHigh = std::numeric_limits<float>::lowest();
    std::size_t validCount = 0;

    for (const DataManager::Candle& candle : source) {
        const float low = std::min({candle.low, candle.open, candle.close, candle.high});
        const float high = std::max({candle.high, candle.open, candle.close, candle.low});
        if (!std::isfinite(low) || !std::isfinite(high)) {
            continue;
        }
        minLow = std::min(minLow, low);
        maxHigh = std::max(maxHigh, high);
        ++validCount;
    }

    if (validCount == 0) {
        return {};
    }

    const float range = std::max(maxHigh - minLow, 1e-5f);
    const float scale = 1.7f / range; // maps to roughly [-0.85, 0.85]
    const auto normalizeY = [minLow, scale](float value) -> float {
        return ((value - minLow) * scale) - 0.85f;
    };

    const float startX = -0.92f;
    const float stepX = (validCount > 1) ? (1.84f / static_cast<float>(validCount - 1)) : 0.0f;

    std::vector<CandleOhlc> output;
    output.reserve(validCount);

    std::size_t outputIndex = 0;
    for (const DataManager::Candle& candle : source) {
        const float low = std::min({candle.low, candle.open, candle.close, candle.high});
        const float high = std::max({candle.high, candle.open, candle.close, candle.low});
        if (!std::isfinite(low) || !std::isfinite(high)) {
            continue;
        }

        output.push_back({
            startX + (stepX * static_cast<float>(outputIndex)),
            normalizeY(candle.open),
            normalizeY(high),
            normalizeY(low),
            normalizeY(candle.close)
        });
        ++outputIndex;
    }

    return output;
}

void BuildRenderInstances(
    const std::vector<CandleOhlc>& ohlc,
    std::vector<RenderInstance>* bodyInstances,
    std::vector<RenderInstance>* wickInstances
) {
    constexpr float kBodyHalfWidth = 0.020f;
    constexpr float kWickHalfWidth = 0.004f;

    bodyInstances->clear();
    wickInstances->clear();
    bodyInstances->reserve(ohlc.size());
    wickInstances->reserve(ohlc.size());

    for (const CandleOhlc& candle : ohlc) {
        const bool isUp = candle.close >= candle.open;

        bodyInstances->push_back({
            candle.x,
            candle.open,
            candle.close,
            kBodyHalfWidth,
            isUp ? 0.18f : 0.92f,
            isUp ? 0.80f : 0.28f,
            isUp ? 0.34f : 0.30f
        });

        wickInstances->push_back({
            candle.x,
            candle.low,
            candle.high,
            kWickHalfWidth,
            0.78f,
            0.82f,
            0.90f
        });
    }
}

void UploadInstances(GLuint instanceVbo, const std::vector<RenderInstance>& instances, GLsizei* outCount) {
    glBindBuffer(GL_ARRAY_BUFFER, instanceVbo);
    glBufferData(
        GL_ARRAY_BUFFER,
        static_cast<GLsizeiptr>(instances.size() * sizeof(RenderInstance)),
        instances.empty() ? nullptr : instances.data(),
        GL_DYNAMIC_DRAW
    );
    *outCount = static_cast<GLsizei>(instances.size());
}

struct VisibleRange {
    int start = 0;
    int end = -1;
};

VisibleRange ComputeVisibleRange(const Camera* camera, int viewportWidth, int viewportHeight, int candleCount) {
    if (candleCount <= 0) {
        return {};
    }
    if (candleCount == 1) {
        return {0, 0};
    }

    // If camera is missing, render everything.
    if (camera == nullptr) {
        return {0, candleCount - 1};
    }

    const float centerX = camera->GetCenterX();
    const float halfWidth = camera->GetZoomX();
    const float left = centerX - halfWidth;
    const float right = centerX + halfWidth;

    constexpr float kStartX = -0.92f;
    constexpr float kSpanX = 1.84f;
    const float stepX = kSpanX / static_cast<float>(candleCount - 1);
    if (std::abs(stepX) < 1e-8f) {
        return {0, candleCount - 1};
    }

    constexpr int kPadding = 6;
    const int rawStart = static_cast<int>(std::floor((left - kStartX) / stepX)) - kPadding;
    const int rawEnd = static_cast<int>(std::ceil((right - kStartX) / stepX)) + kPadding;
    const int start = std::max(0, std::min(candleCount - 1, rawStart));
    const int end = std::max(0, std::min(candleCount - 1, rawEnd));
    if (start > end) {
        return {0, -1};
    }
    return {start, end};
}

void BuildRenderInstancesRange(
    const std::vector<CandleOhlc>& ohlc,
    const VisibleRange& range,
    std::vector<RenderInstance>* bodyInstances,
    std::vector<RenderInstance>* wickInstances
) {
    constexpr float kBodyHalfWidth = 0.020f;
    constexpr float kWickHalfWidth = 0.004f;

    bodyInstances->clear();
    wickInstances->clear();
    if (range.end < range.start) {
        return;
    }

    const int count = static_cast<int>(ohlc.size());
    const int start = std::max(0, std::min(count - 1, range.start));
    const int end = std::max(0, std::min(count - 1, range.end));
    const int span = std::max(0, (end - start) + 1);
    bodyInstances->reserve(static_cast<size_t>(span));
    wickInstances->reserve(static_cast<size_t>(span));

    for (int i = start; i <= end; ++i) {
        const CandleOhlc& candle = ohlc[static_cast<size_t>(i)];
        const bool isUp = candle.close >= candle.open;

        bodyInstances->push_back({
            candle.x,
            candle.open,
            candle.close,
            kBodyHalfWidth,
            isUp ? 0.18f : 0.92f,
            isUp ? 0.80f : 0.28f,
            isUp ? 0.34f : 0.30f
        });

        wickInstances->push_back({
            candle.x,
            candle.low,
            candle.high,
            kWickHalfWidth,
            0.78f,
            0.82f,
            0.90f
        });
    }
}

bool BuildWindowedInstancesFromDataManager(
    const DataManager* dataManager,
    const Camera* camera,
    int viewportWidth,
    int viewportHeight,
    std::vector<RenderInstance>* bodyInstances,
    std::vector<RenderInstance>* wickInstances,
    VisibleRange* outRange
) {
    if (dataManager == nullptr) {
        const std::vector<CandleOhlc> sample = BuildSampleCandles();
        const VisibleRange range = ComputeVisibleRange(camera, viewportWidth, viewportHeight, static_cast<int>(sample.size()));
        BuildRenderInstancesRange(sample, range, bodyInstances, wickInstances);
        if (outRange) {
            *outRange = range;
        }
        return true;
    }

    const std::vector<DataManager::Candle>& source = dataManager->GetCandles();
    if (source.empty()) {
        if (dataManager->GetRevision() == 0) {
            const std::vector<CandleOhlc> sample = BuildSampleCandles();
            const VisibleRange range = ComputeVisibleRange(camera, viewportWidth, viewportHeight, static_cast<int>(sample.size()));
            BuildRenderInstancesRange(sample, range, bodyInstances, wickInstances);
            if (outRange) {
                *outRange = range;
            }
            return true;
        }

        bodyInstances->clear();
        wickInstances->clear();
        if (outRange) {
            *outRange = {};
        }
        return true;
    }

    float minLow = std::numeric_limits<float>::max();
    float maxHigh = std::numeric_limits<float>::lowest();
    for (const DataManager::Candle& candle : source) {
        const float low = std::min({candle.low, candle.open, candle.close, candle.high});
        const float high = std::max({candle.high, candle.open, candle.close, candle.low});
        if (!std::isfinite(low) || !std::isfinite(high)) {
            continue;
        }
        minLow = std::min(minLow, low);
        maxHigh = std::max(maxHigh, high);
    }

    if (!std::isfinite(minLow) || !std::isfinite(maxHigh) || maxHigh <= minLow) {
        bodyInstances->clear();
        wickInstances->clear();
        if (outRange) {
            *outRange = {};
        }
        return true;
    }

    const float rangeY = std::max(maxHigh - minLow, 1e-5f);
    const float scaleY = 1.7f / rangeY;
    const auto normalizeY = [minLow, scaleY](float value) -> float {
        return ((value - minLow) * scaleY) - 0.85f;
    };

    const int count = static_cast<int>(source.size());
    const VisibleRange range = ComputeVisibleRange(camera, viewportWidth, viewportHeight, count);
    if (outRange) {
        *outRange = range;
    }

    bodyInstances->clear();
    wickInstances->clear();
    if (range.end < range.start) {
        return true;
    }

    constexpr float kStartX = -0.92f;
    constexpr float kSpanX = 1.84f;
    const float stepX = (count > 1) ? (kSpanX / static_cast<float>(count - 1)) : 0.0f;

    const int span = std::max(0, (range.end - range.start) + 1);
    bodyInstances->reserve(static_cast<size_t>(span));
    wickInstances->reserve(static_cast<size_t>(span));

    constexpr float kBodyHalfWidth = 0.020f;
    constexpr float kWickHalfWidth = 0.004f;

    for (int i = range.start; i <= range.end; ++i) {
        const DataManager::Candle& candle = source[static_cast<size_t>(i)];
        const float open = candle.open;
        const float close = candle.close;
        const float high = std::max({candle.high, candle.open, candle.close, candle.low});
        const float low = std::min({candle.low, candle.open, candle.close, candle.high});
        if (!std::isfinite(open) || !std::isfinite(close) || !std::isfinite(high) || !std::isfinite(low)) {
            continue;
        }

        const float x = kStartX + (stepX * static_cast<float>(i));
        const float nOpen = normalizeY(open);
        const float nClose = normalizeY(close);
        const float nHigh = normalizeY(high);
        const float nLow = normalizeY(low);
        const bool isUp = nClose >= nOpen;

        bodyInstances->push_back({
            x,
            nOpen,
            nClose,
            kBodyHalfWidth,
            isUp ? 0.18f : 0.92f,
            isUp ? 0.80f : 0.28f,
            isUp ? 0.34f : 0.30f
        });

        wickInstances->push_back({
            x,
            nLow,
            nHigh,
            kWickHalfWidth,
            0.78f,
            0.82f,
            0.90f
        });
    }

    return true;
}

std::array<float, 16> BuildIdentityMatrix() {
    return {
        1.0f, 0.0f, 0.0f, 0.0f,
        0.0f, 1.0f, 0.0f, 0.0f,
        0.0f, 0.0f, 1.0f, 0.0f,
        0.0f, 0.0f, 0.0f, 1.0f
    };
}

} // namespace

RenderingEngine::RenderingEngine(int viewportWidth, int viewportHeight) {
    if (viewportWidth > 0) {
        viewportWidth_ = viewportWidth;
    }
    if (viewportHeight > 0) {
        viewportHeight_ = viewportHeight;
    }

    std::cout << "[NexusCharts] Rendering Engine created." << std::endl;
}

RenderingEngine::~RenderingEngine() {
    if (bodyInstanceVbo_ != 0) {
        glDeleteBuffers(1, &bodyInstanceVbo_);
    }
    if (wickInstanceVbo_ != 0) {
        glDeleteBuffers(1, &wickInstanceVbo_);
    }
    if (quadVbo_ != 0) {
        glDeleteBuffers(1, &quadVbo_);
    }
    if (bodyVao_ != 0) {
        glDeleteVertexArrays(1, &bodyVao_);
    }
    if (wickVao_ != 0) {
        glDeleteVertexArrays(1, &wickVao_);
    }
    if (shaderProgram_ != 0) {
        glDeleteProgram(shaderProgram_);
    }
}

void RenderingEngine::SetCamera(const Camera* camera) {
    camera_ = camera;
}

void RenderingEngine::SetDataManager(const DataManager* dataManager) {
    dataManager_ = dataManager;
    hasAppliedDataRevision_ = false;
    hasAppliedVisibleRange_ = false;
}

void RenderingEngine::SetViewportSize(int width, int height) {
    if (width > 0) {
        viewportWidth_ = width;
    }
    if (height > 0) {
        viewportHeight_ = height;
    }
}

bool RenderingEngine::InitializePipeline() {
    pipelineAttempted_ = true;

    shaderProgram_ = CreateProgram(kVertexShaderSource, kFragmentShaderSource);
    if (shaderProgram_ == 0) {
        return false;
    }

    const GLint vertexLoc = glGetAttribLocation(shaderProgram_, "aVertex");
    const GLint xLoc = glGetAttribLocation(shaderProgram_, "aX");
    const GLint y0Loc = glGetAttribLocation(shaderProgram_, "aY0");
    const GLint y1Loc = glGetAttribLocation(shaderProgram_, "aY1");
    const GLint halfWidthLoc = glGetAttribLocation(shaderProgram_, "aHalfWidth");
    const GLint colorLoc = glGetAttribLocation(shaderProgram_, "aColor");
    viewProjLocation_ = glGetUniformLocation(shaderProgram_, "uViewProj");

    if (vertexLoc < 0 || xLoc < 0 || y0Loc < 0 || y1Loc < 0 || halfWidthLoc < 0 || colorLoc < 0 || viewProjLocation_ < 0) {
        std::cerr << "[NexusCharts] ERROR: Failed to resolve shader locations." << std::endl;
        return false;
    }

    const float quadVertices[] = {
        -1.0f, -1.0f,
         1.0f, -1.0f,
         1.0f,  1.0f,
        -1.0f, -1.0f,
         1.0f,  1.0f,
        -1.0f,  1.0f
    };

    std::vector<RenderInstance> bodyInstances;
    std::vector<RenderInstance> wickInstances;
    VisibleRange visibleRange;
    BuildWindowedInstancesFromDataManager(
        dataManager_,
        camera_,
        viewportWidth_,
        viewportHeight_,
        &bodyInstances,
        &wickInstances,
        &visibleRange
    );

    bodyInstanceCount_ = static_cast<GLsizei>(bodyInstances.size());
    wickInstanceCount_ = static_cast<GLsizei>(wickInstances.size());

    glGenBuffers(1, &quadVbo_);
    glBindBuffer(GL_ARRAY_BUFFER, quadVbo_);
    glBufferData(GL_ARRAY_BUFFER, sizeof(quadVertices), quadVertices, GL_STATIC_DRAW);

    const auto configureLayer = [&](const std::vector<RenderInstance>& instances, GLuint* vao, GLuint* instanceVbo) {
        glGenVertexArrays(1, vao);
        glBindVertexArray(*vao);

        glBindBuffer(GL_ARRAY_BUFFER, quadVbo_);
        glEnableVertexAttribArray(static_cast<GLuint>(vertexLoc));
        glVertexAttribPointer(static_cast<GLuint>(vertexLoc), 2, GL_FLOAT, GL_FALSE, 2 * sizeof(float), nullptr);

        glGenBuffers(1, instanceVbo);
        glBindBuffer(GL_ARRAY_BUFFER, *instanceVbo);
        glBufferData(
            GL_ARRAY_BUFFER,
            static_cast<GLsizeiptr>(instances.size() * sizeof(RenderInstance)),
            instances.empty() ? nullptr : instances.data(),
            GL_DYNAMIC_DRAW
        );

        constexpr GLsizei stride = static_cast<GLsizei>(sizeof(RenderInstance));

        glEnableVertexAttribArray(static_cast<GLuint>(xLoc));
        glVertexAttribPointer(static_cast<GLuint>(xLoc), 1, GL_FLOAT, GL_FALSE, stride, reinterpret_cast<void*>(offsetof(RenderInstance, x)));
        glVertexAttribDivisor(static_cast<GLuint>(xLoc), 1);

        glEnableVertexAttribArray(static_cast<GLuint>(y0Loc));
        glVertexAttribPointer(static_cast<GLuint>(y0Loc), 1, GL_FLOAT, GL_FALSE, stride, reinterpret_cast<void*>(offsetof(RenderInstance, y0)));
        glVertexAttribDivisor(static_cast<GLuint>(y0Loc), 1);

        glEnableVertexAttribArray(static_cast<GLuint>(y1Loc));
        glVertexAttribPointer(static_cast<GLuint>(y1Loc), 1, GL_FLOAT, GL_FALSE, stride, reinterpret_cast<void*>(offsetof(RenderInstance, y1)));
        glVertexAttribDivisor(static_cast<GLuint>(y1Loc), 1);

        glEnableVertexAttribArray(static_cast<GLuint>(halfWidthLoc));
        glVertexAttribPointer(static_cast<GLuint>(halfWidthLoc), 1, GL_FLOAT, GL_FALSE, stride, reinterpret_cast<void*>(offsetof(RenderInstance, halfWidth)));
        glVertexAttribDivisor(static_cast<GLuint>(halfWidthLoc), 1);

        glEnableVertexAttribArray(static_cast<GLuint>(colorLoc));
        glVertexAttribPointer(static_cast<GLuint>(colorLoc), 3, GL_FLOAT, GL_FALSE, stride, reinterpret_cast<void*>(offsetof(RenderInstance, colorR)));
        glVertexAttribDivisor(static_cast<GLuint>(colorLoc), 1);
    };

    configureLayer(wickInstances, &wickVao_, &wickInstanceVbo_);
    configureLayer(bodyInstances, &bodyVao_, &bodyInstanceVbo_);

    glBindBuffer(GL_ARRAY_BUFFER, 0);
    glBindVertexArray(0);

    if (dataManager_ != nullptr) {
        appliedDataRevision_ = dataManager_->GetRevision();
        hasAppliedDataRevision_ = true;
    } else {
        hasAppliedDataRevision_ = false;
    }

    appliedVisibleStart_ = visibleRange.start;
    appliedVisibleEnd_ = visibleRange.end;
    hasAppliedVisibleRange_ = true;

    initialized_ = true;
    std::cout << "[NexusCharts] Phase 2 pipeline initialized. Bodies: " << bodyInstanceCount_
              << ", Wicks: " << wickInstanceCount_ << std::endl;
    return true;
}

void RenderingEngine::RefreshInstanceBuffersIfNeeded() {
    if (!initialized_ || dataManager_ == nullptr) {
        return;
    }

    const std::uint64_t revision = dataManager_->GetRevision();
    const int candleCount = static_cast<int>(dataManager_->GetCandles().size());
    const VisibleRange visibleRange = ComputeVisibleRange(camera_, viewportWidth_, viewportHeight_, candleCount);
    const bool rangeChanged = !hasAppliedVisibleRange_
        || visibleRange.start != appliedVisibleStart_
        || visibleRange.end != appliedVisibleEnd_;

    if (hasAppliedDataRevision_ && revision == appliedDataRevision_ && !rangeChanged) {
        return;
    }

    std::vector<RenderInstance> bodyInstances;
    std::vector<RenderInstance> wickInstances;
    VisibleRange builtRange;
    BuildWindowedInstancesFromDataManager(
        dataManager_,
        camera_,
        viewportWidth_,
        viewportHeight_,
        &bodyInstances,
        &wickInstances,
        &builtRange
    );

    UploadInstances(bodyInstanceVbo_, bodyInstances, &bodyInstanceCount_);
    UploadInstances(wickInstanceVbo_, wickInstances, &wickInstanceCount_);
    glBindBuffer(GL_ARRAY_BUFFER, 0);

    appliedDataRevision_ = revision;
    hasAppliedDataRevision_ = true;
    appliedVisibleStart_ = builtRange.start;
    appliedVisibleEnd_ = builtRange.end;
    hasAppliedVisibleRange_ = true;
}

void RenderingEngine::Render() {
    glViewport(0, 0, viewportWidth_, viewportHeight_);
    glClearColor(0.07f, 0.09f, 0.13f, 1.0f);
    glClear(GL_COLOR_BUFFER_BIT);

    if (!initialized_) {
        if (pipelineAttempted_) {
            return;
        }
        if (!InitializePipeline()) {
            return;
        }
    }

    RefreshInstanceBuffersIfNeeded();

    glUseProgram(shaderProgram_);
    const std::array<float, 16> viewProj = camera_ ? camera_->GetViewProjectionMatrix() : BuildIdentityMatrix();
    glUniformMatrix4fv(viewProjLocation_, 1, GL_FALSE, viewProj.data());

    glBindVertexArray(wickVao_);
    glDrawArraysInstanced(GL_TRIANGLES, 0, 6, wickInstanceCount_);

    glBindVertexArray(bodyVao_);
    glDrawArraysInstanced(GL_TRIANGLES, 0, 6, bodyInstanceCount_);

    glBindVertexArray(0);
}
