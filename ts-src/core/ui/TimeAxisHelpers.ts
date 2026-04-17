import type { NormalizedCandleDataPoint, SeriesGeometry } from "../../types";

export interface TimeAxisLabel {
    x: number;
    text: string;
}

export interface BuildVisibleTimeLabelsOptions {
    geometry: SeriesGeometry;
    width: number;
    height: number;
    targetCount: number;
    getVisibleCandleIndexRange: (geometry: SeriesGeometry, width: number, height: number, padding?: number) => { start: number; end: number };
    worldToCanvasX: (worldX: number, width: number, height: number) => number;
    toNumericTime: (value: number | string) => number | null;
    isLikelyTimestamp: (value: number | null) => value is number;
    normalizeTimestampMs: (value: number) => number;
    formatTimeLabel: (value: number | string, spanHintMs?: number | null) => string;
}

export function formatTimestampLabel(
    timestampMs: number,
    timezone: string,
    spanHintMs: number | null = null
): string {
    const date = new Date(timestampMs);
    if (!Number.isFinite(date.getTime())) {
        return String(timestampMs);
    }

    const formatterOptions: Intl.DateTimeFormatOptions = { timeZone: timezone };

    if (spanHintMs === null) {
        formatterOptions.month = "short";
        formatterOptions.day = "2-digit";
        formatterOptions.hour = "2-digit";
        formatterOptions.minute = "2-digit";
        return new Intl.DateTimeFormat(undefined, formatterOptions).format(date);
    }

    if (spanHintMs <= (12 * 60 * 60 * 1000)) {
        formatterOptions.hour = "2-digit";
        formatterOptions.minute = "2-digit";
        return new Intl.DateTimeFormat(undefined, formatterOptions).format(date);
    }

    if (spanHintMs <= (3 * 24 * 60 * 60 * 1000)) {
        formatterOptions.month = "short";
        formatterOptions.day = "2-digit";
        formatterOptions.hour = "2-digit";
        formatterOptions.minute = "2-digit";
        return new Intl.DateTimeFormat(undefined, formatterOptions).format(date);
    }

    if (spanHintMs <= (180 * 24 * 60 * 60 * 1000)) {
        formatterOptions.month = "short";
        formatterOptions.day = "2-digit";
        return new Intl.DateTimeFormat(undefined, formatterOptions).format(date);
    }

    formatterOptions.year = "numeric";
    formatterOptions.month = "short";
    return new Intl.DateTimeFormat(undefined, formatterOptions).format(date);
}

export function formatTimeLabel(
    value: number | string,
    timezone: string,
    isLikelyTimestamp: (value: number | null) => value is number,
    normalizeTimestampMs: (value: number) => number,
    spanHintMs: number | null = null
): string {
    if (typeof value === "number") {
        if (isLikelyTimestamp(value)) {
            return formatTimestampLabel(normalizeTimestampMs(value), timezone, spanHintMs);
        }
        if (Number.isInteger(value)) {
            return String(value);
        }
        return Number(value).toFixed(2);
    }

    const parsedDate = Date.parse(value);
    if (Number.isFinite(parsedDate)) {
        return formatTimestampLabel(parsedDate, timezone, spanHintMs);
    }
    return String(value);
}

export function niceStep(rawStep: number): number {
    if (!Number.isFinite(rawStep) || rawStep <= 0) {
        return 1;
    }
    const exponent = Math.floor(Math.log10(rawStep));
    const power = Math.pow(10, exponent);
    const fraction = rawStep / power;
    if (fraction <= 1) return power;
    if (fraction <= 2) return 2 * power;
    if (fraction <= 5) return 5 * power;
    return 10 * power;
}

export function buildNiceTicks(minValue: number, maxValue: number, targetCount: number): number[] {
    if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
        return [];
    }

    if (Math.abs(maxValue - minValue) < 1e-9) {
        return [minValue];
    }

    const desired = Math.max(2, targetCount);
    const rawStep = Math.abs(maxValue - minValue) / Math.max(1, desired - 1);
    const step = niceStep(rawStep);
    const start = Math.ceil(minValue / step) * step;
    const ticks: number[] = [];

    for (let value = start; value <= (maxValue + (step * 0.5)); value += step) {
        ticks.push(Number(value.toFixed(8)));
        if (ticks.length > 200) {
            break;
        }
    }

    if (ticks.length === 0) {
        ticks.push(Number(minValue.toFixed(8)));
        ticks.push(Number(maxValue.toFixed(8)));
    }

    return ticks;
}

export function buildTemporalTicks(minTimeMs: number, maxTimeMs: number, targetCount: number): number[] {
    const span = Math.max(1, maxTimeMs - minTimeMs);
    const desired = Math.max(2, targetCount);
    const candidates = [
        60 * 1000,
        5 * 60 * 1000,
        15 * 60 * 1000,
        30 * 60 * 1000,
        60 * 60 * 1000,
        2 * 60 * 60 * 1000,
        4 * 60 * 60 * 1000,
        6 * 60 * 60 * 1000,
        12 * 60 * 60 * 1000,
        24 * 60 * 60 * 1000,
        2 * 24 * 60 * 60 * 1000,
        7 * 24 * 60 * 60 * 1000,
        30 * 24 * 60 * 60 * 1000,
        90 * 24 * 60 * 60 * 1000,
        365 * 24 * 60 * 60 * 1000,
    ];

    let step = candidates[candidates.length - 1];
    for (const candidate of candidates) {
        if ((span / candidate) <= (desired * 1.35)) {
            step = candidate;
            break;
        }
    }

    const start = Math.ceil(minTimeMs / step) * step;
    const ticks: number[] = [];
    for (let value = start; value <= (maxTimeMs + (step * 0.5)); value += step) {
        ticks.push(value);
        if (ticks.length > 256) {
            break;
        }
    }

    if (ticks.length === 0) {
        ticks.push(minTimeMs, maxTimeMs);
    }

    return ticks;
}

