import type { ChartTheme, IndicatorSeries, SeriesGeometry } from "../../types";
import { fontSpec } from "../theme/ChartTheme";

export interface IndicatorPaneRect {
    x: number;
    y: number;
    width: number;
    height: number;
    innerX: number;
    innerY: number;
    innerWidth: number;
    innerHeight: number;
}

export interface IndicatorOverlayRenderApi {
    getIndicatorPaneBounds(width: number, height: number): IndicatorPaneRect | null;
    getVisibleCandleIndexRange(
        geometry: SeriesGeometry,
        width: number,
        height: number,
        padding?: number
    ): { start: number; end: number };
    worldToCanvasPoint(worldX: number, worldY: number, width: number, height: number): { x: number; y: number };
    priceToWorldYValue(price: number, geometry: SeriesGeometry): number;
}

export function renderIndicatorOverlay(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    geometry: SeriesGeometry | null,
    indicators: Iterable<IndicatorSeries>,
    api: IndicatorOverlayRenderApi,
    theme: ChartTheme
): void {
    if (!geometry) {
        return;
    }

    const visibleRange = api.getVisibleCandleIndexRange(geometry, width, height, 2);
    const indicatorPane = api.getIndicatorPaneBounds(width, height);
    if (indicatorPane) {
        ctx.save();
        ctx.fillStyle = theme.indicators.paneBackground;
        ctx.strokeStyle = theme.indicators.paneBorder;
        ctx.lineWidth = 1;
        ctx.fillRect(indicatorPane.x, indicatorPane.y, indicatorPane.width, indicatorPane.height);
        ctx.strokeRect(indicatorPane.x, indicatorPane.y, indicatorPane.width, indicatorPane.height);
        ctx.font = fontSpec(theme.typography.axisSize, theme);
        ctx.fillStyle = theme.indicators.paneLabel;
        ctx.fillText("Indicators", indicatorPane.x + 12, indicatorPane.y + 16);
        ctx.restore();
    }

    if (visibleRange.end < visibleRange.start) {
        return;
    }

    for (const indicator of indicators) {
        if (indicator.values.length === 0) {
            continue;
        }
        if (indicator.pane === "lower" && indicatorPane) {
            renderIndicatorInPane(ctx, geometry, indicator, indicatorPane, visibleRange, width, height, api, theme);
        } else {
            renderIndicatorInMain(ctx, geometry, indicator, visibleRange, width, height, api);
        }
    }
}

function getSampleStride(start: number, end: number, pixelWidth: number): number {
    const visibleCount = Math.max(1, (end - start) + 1);
    const targetPoints = Math.max(48, Math.floor(pixelWidth * 1.5));
    return Math.max(1, Math.floor(visibleCount / targetPoints));
}

function renderIndicatorInMain(
    ctx: CanvasRenderingContext2D,
    geometry: SeriesGeometry,
    indicator: IndicatorSeries,
    visibleRange: { start: number; end: number },
    width: number,
    height: number,
    api: IndicatorOverlayRenderApi
): void {
    const start = visibleRange.start;
    const end = Math.min(visibleRange.end, geometry.candles.length - 1, indicator.values.length - 1);
    if (end < start) {
        return;
    }

    const stride = getSampleStride(start, end, width);
    ctx.save();
    ctx.strokeStyle = indicator.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let started = false;

    const drawPoint = (index: number): void => {
        const value = indicator.values[index];
        if (!Number.isFinite(value ?? NaN)) {
            return;
        }
        const worldY = api.priceToWorldYValue(value as number, geometry);
        const point = api.worldToCanvasPoint(geometry.candles[index].x, worldY, width, height);
        if (!started) {
            ctx.moveTo(point.x, point.y);
            started = true;
        } else {
            ctx.lineTo(point.x, point.y);
        }
    };

    for (let i = start; i <= end; i += stride) {
        drawPoint(i);
    }
    if ((end - start) % stride !== 0) {
        drawPoint(end);
    }

    if (started) {
        ctx.stroke();
    }
    ctx.restore();
}

function renderIndicatorInPane(
    ctx: CanvasRenderingContext2D,
    geometry: SeriesGeometry,
    indicator: IndicatorSeries,
    pane: IndicatorPaneRect,
    visibleRange: { start: number; end: number },
    width: number,
    height: number,
    api: IndicatorOverlayRenderApi,
    theme: ChartTheme
): void {
    const start = visibleRange.start;
    const end = Math.min(visibleRange.end, geometry.candles.length - 1, indicator.values.length - 1);
    if (end < start) {
        return;
    }

    let minValue = Number.POSITIVE_INFINITY;
    let maxValue = Number.NEGATIVE_INFINITY;
    for (let i = start; i <= end; i += 1) {
        const value = indicator.values[i];
        if (!Number.isFinite(value ?? NaN)) {
            continue;
        }
        minValue = Math.min(minValue, value as number);
        maxValue = Math.max(maxValue, value as number);
    }

    if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
        return;
    }

    if (indicator.type === "rsi") {
        minValue = 0;
        maxValue = 100;
    } else if (Math.abs(maxValue - minValue) < 1e-6) {
        maxValue += 1;
        minValue -= 1;
    }

    const mapY = (value: number): number => {
        const t = (value - minValue) / (maxValue - minValue);
        return pane.innerY + ((1 - t) * pane.innerHeight);
    };

    const stride = getSampleStride(start, end, width);
    ctx.save();
    ctx.strokeStyle = indicator.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let started = false;

    const drawPoint = (index: number): void => {
        const value = indicator.values[index];
        if (!Number.isFinite(value ?? NaN)) {
            return;
        }
        const x = api.worldToCanvasPoint(geometry.candles[index].x, geometry.candles[index].close, width, height).x;
        const y = mapY(value as number);
        if (!started) {
            ctx.moveTo(x, y);
            started = true;
        } else {
            ctx.lineTo(x, y);
        }
    };

    for (let i = start; i <= end; i += stride) {
        drawPoint(i);
    }
    if ((end - start) % stride !== 0) {
        drawPoint(end);
    }

    if (started) {
        ctx.stroke();
    }

    if (indicator.type === "rsi") {
        ctx.strokeStyle = theme.indicators.guide;
        ctx.setLineDash([4, 3]);
        const y30 = mapY(30);
        const y70 = mapY(70);
        ctx.beginPath();
        ctx.moveTo(pane.innerX, y30);
        ctx.lineTo(pane.innerX + pane.innerWidth, y30);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(pane.innerX, y70);
        ctx.lineTo(pane.innerX + pane.innerWidth, y70);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    ctx.restore();
}
