#pragma once

#include <GLES3/gl3.h>
#include <cstdint>

class Camera;
class DataManager;

class RenderingEngine {
public:
    RenderingEngine(int viewportWidth, int viewportHeight);
    ~RenderingEngine();
    void Render();
    void SetCamera(const Camera* camera);
    void SetDataManager(const DataManager* dataManager);
    void SetViewportSize(int width, int height);

private:
    bool InitializePipeline();
    void RefreshInstanceBuffersIfNeeded();

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
};
