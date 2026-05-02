import type {
    CandleDataPoint,
    ChartDataAdapter,
    DataAdapterApplyMode,
    DataAdapterLoadResult,
    DataAdapterRequest,
    SeriesApi,
} from "../../types";

export type DataAdapterRowMapper<TRow> = (row: TRow, index: number) => CandleDataPoint;

export interface DataAdapterSourceOptions<TRow = CandleDataPoint> {
    load: (request?: DataAdapterRequest) => readonly TRow[] | Promise<readonly TRow[]>;
    map?: DataAdapterRowMapper<TRow>;
    mode?: DataAdapterApplyMode | ((request?: DataAdapterRequest) => DataAdapterApplyMode);
}

export interface PollingDataAdapterOptions<TRow = CandleDataPoint> extends DataAdapterSourceOptions<TRow> {
    intervalMs?: number;
    emitInitial?: boolean;
    getKey?: (point: CandleDataPoint) => number | string;
}

export interface DataAdapterApplyOptions {
    batch?: <T>(callback: () => T) => T;
}

export interface SeriesDataAdapterConnection {
    load: (request?: DataAdapterRequest, applyOptions?: DataAdapterApplyOptions) => Promise<CandleDataPoint[]>;
    disconnect: () => void;
}

export function createDataAdapter<TRow = CandleDataPoint>(
    options: DataAdapterSourceOptions<TRow>
): ChartDataAdapter {
    return {
        load: async (request?: DataAdapterRequest) => {
            const rows = await options.load(request);
            const mapRow = options.map ?? ((row: TRow) => row as unknown as CandleDataPoint);
            const mode = typeof options.mode === "function"
                ? options.mode(request)
                : options.mode ?? "replace";
            return {
                data: Array.from(rows, mapRow),
                mode,
            };
        },
    };
}

export function createPollingDataAdapter<TRow = CandleDataPoint>(
    options: PollingDataAdapterOptions<TRow>
): ChartDataAdapter {
    const baseAdapter = createDataAdapter(options);
    const seenKeys = new Set<number | string>();
    let lastKey: number | string | null = null;

    const keyFor = (point: CandleDataPoint): number | string => options.getKey?.(point) ?? point.time;
    const remember = (data: readonly CandleDataPoint[]): void => {
        for (const point of data) {
            const key = keyFor(point);
            seenKeys.add(key);
            lastKey = key;
        }
    };

    return {
        load: async (request?: DataAdapterRequest) => {
            const result = normalizeDataAdapterResult(await baseAdapter.load(request));
            remember(result.data);
            return result;
        },
        subscribe: (handlers) => {
            let disposed = false;

            const poll = async (): Promise<void> => {
                try {
                    const result = normalizeDataAdapterResult(await baseAdapter.load());
                    for (const point of result.data) {
                        const key = keyFor(point);
                        if (!seenKeys.has(key)) {
                            seenKeys.add(key);
                            lastKey = key;
                            handlers.onCandle(point, "append");
                        } else if (key === lastKey) {
                            handlers.onCandle(point, "updateLast");
                        }
                    }
                } catch (error) {
                    handlers.onError?.(error);
                }
            };

            const intervalMs = Math.max(100, Number(options.intervalMs ?? 5000));
            const timer = setInterval(() => {
                if (!disposed) {
                    void poll();
                }
            }, intervalMs);

            if (options.emitInitial) {
                void poll();
            }

            return () => {
                disposed = true;
                clearInterval(timer);
            };
        },
    };
}

export async function loadSeriesData(
    series: SeriesApi,
    adapter: ChartDataAdapter,
    request?: DataAdapterRequest,
    applyOptions: DataAdapterApplyOptions = {}
): Promise<CandleDataPoint[]> {
    const result = normalizeDataAdapterResult(await adapter.load(request));
    runApplyBatch(applyOptions, () => {
        applySeriesData(series, result.data, result.mode);
    });
    return result.data;
}

export function connectSeriesDataAdapter(
    series: SeriesApi,
    adapter: ChartDataAdapter,
    options: { onError?: (error: unknown) => void } = {}
): SeriesDataAdapterConnection {
    const unsubscribe = adapter.subscribe?.({
        onCandle: (point, mode = "append") => {
            if (mode === "updateLast") {
                series.updateLast(point);
                return;
            }
            series.append(point);
        },
        onError: options.onError,
    }) ?? (() => undefined);

    return {
        load: (request?: DataAdapterRequest, applyOptions?: DataAdapterApplyOptions) => (
            loadSeriesData(series, adapter, request, applyOptions)
        ),
        disconnect: unsubscribe,
    };
}

function runApplyBatch(options: DataAdapterApplyOptions, callback: () => void): void {
    if (typeof options.batch === "function") {
        options.batch(callback);
        return;
    }
    callback();
}

function normalizeDataAdapterResult(result: DataAdapterLoadResult): {
    data: CandleDataPoint[];
    mode: "replace" | "append";
} {
    if (Array.isArray(result)) {
        return { data: result, mode: "replace" };
    }
    return {
        data: result.data,
        mode: result.mode ?? "replace",
    };
}

function applySeriesData(series: SeriesApi, data: CandleDataPoint[], mode: "replace" | "append"): void {
    if (mode === "append") {
        for (const point of data) {
            series.append(point);
        }
        return;
    }
    series.setData(data);
}
