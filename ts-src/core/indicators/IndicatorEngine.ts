import type { CandleDataPoint, ChartTheme, IndicatorDefinition, IndicatorSeries } from "../../types";

interface StoredIndicator extends IndicatorSeries {
    usesDefaultColor: boolean;
}

export class IndicatorEngine {
    private readonly store = new Map<string, StoredIndicator>();

    public get size(): number {
        return this.store.size;
    }

    public values(): IterableIterator<StoredIndicator> {
        return this.store.values();
    }

    public addIndicator(definition: IndicatorDefinition, createId: () => string, theme: ChartTheme): string {
        const id = definition.id ?? createId();
        if (this.store.has(id)) {
            throw new Error(`[NexusCharts] Indicator id '${id}' already exists.`);
        }
        const period = Math.max(2, Math.floor(definition.slowPeriod ?? definition.period));
        const fastPeriod = definition.fastPeriod !== undefined
            ? Math.max(2, Math.floor(definition.fastPeriod))
            : undefined;
        const pane = definition.pane ?? (
            definition.type === "rsi"
                || definition.type === "macd"
                || definition.type === "atr"
                || definition.type === "stochastic"
                ? "lower"
                : "main"
        );
        const color = definition.color ?? this.defaultColor(definition.type, theme);

        this.store.set(id, {
            id,
            type: definition.type,
            period,
            fastPeriod,
            slowPeriod: definition.slowPeriod,
            pane,
            color,
            usesDefaultColor: !definition.color,
            values: [],
        });

        return id;
    }

    public removeIndicator(id: string): boolean {
        return this.store.delete(id);
    }

    public clearIndicators(): void {
        this.store.clear();
    }

    public applyTheme(theme: ChartTheme): void {
        for (const indicator of this.store.values()) {
            if (indicator.usesDefaultColor) {
                indicator.color = this.defaultColor(indicator.type, theme);
            }
        }
    }

    public getIndicators(): IndicatorSeries[] {
        return Array.from(this.store.values()).map((indicator) => ({
            ...indicator,
            values: [...indicator.values],
            upperValues: indicator.upperValues ? [...indicator.upperValues] : undefined,
            lowerValues: indicator.lowerValues ? [...indicator.lowerValues] : undefined,
        }));
    }

    public getLowerIndicators(): IndicatorSeries[] {
        return Array.from(this.store.values()).filter((indicator) => indicator.pane === "lower");
    }

    public hasLowerPane(): boolean {
        for (const indicator of this.store.values()) {
            if (indicator.pane === "lower") {
                return true;
            }
        }
        return false;
    }

    public recompute(sourceCandles: CandleDataPoint[]): void {
        if (this.store.size === 0) {
            return;
        }
        const closes: number[] = sourceCandles.map((point) => Number(point.close));
        const valid = closes.map((value) => (Number.isFinite(value) ? value : NaN));

        for (const indicator of this.store.values()) {
            indicator.upperValues = undefined;
            indicator.lowerValues = undefined;
            switch (indicator.type) {
                case "sma":
                    indicator.values = IndicatorEngine.computeSma(valid, indicator.period);
                    break;
                case "ema":
                    indicator.values = IndicatorEngine.computeEma(valid, indicator.period);
                    break;
                case "rsi":
                    indicator.values = IndicatorEngine.computeRsi(valid, indicator.period);
                    break;
                case "macd":
                    indicator.values = IndicatorEngine.computeMacd(valid, indicator.fastPeriod ?? 12, indicator.period);
                    break;
                case "atr":
                    indicator.values = IndicatorEngine.computeAtr(sourceCandles, indicator.period);
                    break;
                case "stochastic":
                    indicator.values = IndicatorEngine.computeStochastic(sourceCandles, indicator.period);
                    break;
                case "bollinger": {
                    const bands = IndicatorEngine.computeBollingerBands(valid, indicator.period);
                    indicator.values = bands.middle;
                    indicator.upperValues = bands.upper;
                    indicator.lowerValues = bands.lower;
                    break;
                }
                case "vwap":
                    indicator.values = IndicatorEngine.computeVwap(sourceCandles);
                    break;
                default:
                    indicator.values = [];
                    break;
            }
        }
    }

