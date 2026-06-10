import type { ScreenPoint, SeriesGeometry, WorldPoint } from "../../types";

export interface ChartViewportState {
    centerX: number;
    centerY: number;
    zoomX: number;
    zoomY: number;
}

export interface PrimarySeriesViewportStats {
    validCount: number;
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

    const firstX = candles[0].x;
    const lastX = candles[count - 1].x;
    const stepX = candles[1].x - firstX;
    if (Math.abs(stepX) > 1e-9 && isUniformCandleSpacing(candles, stepX)) {
        const rawStart = Math.floor((left - firstX) / stepX) - padding;
        const rawEnd = Math.ceil((right - firstX) / stepX) + padding;
        const start = Math.max(0, Math.min(count - 1, rawStart));
        const end = Math.max(0, Math.min(count - 1, rawEnd));
        return start <= end ? { start, end } : { start: 0, end: -1 };
    }

    if (right < firstX || left > lastX) {
        return { start: 0, end: -1 };
    }

    const rawStart = lowerBoundCandleX(candles, left) - padding;
    const rawEnd = upperBoundCandleX(candles, right) + padding;
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

export function calculateFitToDataViewport(stats: PrimarySeriesViewportStats): ChartViewportState | null {
    if (!stats) {
        return null;
    }

    const paddingY = 0.18;
    const paddingX = 0.08;
    const minX = -0.92;
    const maxX = stats.validCount > 1 ? 0.92 : -0.92;
    const minY = -0.85;
    const maxY = 0.85;
    const halfHeightFromY = Math.max(0.35, ((maxY - minY) * 0.5) + paddingY);
    const halfWidthFromX = Math.max(0.35, ((maxX - minX) * 0.5) + paddingX);

    return {
        centerX: (minX + maxX) * 0.5,
        centerY: (minY + maxY) * 0.5,
        zoomX: clampViewportZoom(halfWidthFromX),
        zoomY: clampViewportZoom(halfHeightFromY),
    };
}

export function calculateLatestDataViewport(
    geometry: SeriesGeometry,
    visibleCandles: number
): ChartViewportState | null {
    const candles = geometry.candles;
    if (candles.length === 0) {
        return null;
    }

    const endIndex = candles.length - 1;
    const visibleCount = Math.max(10, Math.min(candles.length, Math.floor(visibleCandles)));
    const startIndex = Math.max(0, endIndex - visibleCount + 1);
    const startCandle = candles[startIndex];
    const endCandle = candles[endIndex];

    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (let i = startIndex; i <= endIndex; i += 1) {
        const candle = candles[i];
        minY = Math.min(minY, candle.low);
        maxY = Math.max(maxY, candle.high);
    }

    const spanX = Math.max(1e-5, endCandle.x - startCandle.x);
    const spanY = Math.max(1e-5, maxY - minY);
    const rightPadding = Math.max(spanX * 0.08, 0.01);
    const paddingX = Math.max(spanX * 0.06, 0.01);
    const paddingY = Math.max(spanY * 0.18, 0.18);
    const minX = startCandle.x - paddingX;
    const maxX = endCandle.x + rightPadding;

    return {
        centerX: (minX + maxX) * 0.5,
        centerY: (minY + maxY) * 0.5,
        zoomX: clampViewportZoom((maxX - minX) * 0.5),
        zoomY: clampViewportZoom(((maxY - minY) * 0.5) + paddingY),
    };
}

export function calculateTimeRangeViewport(
    geometry: SeriesGeometry,
    fromX: number,
    toX: number,
    currentViewport: ChartViewportState,
    preserveY: boolean
): ChartViewportState {
    const minX = Math.min(fromX, toX);
    const maxX = Math.max(fromX, toX);
    const spanX = Math.max(1e-5, maxX - minX);
    const paddingX = Math.max(spanX * 0.06, 0.01);
    const nextViewport: ChartViewportState = {
        ...currentViewport,
        centerX: (minX + maxX) * 0.5,
        zoomX: clampViewportZoom(((maxX - minX) * 0.5) + paddingX),
    };

    if (preserveY) {
        return nextViewport;
    }

    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const candle of geometry.candles) {
        if (candle.x < minX || candle.x > maxX) {
            continue;
        }
        minY = Math.min(minY, candle.low);
        maxY = Math.max(maxY, candle.high);
    }

    if (Number.isFinite(minY) && Number.isFinite(maxY)) {
        const spanY = Math.max(1e-5, maxY - minY);
        const paddingY = Math.max(spanY * 0.18, 0.18);
        nextViewport.centerY = (minY + maxY) * 0.5;
        nextViewport.zoomY = clampViewportZoom(((maxY - minY) * 0.5) + paddingY);
    }

    return nextViewport;
}

export function calculateAnchoredZoomViewport(
    viewport: ChartViewportState,
    surface: { width: number; height: number },
    anchor: { x: number; y: number },
    anchoredWorld: WorldPoint,
    zoomFactor: number,
    axis: "x" | "y" | "both" = "x"
): ChartViewportState {
    const nextZoomX = axis === "y"
        ? viewport.zoomX
        : clampViewportZoom(viewport.zoomX * zoomFactor);
    const nextZoomY = axis === "x"
        ? viewport.zoomY
        : clampViewportZoom(viewport.zoomY * zoomFactor);
    const normalizedX = anchor.x / Math.max(1, surface.width);
    const normalizedY = (surface.height - anchor.y) / Math.max(1, surface.height);
    const left = anchoredWorld.x - (normalizedX * nextZoomX * 2.0);
    const bottom = anchoredWorld.y - (normalizedY * nextZoomY * 2.0);

    return {
        centerX: left + nextZoomX,
        centerY: bottom + nextZoomY,
        zoomX: nextZoomX,
        zoomY: nextZoomY,
    };
}

function clampViewportZoom(value: number): number {
    return Math.min(5.0, Math.max(0.2, value));
}

function isUniformCandleSpacing(candles: SeriesGeometry["candles"], stepX: number): boolean {
    const count = candles.length;
    const firstX = candles[0].x;
    const lastExpectedX = firstX + (stepX * (count - 1));
    if (Math.abs(candles[count - 1].x - lastExpectedX) > 1e-6) {
        return false;
    }

    const midIndex = Math.floor(count * 0.5);
    const midExpectedX = firstX + (stepX * midIndex);
    return Math.abs(candles[midIndex].x - midExpectedX) <= 1e-6;
}

function lowerBoundCandleX(candles: SeriesGeometry["candles"], targetX: number): number {
    let lower = 0;
    let upper = candles.length;
    while (lower < upper) {
        const mid = Math.floor((lower + upper) * 0.5);
        if (candles[mid].x < targetX) {
            lower = mid + 1;
        } else {
            upper = mid;
        }
    }
    return lower;
}

function upperBoundCandleX(candles: SeriesGeometry["candles"], targetX: number): number {
    let lower = 0;
    let upper = candles.length;
    while (lower < upper) {
        const mid = Math.floor((lower + upper) * 0.5);
        if (candles[mid].x <= targetX) {
            lower = mid + 1;
        } else {
            upper = mid;
        }
    }
    return lower - 1;
}
