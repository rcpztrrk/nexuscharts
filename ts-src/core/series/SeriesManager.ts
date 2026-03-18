import type {
    CandleDataPoint,
    CustomSeriesRenderer,
    SeriesApi,
    SeriesOptions,
    SeriesStyle,
    SeriesType,
    SeriesValueKey,
} from "../../types";

export interface StoredSeries {
    type: SeriesType;
    data: CandleDataPoint[];
    style: SeriesStyle;
    valueKey: SeriesValueKey;
    renderer?: CustomSeriesRenderer;
    revision: number;
}

interface SeriesManagerHooks {
    createId: () => string;
    isCompleteCandle: (point: Partial<CandleDataPoint>) => point is CandleDataPoint;
    onSeriesMutated: (seriesId: string) => void;
}

export class SeriesManager {
    private readonly store = new Map<string, StoredSeries>();

    public has(id: string): boolean {
        return this.store.has(id);
    }

    public get(id: string): StoredSeries | undefined {
        return this.store.get(id);
    }

    public entries(): IterableIterator<[string, StoredSeries]> {
        return this.store.entries();
    }

    public values(): IterableIterator<StoredSeries> {
        return this.store.values();
    }

    public createSeries(options: SeriesOptions = {}, hooks: SeriesManagerHooks): SeriesApi {
        const type: SeriesType = options.type ?? "candlestick";
        const id = options.id ?? hooks.createId();

        if (this.store.has(id)) {
            throw new Error(`[NexusCharts] Series id '${id}' already exists.`);
        }

        const style = this.buildStyle(type, options);
        const valueKey: SeriesValueKey = options.valueKey ?? (type === "volume" ? "volume" : "close");
        this.store.set(id, { type, data: [], style, valueKey, renderer: options.renderer, revision: 0 });

        const setData = (data: CandleDataPoint[]) => {
            const series = this.store.get(id);
            if (!series) {
                return;
            }
            series.data = [...data];
            series.revision += 1;
            hooks.onSeriesMutated(id);
        };

        const append = (point: CandleDataPoint) => {
            const series = this.store.get(id);
            if (!series) {
                return;
            }
            series.data.push(point);
            series.revision += 1;
            hooks.onSeriesMutated(id);
        };

        const updateLast = (point: Partial<CandleDataPoint>) => {
            const series = this.store.get(id);
            if (!series) {
                return;
            }

            if (series.data.length === 0) {
                if (!hooks.isCompleteCandle(point)) {
                    console.warn("[NexusCharts] updateLast requires a full candle when no data exists.", { id, point });
                    return;
                }
                series.data.push(point);
            } else {
                const lastIndex = series.data.length - 1;
                const last = series.data[lastIndex];
                series.data[lastIndex] = { ...last, ...point };
            }

            series.revision += 1;
            hooks.onSeriesMutated(id);
        };

        const update = (point: CandleDataPoint) => {
            append(point);
        };

        const getData = (): CandleDataPoint[] => {
            const series = this.store.get(id);
            return series ? [...series.data] : [];
        };

        const clear = () => {
            const series = this.store.get(id);
            if (!series) {
                return;
            }
            series.data = [];
            series.revision += 1;
            hooks.onSeriesMutated(id);
        };

        return { id, type, setData, append, update, updateLast, getData, clear };
    }

    private buildStyle(type: SeriesType, options: SeriesOptions): SeriesStyle {
        return {
            color: options.color ?? this.defaultColor(type),
            lineWidth: options.lineWidth ?? (type === "histogram" || type === "volume" ? 1 : 2),
            opacity: options.opacity ?? (type === "area" ? 0.25 : type === "volume" ? 0.22 : 1),
            barWidthRatio: this.clamp(options.barWidthRatio ?? (type === "volume" ? 0.55 : 0.6), 0.1, 1),
        };
    }

    private defaultColor(type: SeriesType): string {
        if (type === "histogram") {
            return "#fbbf24";
        }
        if (type === "volume") {
            return "#38bdf8";
        }
        if (type === "custom") {
            return "#f472b6";
        }
        return "#60a5fa";
    }

    private clamp(value: number, minValue: number, maxValue: number): number {
        if (!Number.isFinite(value)) {
            return minValue;
        }
        return Math.min(maxValue, Math.max(minValue, value));
    }
}