    private defaultColor(type: IndicatorDefinition["type"], theme: ChartTheme): string {
        if (type === "ema") {
            return theme.indicators.ema;
        }
        if (type === "rsi") {
            return theme.indicators.rsi;
        }
        if (type === "macd") {
            return theme.indicators.macd;
        }
        if (type === "atr") {
            return theme.indicators.atr;
        }
        if (type === "stochastic") {
            return theme.indicators.stochastic;
        }
        if (type === "bollinger") {
            return theme.indicators.bollinger;
        }
        if (type === "vwap") {
            return theme.indicators.vwap;
        }
        return theme.indicators.sma;
    }

    private static computeSma(values: number[], period: number): Array<number | null> {
        const result: Array<number | null> = new Array(values.length).fill(null);
        if (values.length === 0) {
            return result;
        }
        let sum = 0;
        for (let i = 0; i < values.length; i += 1) {
            const value = values[i];
            if (!Number.isFinite(value)) {
                continue;
            }
            sum += value;
            if (i >= period) {
                const drop = values[i - period];
                if (Number.isFinite(drop)) {
                    sum -= drop;
                }
            }
            if (i >= period - 1) {
                result[i] = sum / period;
            }
        }
        return result;
    }

    private static computeEma(values: number[], period: number): Array<number | null> {
        const result: Array<number | null> = new Array(values.length).fill(null);
        if (values.length === 0) {
            return result;
        }
        const k = 2 / (period + 1);
        let ema = 0;
        let initialized = false;
        let sum = 0;

        for (let i = 0; i < values.length; i += 1) {
            const value = values[i];
            if (!Number.isFinite(value)) {
                continue;
            }
            if (!initialized) {
                sum += value;
                if (i >= period - 1) {
                    ema = sum / period;
                    result[i] = ema;
                    initialized = true;
                }
                continue;
            }

            ema = (value - ema) * k + ema;
            result[i] = ema;
        }

        return result;
    }

    private static computeRsi(values: number[], period: number): Array<number | null> {
        const result: Array<number | null> = new Array(values.length).fill(null);
        if (values.length === 0) {
            return result;
        }

        let gainSum = 0;
        let lossSum = 0;
        let avgGain = 0;
        let avgLoss = 0;
        let initialized = false;

        for (let i = 1; i < values.length; i += 1) {
            const prev = values[i - 1];
            const curr = values[i];
            if (!Number.isFinite(prev) || !Number.isFinite(curr)) {
                continue;
            }
            const delta = curr - prev;
            const gain = delta > 0 ? delta : 0;
            const loss = delta < 0 ? -delta : 0;

            if (!initialized) {
                gainSum += gain;
                lossSum += loss;
                if (i >= period) {
                    avgGain = gainSum / period;
                    avgLoss = lossSum / period;
                    initialized = true;
                }
            } else {
                avgGain = ((avgGain * (period - 1)) + gain) / period;
                avgLoss = ((avgLoss * (period - 1)) + loss) / period;
            }

            if (initialized) {
                const rs = avgLoss === 0 ? Number.POSITIVE_INFINITY : (avgGain / avgLoss);
                result[i] = 100 - (100 / (1 + rs));
            }
        }

        return result;
    }

    private static computeMacd(values: number[], fastPeriod: number, slowPeriod: number): Array<number | null> {
        const result: Array<number | null> = new Array(values.length).fill(null);
        if (values.length === 0) {
            return result;
        }

        const fast = IndicatorEngine.computeEma(values, Math.max(2, Math.min(fastPeriod, slowPeriod - 1)));
        const slow = IndicatorEngine.computeEma(values, Math.max(3, slowPeriod));
        for (let i = 0; i < values.length; i += 1) {
            const fastValue = fast[i];
            const slowValue = slow[i];
            if (Number.isFinite(fastValue ?? NaN) && Number.isFinite(slowValue ?? NaN)) {
                result[i] = (fastValue as number) - (slowValue as number);
            }
        }

        return result;
    }

