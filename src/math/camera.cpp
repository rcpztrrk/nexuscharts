#include "camera.h"

#include <algorithm>
#include <iostream>

Camera::Camera() {
    std::cout << "[NexusCharts] Camera initialized." << std::endl;
}

void Camera::Update() {
    // Reserved for smoothing/interpolation in future phases.
}

void Camera::SetViewport(int width, int height) {
    if (width > 0) {
        viewportWidth_ = width;
    }
    if (height > 0) {
        viewportHeight_ = height;
    }
}

void Camera::SetView(float centerX, float centerY, float zoomX, float zoomY) {
    centerX_ = centerX;
    centerY_ = centerY;
    zoomX_ = std::clamp(zoomX, 0.2f, 5.0f);
    zoomY_ = std::clamp(zoomY, 0.2f, 5.0f);
}

void Camera::Pan(float deltaX, float deltaY) {
    centerX_ += deltaX;
    centerY_ += deltaY;
}

void Camera::Zoom(float zoomFactor) {
    if (zoomFactor <= 0.0f) {
        return;
    }
    zoomX_ = std::clamp(zoomX_ * zoomFactor, 0.2f, 5.0f);
    zoomY_ = std::clamp(zoomY_ * zoomFactor, 0.2f, 5.0f);
}

std::array<float, 16> Camera::GetViewProjectionMatrix() const {
    const float halfHeight = zoomY_;
    const float halfWidth = zoomX_;

    const float left = centerX_ - halfWidth;
    const float right = centerX_ + halfWidth;
    const float bottom = centerY_ - halfHeight;
    const float top = centerY_ + halfHeight;
    const float nearPlane = -1.0f;
    const float farPlane = 1.0f;

    const float invWidth = 1.0f / (right - left);
    const float invHeight = 1.0f / (top - bottom);
    const float invDepth = 1.0f / (farPlane - nearPlane);

    // Column-major orthographic projection matrix.
    return {
        2.0f * invWidth, 0.0f,             0.0f,               0.0f,
        0.0f,            2.0f * invHeight, 0.0f,               0.0f,
        0.0f,            0.0f,            -2.0f * invDepth,    0.0f,
       -(right + left) * invWidth,
       -(top + bottom) * invHeight,
       -(farPlane + nearPlane) * invDepth,
        1.0f
    };
}
