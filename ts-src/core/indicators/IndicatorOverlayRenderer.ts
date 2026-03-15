import type { IndicatorSeries, SeriesGeometry } from "../../types";

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
    worldToCanvasPoint(worldX: number, worldY: number, width: number, height: number): { x: number; y: number };
    priceToWorldYValue(price: number, geometry: SeriesGeometry): number;
}

export function renderIndicatorOverlay(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    geometry: SeriesGeometry | null,
    indicators: Iterable<IndicatorSeries>,
    api: IndicatorOverlayRenderApi
): void {
    if (!geometry) {
        return;
    }

    const indicatorPane = api.getIndicatorPaneBounds(width, height);
    if (indicatorPane) {
        ctx.save();
        ctx.fillStyle = "rgba(6, 13, 26, 0.92)";
        ctx.strokeStyle = "rgba(120, 148, 188, 0.35)";
        ctx.lineWidth = 1;
        ctx.fillRect(indicatorPane.x, indicatorPane.y, indicatorPane.width, indicatorPane.height);
        ctx.strokeRect(indicatorPane.x, indicatorPane.y, indicatorPane.width, indicatorPane.height);
        ctx.font = "11px 'Segoe UI', sans-serif";
        ctx.fillStyle = "#97b0d2";
        ctx.fillText("Indicators", indicatorPane.x + 12, indicatorPane.y + 16);
        ctx.restore();
    }

    for (const indicator of indicators) {
        if (indicator.values.length === 0) {
            continue;
        }
        if (indicator.pane === "lower" && indicatorPane) {
            renderIndicatorInPane(ctx, geometry, indicator, indicatorPane, width, height, api);
        } else {
            renderIndicatorInMain(ctx, geometry, indicator, width, height, api);
        }
    }
}

function renderIndicatorInMain(
    ctx: CanvasRenderingContext2D,
    geometry: SeriesGeometry,
    indicator: IndicatorSeries,
    width: number,
    height: number,
    api: IndicatorOverlayRenderApi
): void {
    ctx.save();
    ctx.strokeStyle = indicator.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < geometry.candles.length; i += 1) {
        const value = indicator.values[i];
        if (!Number.isFinite(value ?? NaN)) {
            continue;
        }
        const worldY = api.priceToWorldYValue(value as number, geometry);
        const point = api.worldToCanvasPoint(geometry.candles[i].x, worldY, width, height);
        if (!started) {
            ctx.moveTo(point.x, point.y);
            started = true;
        } else {
            ctx.lineTo(point.x, point.y);
        }
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
    width: number,
    height: number,
    api: IndicatorOverlayRenderApi
): void {
    let minValue = Number.POSITIVE_INFINITY;
    let maxValue = Number.NEGATIVE_INFINITY;
    for (const value of indicator.values) {
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

    ctx.save();
    ctx.strokeStyle = indicator.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < geometry.candles.length; i += 1) {
        const value = indicator.values[i];
        if (!Number.isFinite(value ?? NaN)) {
            continue;
        }
        const x = api.worldToCanvasPoint(geometry.candles[i].x, geometry.candles[i].close, width, height).x;
        const y = mapY(value as number);
        if (!started) {
            ctx.moveTo(x, y);
            started = true;
        } else {
            ctx.lineTo(x, y);
        }
    }
    if (started) {
        ctx.stroke();
    }

    if (indicator.type === "rsi") {
        ctx.strokeStyle = "rgba(123, 148, 184, 0.35)";
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

