import type { NexusCharts } from "./core/NexusCharts";

export interface InitOptions {
    canvasId: string;
    width?: number;
    height?: number;
    autoResize?: boolean;
    pixelRatio?: number;
    wasmScriptPath?: string;
    wasmBinaryPath?: string;
    enableInteraction?: boolean;
    analytics?: AnalyticsOptions;
    ui?: UiOptions;
    theme?: ThemeInput;
    onReady?: (chart: NexusCharts) => void;
}

export type DeepPartial<T> = {
    [K in keyof T]?: T[K] extends Array<infer U>
        ? Array<U>
        : T[K] extends object
            ? DeepPartial<T[K]>
            : T[K];
};

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

export interface ChartTheme {
    typography: {
        fontFamily: string;
        controlBarSize: number;
        axisSize: number;
        tooltipSize: number;
        crosshairSize: number;
        analyticsSize: number;
        selectionSize: number;
    };
    surface: {
        chartBackground: string;
        panelBackground: string;
        panelBorder: string;
        axisLabelBackground: string;
        axisLabelText: string;
        menuBackground: string;
        menuBorder: string;
        menuText: string;
        menuShadow: string;
    };
    axes: {
        grid: string;
        labelBackground: string;
        labelText: string;
    };
    controls: {
        actionFill: string;
        toggleActiveFill: string;
        toggleInactiveFill: string;
        activeStroke: string;
        inactiveStroke: string;
        actionText: string;
        toggleActiveText: string;
        toggleInactiveText: string;
        activeHint: string;
        inactiveHint: string;
    };
    tooltip: {
        background: string;
        border: string;
        label: string;
        value: string;
        positive: string;
        negative: string;
    };
    crosshair: {
        line: string;
        point: string;
        labelBackground: string;
        labelBorder: string;
        labelText: string;
    };
    selection: {
        fill: string;
        stroke: string;
        labelBackground: string;
        labelText: string;
    };
    drawings: {
        line: string;
        activeHandle: string;
        hoveredHandle: string;
        handleStroke: string;
        menuDeleteHover: string;
    };
    analytics: {
        heatmapHold: string;
        heatmapBuy: string;
        heatmapSell: string;
        panelBackground: string;
        panelBorder: string;
        zeroLine: string;
        rewardCurve: string;
        pnlCurve: string;
        panelText: string;
    };
    indicators: {
        paneBackground: string;
        paneBorder: string;
        paneLabel: string;
        guide: string;
        sma: string;
        ema: string;
        rsi: string;
    };
    series: {
        line: string;
        area: string;
        histogram: string;
        volume: string;
        custom: string;
    };
    candles: {
        up: string;
        down: string;
        wick: string;
    };
}

export type ThemeInput = DeepPartial<ChartTheme>;

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
