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
        const period = Math.max(2, Math.floor(definition.period));
        const pane = definition.pane ?? (definition.type === "rsi" ? "lower" : "main");
        const color = definition.color ?? this.defaultColor(definition.type, theme);

        this.store.set(id, {
            id,
            type: definition.type,
            period,
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
}
