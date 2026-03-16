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

    int GetViewportWidth() const { return viewportWidth_; }
    int GetViewportHeight() const { return viewportHeight_; }
    float GetCenterX() const { return centerX_; }
    float GetCenterY() const { return centerY_; }
    float GetZoom() const { return zoom_; }

private:
    int viewportWidth_ = 800;
    int viewportHeight_ = 600;
    float centerX_ = 0.0f;
    float centerY_ = 0.0f;
    float zoom_ = 1.0f;
};
