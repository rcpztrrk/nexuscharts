#pragma once

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

    DataManager();
    void ProcessData();
    void SetCandles(const std::vector<Candle>& candles);
    void ClearCandles();
    const std::vector<Candle>& GetCandles() const;
    std::uint64_t GetRevision() const;

private:
    std::vector<Candle> candles_;
    std::uint64_t revision_ = 0;
};
