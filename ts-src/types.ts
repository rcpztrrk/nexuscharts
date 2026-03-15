import type { NexusCharts } from "./core/NexusCharts";

export interface InitOptions {
    canvasId: string;
    width?: number;
    height?: number;
    wasmScriptPath?: string;
    wasmBinaryPath?: string;
    enableInteraction?: boolean;
    analytics?: AnalyticsOptions;
    ui?: UiOptions;
    onReady?: (chart: NexusCharts) => void;
}

export interface UiOptions {
    showAxes?: boolean;
    showCrosshair?: boolean;
    showTooltip?: boolean;
    showControlBar?: boolean;
    tooltipMode?: "follow" | "fixed";
    persistState?: boolean;
    autoScaleY?: boolean;
    axisTickCount?: number;
    pricePrecision?: number;
}

export interface UiState {
    showAxes: boolean;
    showCrosshair: boolean;
    showTooltip: boolean;
    showControlBar: boolean;
    tooltipMode: "follow" | "fixed";
    persistState: boolean;
    autoScaleY: boolean;
    showHeatmap: boolean;
    showAnalyticsPanel: boolean;
}

export interface AnalyticsOptions {
    showRewardCurve?: boolean;
    showPnlCurve?: boolean;
    showHeatmap?: boolean;
    maxFrames?: number;
}

export interface CandleDataPoint {
    time: number | string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
    value?: number;
}

export type SeriesType = "candlestick" | "line" | "area" | "histogram" | "volume" | "custom";

export type AgentAction = "buy" | "sell" | "hold";

export interface ObserverFrame {
    time: number;
    reward: number;
    pnl: number;
    confidence?: number;
    action?: AgentAction;
    x?: number; // normalized world space [-1, 1]
    y?: number; // normalized world space [-1, 1]
}

export interface ObserverMetrics {
    frameCount: number;
    lastReward: number;
    lastPnl: number;
    averageReward: number;
    source: "wasm" | "js";
}

export interface PerfMetrics {
    redrawCount: number;
    lastRedrawMs: number;
    avgRedrawMs: number;
    maxRedrawMs: number;
    heapUsedMB: number | null;
    heapTotalMB: number | null;
    sampleCount: number;
}

export interface WorldPoint {
    x: number;
    y: number;
}

export interface ScreenPoint {
    x: number;
    y: number;
}

export interface HoveredCandle {
    index: number;
    time: number | string;
    open: number;
    high: number;
    low: number;
    close: number;
    screenX: number;
    screenY: number;
    worldX: number;
}

export interface SeriesOptions {
    id?: string;
    type?: SeriesType;
    color?: string;
    lineWidth?: number;
    opacity?: number;
    barWidthRatio?: number;
    valueKey?: SeriesValueKey;
    renderer?: CustomSeriesRenderer;
}

export type SeriesValueKey = "open" | "high" | "low" | "close" | "volume" | "value";

export interface CustomSeriesPoint {
    x: number;
    y: number;
    index: number;
    source: CandleDataPoint;
}

export interface SeriesStyle {
    color: string;
    lineWidth: number;
    opacity: number;
    barWidthRatio: number;
}

export interface NormalizedCandleDataPoint {
    source: CandleDataPoint;
    x: number;
    open: number;
    high: number;
    low: number;
    close: number;
}

export interface SeriesGeometry {
    candles: NormalizedCandleDataPoint[];
    minPrice: number;
    maxPrice: number;
    scale: number;
}

export interface CustomSeriesContext {
    width: number;
    height: number;
    baseY: number;
    geometry: SeriesGeometry;
    style: SeriesStyle;
    valueKey: SeriesValueKey;
}

export type CustomSeriesRenderer = (
    ctx: CanvasRenderingContext2D,
    points: CustomSeriesPoint[],
    context: CustomSeriesContext
) => void;

export type IndicatorType = "sma" | "ema" | "rsi";

export interface IndicatorDefinition {
    id?: string;
    type: IndicatorType;
    period: number;
    pane?: "main" | "lower";
    color?: string;
}

export interface IndicatorSeries {
    id: string;
    type: IndicatorType;
    period: number;
    pane: "main" | "lower";
    color: string;
    values: Array<number | null>;
}

export interface SeriesApi {
    id: string;
    type: SeriesType;
    setData: (data: CandleDataPoint[]) => void;
    append: (point: CandleDataPoint) => void;
    update: (point: CandleDataPoint) => void;
    updateLast: (point: Partial<CandleDataPoint>) => void;
    getData: () => CandleDataPoint[];
    clear: () => void;
}

export interface DrawingPoint {
    x: number; // normalized screen space [-1, 1]
    y: number; // normalized screen space [-1, 1]
    time?: number | string;
    price?: number;
}

export interface DrawingStyle {
    color?: string;
    width?: number;
    dash?: number[];
}

export type DrawingType = "line" | "polyline" | "horizontal_line" | "vertical_line";

export interface DrawingDefinition {
    id?: string;
    type: DrawingType;
    points?: DrawingPoint[];
    x?: number;
    y?: number;
    time?: number | string;
    price?: number;
    style?: DrawingStyle;
}
