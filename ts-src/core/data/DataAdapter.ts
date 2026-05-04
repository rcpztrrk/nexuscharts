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

export type CsvDataAdapterColumn = number | string;
export type CsvDataAdapterColumnMap = Partial<Record<
    "time" | "open" | "high" | "low" | "close" | "volume" | "value",
    CsvDataAdapterColumn
>>;

export interface CsvParseOptions {
    delimiter?: string;
    hasHeader?: boolean;
    columns?: CsvDataAdapterColumnMap;
}

export interface CsvDataAdapterOptions extends CsvParseOptions {
    load: (request?: DataAdapterRequest) => string | Promise<string>;
    mode?: DataAdapterApplyMode | ((request?: DataAdapterRequest) => DataAdapterApplyMode);
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

export function createCsvDataAdapter(options: CsvDataAdapterOptions): ChartDataAdapter {
    return {
        load: async (request?: DataAdapterRequest) => {
            const csv = await options.load(request);
            const mode = typeof options.mode === "function"
                ? options.mode(request)
                : options.mode ?? "replace";
            return {
                data: parseCsvCandles(csv, options),
                mode,
            };
        },
    };
}

export function parseCsvCandles(csv: string, options: CsvParseOptions = {}): CandleDataPoint[] {
    const lines = csv
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

    if (lines.length === 0) {
        return [];
    }

    const delimiter = options.delimiter ?? ",";
    const hasHeader = options.hasHeader ?? true;
    const headerCells = hasHeader ? splitCsvLine(lines[0], delimiter).map(normalizeCsvHeader) : [];
    const headerIndex = new Map<string, number>();
    headerCells.forEach((header, index) => {
        headerIndex.set(header, index);
    });

    const rows = hasHeader ? lines.slice(1) : lines;
    const defaultColumns: Required<CsvDataAdapterColumnMap> = hasHeader
        ? {
            time: "time",
            open: "open",
            high: "high",
            low: "low",
            close: "close",
            volume: "volume",
            value: "value",
        }
        : {
            time: 0,
            open: 1,
            high: 2,
            low: 3,
            close: 4,
            volume: 5,
            value: 6,
        };
    const columns = { ...defaultColumns, ...options.columns };

    return rows.map((line, rowIndex) => {
        const cells = splitCsvLine(line, delimiter);
        const lineNumber = rowIndex + (hasHeader ? 2 : 1);
        const point: CandleDataPoint = {
            time: parseCsvTime(readCsvCell(cells, headerIndex, columns.time, "time", lineNumber, true) as string),
            open: parseCsvNumber(readCsvCell(cells, headerIndex, columns.open, "open", lineNumber, true), "open", lineNumber),
            high: parseCsvNumber(readCsvCell(cells, headerIndex, columns.high, "high", lineNumber, true), "high", lineNumber),
            low: parseCsvNumber(readCsvCell(cells, headerIndex, columns.low, "low", lineNumber, true), "low", lineNumber),
            close: parseCsvNumber(readCsvCell(cells, headerIndex, columns.close, "close", lineNumber, true), "close", lineNumber),
        };
        const volume = readCsvCell(cells, headerIndex, columns.volume, "volume", lineNumber, false);
        const value = readCsvCell(cells, headerIndex, columns.value, "value", lineNumber, false);

        if (volume !== undefined && volume.trim().length > 0) {
            point.volume = parseCsvNumber(volume, "volume", lineNumber);
        }
        if (value !== undefined && value.trim().length > 0) {
            point.value = parseCsvNumber(value, "value", lineNumber);
        }

        return point;
    });
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

function splitCsvLine(line: string, delimiter: string): string[] {
    const cells: string[] = [];
    let current = "";
    let quoted = false;

    for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        if (char === "\"") {
            if (quoted && line[index + 1] === "\"") {
                current += "\"";
                index += 1;
            } else {
                quoted = !quoted;
            }
            continue;
        }

        if (!quoted && line.startsWith(delimiter, index)) {
            cells.push(current.trim());
            index += delimiter.length - 1;
            current = "";
            continue;
        }

        current += char;
    }

    cells.push(current.trim());
    return cells;
}

function normalizeCsvHeader(value: string): string {
    return value.trim().toLowerCase();
}

function readCsvCell(
    cells: string[],
    headerIndex: Map<string, number>,
    column: CsvDataAdapterColumn | undefined,
    name: string,
    lineNumber: number,
    required: boolean
): string | undefined {
    if (column === undefined) {
        if (required) {
            throw new Error(`[NexusCharts] CSV column '${name}' is not configured.`);
        }
        return undefined;
    }

    const index = typeof column === "number"
        ? column
        : headerIndex.get(normalizeCsvHeader(column));

    if (index === undefined || index < 0 || index >= cells.length) {
        if (required) {
            throw new Error(`[NexusCharts] CSV column '${name}' is missing on line ${lineNumber}.`);
        }
        return undefined;
    }

    return cells[index];
}

function parseCsvTime(value: string): number | string {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
        throw new Error("[NexusCharts] CSV time value is empty.");
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : trimmed;
}

function parseCsvNumber(value: string | undefined, name: string, lineNumber: number): number {
    const trimmed = value?.trim() ?? "";
    const parsed = Number(trimmed);
    if (trimmed.length === 0 || !Number.isFinite(parsed)) {
        throw new Error(`[NexusCharts] CSV value '${name}' is invalid on line ${lineNumber}.`);
    }
    return parsed;
}
