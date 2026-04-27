import type {
    CandleDataPoint,
    ChartDataAdapter,
    DataAdapterLoadResult,
    DataAdapterRequest,
    SeriesApi,
} from "../../types";

export interface DataAdapterApplyOptions {
    batch?: <T>(callback: () => T) => T;
}

export interface SeriesDataAdapterConnection {
    load: (request?: DataAdapterRequest, applyOptions?: DataAdapterApplyOptions) => Promise<CandleDataPoint[]>;
    disconnect: () => void;
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
