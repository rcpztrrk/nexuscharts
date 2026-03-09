#pragma once

#include <array>

class Camera {
public:
    Camera();
    void Update();
    void SetViewport(int width, int height);
    void SetView(float centerX, float centerY, float zoom);
    void Pan(float deltaX, float deltaY);
    void Zoom(float zoomFactor);
    std::array<float, 16> GetViewProjectionMatrix() const;

private:
    int viewportWidth_ = 800;
    int viewportHeight_ = 600;
    float centerX_ = 0.0f;
    float centerY_ = 0.0f;
    float zoom_ = 1.0f;
};
