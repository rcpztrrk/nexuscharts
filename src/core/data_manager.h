#pragma once

#include <cstddef>
#include <cstdint>
#include <vector>

class DataManager {
public:
    struct Candle {
        float open;
        float high;
        float low;
        float close;
    };

    struct ObserverFrame {
        double time;
        float reward;
        float pnl;
        float confidence;
        int actionCode; // -1: sell, 0: hold, 1: buy
        float x;
        float y;
    };

    DataManager();
    void ProcessData();

    void SetCandles(const std::vector<Candle>& candles);
    void ClearCandles();
    const std::vector<Candle>& GetCandles() const;
    std::uint64_t GetRevision() const;

    void PushObserverFrame(const ObserverFrame& frame);
    void ClearObserverFrames();
    const std::vector<ObserverFrame>& GetObserverFrames() const;
    std::size_t GetObserverFrameCount() const;
    float GetLastObserverReward() const;
    float GetLastObserverPnl() const;
    float GetAverageObserverReward(std::size_t window) const;
    std::uint64_t GetObserverRevision() const;

private:
    std::vector<Candle> candles_;
    std::uint64_t revision_ = 0;

    std::vector<ObserverFrame> observerFrames_;
    std::uint64_t observerRevision_ = 0;
};
