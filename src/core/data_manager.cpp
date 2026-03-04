#include "data_manager.h"
#include <iostream>

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
