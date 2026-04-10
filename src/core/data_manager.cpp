#include "data_manager.h"

#include <algorithm>
#include <iostream>

namespace {
constexpr std::size_t kMaxObserverFrames = 4096;
}

DataManager::DataManager() {
    std::cout << "[NexusCharts] DataManager initialized." << std::endl;
}

void DataManager::ProcessData() {
    // Placeholder for WASM data processing logic
}

void DataManager::SetCandles(const std::vector<Candle>& candles) {
    candles_ = candles;
    ++revision_;
}

void DataManager::SetCandles(std::vector<Candle>&& candles) {
    candles_ = std::move(candles);
    ++revision_;
}

void DataManager::ClearCandles() {
    candles_.clear();
    ++revision_;
}

const std::vector<DataManager::Candle>& DataManager::GetCandles() const {
    return candles_;
}

std::uint64_t DataManager::GetRevision() const {
    return revision_;
}

void DataManager::PushObserverFrame(const ObserverFrame& frame) {
    observerFrames_.push_back(frame);
    if (observerFrames_.size() > kMaxObserverFrames) {
        const std::size_t overflow = observerFrames_.size() - kMaxObserverFrames;
        const auto dropCount = static_cast<std::vector<ObserverFrame>::difference_type>(overflow);
        observerFrames_.erase(observerFrames_.begin(), observerFrames_.begin() + dropCount);
    }
    ++observerRevision_;
}

void DataManager::ClearObserverFrames() {
    observerFrames_.clear();
    ++observerRevision_;
}

const std::vector<DataManager::ObserverFrame>& DataManager::GetObserverFrames() const {
    return observerFrames_;
}

std::size_t DataManager::GetObserverFrameCount() const {
    return observerFrames_.size();
}

float DataManager::GetLastObserverReward() const {
    if (observerFrames_.empty()) {
        return 0.0f;
    }
    return observerFrames_.back().reward;
}

float DataManager::GetLastObserverPnl() const {
    if (observerFrames_.empty()) {
        return 0.0f;
    }
    return observerFrames_.back().pnl;
}

float DataManager::GetAverageObserverReward(std::size_t window) const {
    if (observerFrames_.empty()) {
        return 0.0f;
    }

    const std::size_t count = observerFrames_.size();
    const std::size_t span = (window == 0) ? count : std::min(window, count);
    const std::size_t beginIndex = count - span;

    double sum = 0.0;
    for (std::size_t i = beginIndex; i < count; ++i) {
        sum += observerFrames_[i].reward;
    }

    return static_cast<float>(sum / static_cast<double>(span));
}

std::uint64_t DataManager::GetObserverRevision() const {
    return observerRevision_;
}