    private static computeAtr(candles: CandleDataPoint[], period: number): Array<number | null> {
        const result: Array<number | null> = new Array(candles.length).fill(null);
        if (candles.length === 0) {
            return result;
        }

        let trueRangeSum = 0;
        let atr = 0;
        for (let i = 0; i < candles.length; i += 1) {
            const high = Number(candles[i].high);
            const low = Number(candles[i].low);
            const previousClose = i > 0 ? Number(candles[i - 1].close) : Number.NaN;
            if (!Number.isFinite(high) || !Number.isFinite(low)) {
                continue;
            }

            const trueRange = Number.isFinite(previousClose)
                ? Math.max(high - low, Math.abs(high - previousClose), Math.abs(low - previousClose))
                : high - low;

            if (i < period) {
                trueRangeSum += trueRange;
                if (i === period - 1) {
                    atr = trueRangeSum / period;
                    result[i] = atr;
                }
                continue;
            }

            atr = ((atr * (period - 1)) + trueRange) / period;
            result[i] = atr;
        }

        return result;
    }

    private static computeStochastic(candles: CandleDataPoint[], period: number): Array<number | null> {
        const result: Array<number | null> = new Array(candles.length).fill(null);
        if (candles.length === 0) {
            return result;
        }

        for (let i = period - 1; i < candles.length; i += 1) {
            let lowestLow = Number.POSITIVE_INFINITY;
            let highestHigh = Number.NEGATIVE_INFINITY;
            for (let j = i - period + 1; j <= i; j += 1) {
                const low = Number(candles[j].low);
                const high = Number(candles[j].high);
                if (!Number.isFinite(low) || !Number.isFinite(high)) {
                    continue;
                }
                lowestLow = Math.min(lowestLow, low);
                highestHigh = Math.max(highestHigh, high);
            }

            const close = Number(candles[i].close);
            const range = highestHigh - lowestLow;
            if (Number.isFinite(close) && Number.isFinite(range) && range > 1e-9) {
                result[i] = ((close - lowestLow) / range) * 100;
            }
        }

        return result;
    }

    private static computeBollingerBands(
        values: number[],
        period: number
    ): { middle: Array<number | null>; upper: Array<number | null>; lower: Array<number | null> } {
        const middle: Array<number | null> = new Array(values.length).fill(null);
        const upper: Array<number | null> = new Array(values.length).fill(null);
        const lower: Array<number | null> = new Array(values.length).fill(null);
        if (values.length === 0) {
            return { middle, upper, lower };
        }

        for (let i = period - 1; i < values.length; i += 1) {
            let sum = 0;
            let count = 0;
            for (let j = i - period + 1; j <= i; j += 1) {
                const value = values[j];
                if (!Number.isFinite(value)) {
                    continue;
                }
                sum += value;
                count += 1;
            }
            if (count !== period) {
                continue;
            }

            const average = sum / period;
            let variance = 0;
            for (let j = i - period + 1; j <= i; j += 1) {
                variance += (values[j] - average) ** 2;
            }
            const deviation = Math.sqrt(variance / period) * 2;
            middle[i] = average;
            upper[i] = average + deviation;
            lower[i] = average - deviation;
        }

        return { middle, upper, lower };
    }

    private static computeVwap(candles: CandleDataPoint[]): Array<number | null> {
        const result: Array<number | null> = new Array(candles.length).fill(null);
        let cumulativePriceVolume = 0;
        let cumulativeVolume = 0;

        for (let i = 0; i < candles.length; i += 1) {
            const high = Number(candles[i].high);
            const low = Number(candles[i].low);
            const close = Number(candles[i].close);
            const volume = Number(candles[i].volume ?? 1);
            if (!Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close) || !Number.isFinite(volume) || volume <= 0) {
                continue;
            }

            const typicalPrice = (high + low + close) / 3;
            cumulativePriceVolume += typicalPrice * volume;
            cumulativeVolume += volume;
            result[i] = cumulativePriceVolume / cumulativeVolume;
        }

        return result;
    }
}
