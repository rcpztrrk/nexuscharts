import type { ScreenPoint, SeriesGeometry, WorldPoint } from "../../types";

export interface ChartViewportState {
    centerX: number;
    centerY: number;
    zoomX: number;
    zoomY: number;
}

export function worldToCanvasPoint(
    worldX: number,
    worldY: number,
    width: number,
    height: number,
    viewport: ChartViewportState
): ScreenPoint {
    const safeWidth = Math.max(1, width);
    const safeHeight = Math.max(1, height);
    const halfHeight = viewport.zoomY;
    const halfWidth = viewport.zoomX;
    const left = viewport.centerX - halfWidth;
    const bottom = viewport.centerY - halfHeight;

    return {
        x: ((worldX - left) / (halfWidth * 2.0)) * safeWidth,
        y: safeHeight - (((worldY - bottom) / (halfHeight * 2.0)) * safeHeight),
    };
}

export function canvasToWorldPoint(
    canvasX: number,
    canvasY: number,
    width: number,
    height: number,
    viewport: ChartViewportState
): WorldPoint {
    const safeWidth = Math.max(1, width);
    const safeHeight = Math.max(1, height);
    const halfHeight = viewport.zoomY;
    const halfWidth = viewport.zoomX;
    const left = viewport.centerX - halfWidth;
    const bottom = viewport.centerY - halfHeight;

    return {
        x: left + ((canvasX / safeWidth) * halfWidth * 2.0),
        y: bottom + (((safeHeight - canvasY) / safeHeight) * halfHeight * 2.0),
    };
}

export function getVisibleCandleIndexRange(
    geometry: SeriesGeometry,
    width: number,
    viewport: ChartViewportState,
    padding: number = 2
): { start: number; end: number } {
    const candles = geometry.candles;
    const count = candles.length;
    if (count === 0) {
        return { start: 0, end: -1 };
    }
    if (count === 1) {
        return { start: 0, end: 0 };
    }

    const halfWidth = viewport.zoomX;
    const left = viewport.centerX - halfWidth;
    const right = viewport.centerX + halfWidth;

    const startX = candles[0].x;
    const stepX = candles[1].x - startX;
    if (Math.abs(stepX) < 1e-9) {
        return { start: 0, end: count - 1 };
    }

    const rawStart = Math.floor((left - startX) / stepX) - padding;
    const rawEnd = Math.ceil((right - startX) / stepX) + padding;
    const start = Math.max(0, Math.min(count - 1, rawStart));
    const end = Math.max(0, Math.min(count - 1, rawEnd));
    return start <= end ? { start, end } : { start: 0, end: -1 };
}

export function getWorldUnitsPerPixel(
    width: number,
    height: number,
    viewport: ChartViewportState
): { x: number; y: number } {
    const safeWidth = Math.max(1, width);
    const safeHeight = Math.max(1, height);
    return {
        x: (2.0 * viewport.zoomX) / safeWidth,
        y: (2.0 * viewport.zoomY) / safeHeight,
    };
}
