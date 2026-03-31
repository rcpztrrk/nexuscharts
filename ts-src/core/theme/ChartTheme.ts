import type { ChartTheme, ThemeInput } from "../../types";

export const defaultChartTheme: ChartTheme = {
    typography: {
        fontFamily: "'Segoe UI', sans-serif",
        controlBarSize: 11,
        axisSize: 11,
        tooltipSize: 12,
        crosshairSize: 11,
        analyticsSize: 12,
        selectionSize: 12,
    },
    surface: {
        chartBackground: "#1e1e24",
        panelBackground: "rgba(7, 18, 34, 0.92)",
        panelBorder: "rgba(120, 148, 188, 0.45)",
        axisLabelBackground: "rgba(7, 18, 34, 0.85)",
        axisLabelText: "#98afd1",
        menuBackground: "rgba(10, 24, 44, 0.96)",
        menuBorder: "rgba(120, 148, 188, 0.5)",
        menuText: "#dce7ff",
        menuShadow: "0 8px 22px rgba(0, 0, 0, 0.35)",
    },
    axes: {
        grid: "rgba(106, 138, 184, 0.25)",
        labelBackground: "rgba(7, 18, 34, 0.85)",
        labelText: "#98afd1",
    },
    controls: {
        actionFill: "rgba(18, 28, 47, 0.92)",
        toggleActiveFill: "rgba(21, 69, 119, 0.88)",
        toggleInactiveFill: "rgba(18, 28, 47, 0.78)",
        activeStroke: "rgba(120, 188, 255, 0.55)",
        inactiveStroke: "rgba(120, 148, 188, 0.28)",
        actionText: "#dce7ff",
        toggleActiveText: "#eef6ff",
        toggleInactiveText: "#9bb3d6",
        activeHint: "rgba(255, 209, 102, 0.95)",
        inactiveHint: "rgba(173, 191, 221, 0.72)",
    },
    tooltip: {
        background: "rgba(7, 18, 34, 0.92)",
        border: "rgba(120, 148, 188, 0.45)",
        label: "#9bd1ff",
        value: "#dce7ff",
        positive: "#49d17f",
        negative: "#ff6a7a",
    },
    crosshair: {
        line: "rgba(120, 188, 255, 0.55)",
        point: "rgba(87, 212, 255, 0.9)",
        labelBackground: "rgba(10, 24, 44, 0.95)",
        labelBorder: "rgba(120, 188, 255, 0.5)",
        labelText: "#9dc7f5",
    },
    selection: {
        fill: "rgba(255, 204, 102, 0.08)",
        stroke: "rgba(255, 204, 102, 0.6)",
        labelBackground: "rgba(18, 28, 47, 0.92)",
        labelText: "#ffcc66",
    },
    drawings: {
        line: "#8ea6c9",
        activeHandle: "rgba(255, 209, 102, 0.9)",
        hoveredHandle: "rgba(138, 199, 255, 0.9)",
        handleStroke: "rgba(15, 30, 50, 0.85)",
        menuDeleteHover: "rgba(255, 107, 122, 0.15)",
    },
    analytics: {
        heatmapHold: "#ffd166",
        heatmapBuy: "#39d98a",
        heatmapSell: "#ff5c70",
        panelBackground: "rgba(6, 15, 30, 0.72)",
        panelBorder: "rgba(120, 148, 188, 0.45)",
        zeroLine: "rgba(115, 138, 171, 0.35)",
        rewardCurve: "#57d4ff",
        pnlCurve: "#ffb86b",
        panelText: "#dce7ff",
    },
    indicators: {
        paneBackground: "rgba(6, 13, 26, 0.92)",
        paneBorder: "rgba(120, 148, 188, 0.35)",
        paneLabel: "#97b0d2",
        guide: "rgba(123, 148, 184, 0.35)",
        sma: "#fbbf24",
        ema: "#7dd3fc",
        rsi: "#a78bfa",
    },
    series: {
        line: "#60a5fa",
        area: "#60a5fa",
        histogram: "#fbbf24",
        volume: "#38bdf8",
        custom: "#f472b6",
    },
    candles: {
        up: "#32d74b",
        down: "#ff5c5c",
        wick: "#d8e4ff",
    },
};

export function createChartTheme(overrides?: ThemeInput): ChartTheme {
    if (!overrides) {
        return cloneTheme(defaultChartTheme);
    }
    return mergeChartTheme(defaultChartTheme, overrides);
}

export function mergeChartTheme(base: ChartTheme, overrides?: ThemeInput): ChartTheme {
    if (!overrides) {
        return cloneTheme(base);
    }

    return {
        typography: { ...base.typography, ...overrides.typography },
        surface: { ...base.surface, ...overrides.surface },
        axes: { ...base.axes, ...overrides.axes },
        controls: { ...base.controls, ...overrides.controls },
        tooltip: { ...base.tooltip, ...overrides.tooltip },
        crosshair: { ...base.crosshair, ...overrides.crosshair },
        selection: { ...base.selection, ...overrides.selection },
        drawings: { ...base.drawings, ...overrides.drawings },
        analytics: { ...base.analytics, ...overrides.analytics },
        indicators: { ...base.indicators, ...overrides.indicators },
        series: { ...base.series, ...overrides.series },
        candles: { ...base.candles, ...overrides.candles },
    };
}

export function cloneTheme(theme: ChartTheme): ChartTheme {
    return {
        typography: { ...theme.typography },
        surface: { ...theme.surface },
        axes: { ...theme.axes },
        controls: { ...theme.controls },
        tooltip: { ...theme.tooltip },
        crosshair: { ...theme.crosshair },
        selection: { ...theme.selection },
        drawings: { ...theme.drawings },
        analytics: { ...theme.analytics },
        indicators: { ...theme.indicators },
        series: { ...theme.series },
        candles: { ...theme.candles },
    };
}

export function fontSpec(fontSize: number, theme: ChartTheme): string {
    return `${fontSize}px ${theme.typography.fontFamily}`;
}

