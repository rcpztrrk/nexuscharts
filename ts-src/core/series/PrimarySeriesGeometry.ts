import type { CandleDataPoint, NormalizedCandleDataPoint, SeriesGeometry } from "../../types";

export interface PrimarySeriesEntry {
    id: string;
    data: CandleDataPoint[];
    revision: number;
}

export interface PrimarySeriesStats {
    entry: PrimarySeriesEntry;
    validCount: number;
    minPrice: number;
    maxPrice: number;
    preserveGaps: boolean;
    minTime: number;
    maxTime: number;
}

export interface PrimarySeriesGeometryOptions {
    preserveGaps: boolean;
    toNumericTime: (value: number | string) => number | null;
    isLikelyTimestamp: (value: number | null) => value is number;
    normalizeTimestampMs: (value: number) => number;
}

export function buildPrimarySeriesStats(
    entry: PrimarySeriesEntry | null,
    options: PrimarySeriesGeometryOptions
): PrimarySeriesStats | null {
    if (!entry) {
        return null;
    }

    let minPrice = Number.POSITIVE_INFINITY;
    let maxPrice = Number.NEGATIVE_INFINITY;
    let validCount = 0;
    let preserveGaps = options.preserveGaps;
    let minTime = Number.POSITIVE_INFINITY;
    let maxTime = Number.NEGATIVE_INFINITY;

    for (let i = 0; i < entry.data.length; i += 1) {
        const point = entry.data[i];
        const open = Number(point.open);
        const high = Number(point.high);
        const low = Number(point.low);
        const close = Number(point.close);
        if (!Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
            continue;
        }

        const pointLow = Math.min(low, open, close, high);
        const pointHigh = Math.max(high, open, close, low);
        minPrice = Math.min(minPrice, pointLow);
        maxPrice = Math.max(maxPrice, pointHigh);
        validCount += 1;

        if (preserveGaps) {
            const numericTime = options.toNumericTime(point.time);
            if (!options.isLikelyTimestamp(numericTime)) {
                preserveGaps = false;
            } else {
                const normalizedTime = options.normalizeTimestampMs(numericTime);
                minTime = Math.min(minTime, normalizedTime);
                maxTime = Math.max(maxTime, normalizedTime);
            }
        }
    }

    if (validCount === 0) {
        return null;
    }

    preserveGaps = preserveGaps && validCount > 1 && Number.isFinite(minTime) && Number.isFinite(maxTime);

    return {
        entry,
        validCount,
        minPrice,
        maxPrice,
        preserveGaps,
        minTime,
        maxTime,
    };
}

export function buildPrimarySeriesGeometry(
    stats: PrimarySeriesStats,
    options: Pick<PrimarySeriesGeometryOptions, "toNumericTime" | "normalizeTimestampMs">
): SeriesGeometry {
    const source = stats.entry.data;
    const range = Math.max(stats.maxPrice - stats.minPrice, 1e-5);
    const scale = 1.7 / range;
    const startX = -0.92;
    const stepX = stats.validCount > 1 ? 1.84 / (stats.validCount - 1) : 0.0;
    const timeSpan = stats.preserveGaps ? Math.max(1, stats.maxTime - stats.minTime) : 1;
    const candles = new Array<NormalizedCandleDataPoint>(stats.validCount);

    for (let i = 0, writeIndex = 0; i < source.length; i += 1) {
        const point = source[i];
        const open = Number(point.open);
        const high = Number(point.high);
        const low = Number(point.low);
        const close = Number(point.close);
        if (!Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
            continue;
        }

        const pointHigh = Math.max(high, open, close, low);
        const pointLow = Math.min(low, open, close, high);
        const x = stats.preserveGaps
            ? startX + ((1.84 * (options.normalizeTimestampMs(options.toNumericTime(point.time) as number) - stats.minTime)) / timeSpan)
            : startX + (stepX * writeIndex);

        candles[writeIndex] = {
            source: point,
            x,
            open: ((open - stats.minPrice) * scale) - 0.85,
            high: ((pointHigh - stats.minPrice) * scale) - 0.85,
            low: ((pointLow - stats.minPrice) * scale) - 0.85,
            close: ((close - stats.minPrice) * scale) - 0.85,
        };
        writeIndex += 1;
    }

    return {
        candles,
        minPrice: stats.minPrice,
        maxPrice: stats.maxPrice,
        scale,
    };
}