export function buildVisibleTimeLabels(options: BuildVisibleTimeLabelsOptions): TimeAxisLabel[] {
    const { geometry, width, height, targetCount } = options;
    const candles = geometry.candles;
    if (candles.length === 0) {
        return [];
    }

    const range = options.getVisibleCandleIndexRange(geometry, width, height, 0);
    const rangeSize = Math.max(0, (range.end - range.start) + 1);
    const desiredSource = Math.max(24, Math.min(rangeSize, Math.max(120, targetCount * 12)));
    const sampleStep = rangeSize > 0 ? Math.max(1, Math.floor(rangeSize / desiredSource)) : 1;

    const source: Array<{ index: number; candle: NormalizedCandleDataPoint; x: number; timeValue: number | null }> = [];
    if (rangeSize > 0) {
        for (let i = range.start; i <= range.end; i += sampleStep) {
            const candle = candles[i];
            source.push({
                index: i,
                candle,
                x: options.worldToCanvasX(candle.x, width, height),
                timeValue: options.toNumericTime(candle.source.time),
            });
        }
        if (source.length > 0 && source[source.length - 1].index !== range.end) {
            const candle = candles[range.end];
            source.push({
                index: range.end,
                candle,
                x: options.worldToCanvasX(candle.x, width, height),
                timeValue: options.toNumericTime(candle.source.time),
            });
        }
    }

    if (source.length === 0) {
        const step = Math.max(1, Math.floor(candles.length / Math.max(2, targetCount)));
        for (let i = 0; i < candles.length; i += step) {
            const candle = candles[i];
            source.push({
                index: i,
                candle,
                x: options.worldToCanvasX(candle.x, width, height),
                timeValue: options.toNumericTime(candle.source.time),
            });
        }
        if (source.length > 0 && source[source.length - 1].index !== (candles.length - 1)) {
            const candle = candles[candles.length - 1];
            source.push({
                index: candles.length - 1,
                candle,
                x: options.worldToCanvasX(candle.x, width, height),
                timeValue: options.toNumericTime(candle.source.time),
            });
        }
    }

    if (source.length === 0) {
        return [];
    }

    const labels: TimeAxisLabel[] = [];
    const numericEntries = source.filter((entry) => entry.timeValue !== null) as Array<{
        index: number;
        candle: NormalizedCandleDataPoint;
        x: number;
        timeValue: number;
    }>;

    if (numericEntries.length === source.length) {
        const useTemporalTicks = numericEntries.length > 1 && numericEntries.every((entry) => options.isLikelyTimestamp(entry.timeValue));
        if (useTemporalTicks) {
            const normalizedEntries = numericEntries.map((entry) => ({
                ...entry,
                timestampMs: options.normalizeTimestampMs(entry.timeValue),
            }));
            const minTime = normalizedEntries[0].timestampMs;
            const maxTime = normalizedEntries[normalizedEntries.length - 1].timestampMs;
            const spanHintMs = Math.max(1, maxTime - minTime);
            const ticks = buildTemporalTicks(minTime, maxTime, targetCount);
            const used = new Set<number>();
            for (const tick of ticks) {
                let nearest = normalizedEntries[0];
                let nearestDistance = Math.abs(nearest.timestampMs - tick);
                for (let i = 1; i < normalizedEntries.length; i += 1) {
                    const candidate = normalizedEntries[i];
                    const distance = Math.abs(candidate.timestampMs - tick);
                    if (distance < nearestDistance) {
                        nearest = candidate;
                        nearestDistance = distance;
                    }
                }
                if (used.has(nearest.index)) {
                    continue;
                }
                used.add(nearest.index);
                labels.push({
                    x: nearest.x,
                    text: options.formatTimeLabel(nearest.candle.source.time, spanHintMs),
                });
            }
            labels.sort((a, b) => a.x - b.x);
            return labels;
        }

        const minTime = numericEntries[0].timeValue;
        const maxTime = numericEntries[numericEntries.length - 1].timeValue;
        const ticks = buildNiceTicks(minTime, maxTime, targetCount);
        const used = new Set<number>();
        for (const tick of ticks) {
            let nearest = numericEntries[0];
            let nearestDistance = Math.abs(nearest.timeValue - tick);
            for (let i = 1; i < numericEntries.length; i += 1) {
                const candidate = numericEntries[i];
                const distance = Math.abs(candidate.timeValue - tick);
                if (distance < nearestDistance) {
                    nearest = candidate;
                    nearestDistance = distance;
                }
            }
            if (used.has(nearest.index)) {
                continue;
            }
            used.add(nearest.index);
            labels.push({
                x: nearest.x,
                text: options.formatTimeLabel(nearest.candle.source.time),
            });
        }
        labels.sort((a, b) => a.x - b.x);
        return labels;
    }

    const step = Math.max(1, Math.floor(source.length / Math.max(2, targetCount)));
    for (let i = 0; i < source.length; i += step) {
        const entry = source[i];
        labels.push({
            x: entry.x,
            text: options.formatTimeLabel(entry.candle.source.time),
        });
    }
    if (labels.length > 0) {
        const last = source[source.length - 1];
        const lastLabel = options.formatTimeLabel(last.candle.source.time);
        if (labels[labels.length - 1].text !== lastLabel) {
            labels.push({ x: last.x, text: lastLabel });
        }
    }
    return labels;
}
