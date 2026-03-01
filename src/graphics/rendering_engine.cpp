#include "rendering_engine.h"

#include "math/camera.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <iostream>
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
    BuildRenderInstances(BuildSampleCandles(), &bodyInstances, &wickInstances);

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
            instances.data(),
            GL_STATIC_DRAW
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

    initialized_ = true;
    std::cout << "[NexusCharts] Phase 2 pipeline initialized. Bodies: " << bodyInstanceCount_
              << ", Wicks: " << wickInstanceCount_ << std::endl;
    return true;
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

    glUseProgram(shaderProgram_);
    const std::array<float, 16> viewProj = camera_ ? camera_->GetViewProjectionMatrix() : BuildIdentityMatrix();
    glUniformMatrix4fv(viewProjLocation_, 1, GL_FALSE, viewProj.data());

    glBindVertexArray(wickVao_);
    glDrawArraysInstanced(GL_TRIANGLES, 0, 6, wickInstanceCount_);

    glBindVertexArray(bodyVao_);
    glDrawArraysInstanced(GL_TRIANGLES, 0, 6, bodyInstanceCount_);

    glBindVertexArray(0);
}
