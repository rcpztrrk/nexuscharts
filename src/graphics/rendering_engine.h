#pragma once

#include <GLES3/gl3.h>
#include <cstddef>
#include <cstdint>
#include <vector>

class Camera;
class DataManager;

struct RenderingCandleOhlc {
    float x;
    float open;
    float high;
    float low;
    float close;
};

struct RenderingInstance {
    float x;
    float y0;
    float y1;
    float halfWidth;
    float colorR;
    float colorG;
    float colorB;
};

struct RenderingTheme {
    float clearR = 0.07f;
    float clearG = 0.09f;
    float clearB = 0.13f;
    float upR = 0.18f;
    float upG = 0.80f;
    float upB = 0.34f;
    float downR = 0.92f;
    float downG = 0.28f;
    float downB = 0.30f;
    float wickR = 0.78f;
    float wickG = 0.82f;
    float wickB = 0.90f;
};

class RenderingEngine {
public:
    RenderingEngine(int viewportWidth, int viewportHeight);
    ~RenderingEngine();
    void Render();
    void SetCamera(const Camera* camera);
    void SetDataManager(const DataManager* dataManager);
    void SetViewportSize(int width, int height);
    void SetThemeColors(
        float clearR,
        float clearG,
        float clearB,
        float upR,
        float upG,
        float upB,
        float downR,
        float downG,
        float downB,
        float wickR,
        float wickG,
        float wickB
    );

private:
    bool InitializePipeline();
    void RefreshInstanceBuffersIfNeeded();
    void RebuildCandleCache();

    bool initialized_ = false;
    bool pipelineAttempted_ = false;
    GLuint shaderProgram_ = 0;
    GLuint bodyVao_ = 0;
    GLuint wickVao_ = 0;
    GLuint quadVbo_ = 0;
    GLuint bodyInstanceVbo_ = 0;
    GLuint wickInstanceVbo_ = 0;
    GLsizei bodyInstanceCount_ = 0;
    GLsizei wickInstanceCount_ = 0;
    GLint viewProjLocation_ = -1;
    int viewportWidth_ = 800;
    int viewportHeight_ = 600;
    const Camera* camera_ = nullptr;
    const DataManager* dataManager_ = nullptr;
    std::uint64_t appliedDataRevision_ = 0;
    bool hasAppliedDataRevision_ = false;
    int appliedVisibleStart_ = 0;
    int appliedVisibleEnd_ = -1;
    bool hasAppliedVisibleRange_ = false;
    std::vector<RenderingCandleOhlc> candleCache_;
    std::vector<RenderingInstance> bodyInstancesScratch_;
    std::vector<RenderingInstance> wickInstancesScratch_;
    std::size_t bodyInstanceBufferCapacityBytes_ = 0;
    std::size_t wickInstanceBufferCapacityBytes_ = 0;
    RenderingTheme theme_;
};
