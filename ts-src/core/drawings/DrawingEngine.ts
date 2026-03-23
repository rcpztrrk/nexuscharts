import type { DrawingPoint, SeriesGeometry, WorldPoint } from "../../types";
import type { DrawingDragState, StoredDrawing } from "./DrawingManager";

export interface DrawingCoordinateApi {
    timeToWorldX(time: number | string, geometry: SeriesGeometry): number | null;
    worldXToTime(worldX: number, geometry: SeriesGeometry): number | string | null;
    priceToWorldY(price: number, geometry: SeriesGeometry): number;
    worldYToPrice(worldY: number, geometry: SeriesGeometry): number;
}

export function distancePointToSegment(point: WorldPoint, a: DrawingPoint, b: DrawingPoint): number {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const apx = point.x - a.x;
    const apy = point.y - a.y;
    const denom = (abx * abx) + (aby * aby);
    if (denom <= 1e-8) {
        const dx = point.x - a.x;
        const dy = point.y - a.y;
        return Math.sqrt((dx * dx) + (dy * dy));
    }

    const t = Math.max(0, Math.min(1, ((apx * abx) + (apy * aby)) / denom));
    const closestX = a.x + (abx * t);
    const closestY = a.y + (aby * t);
    const dx = point.x - closestX;
    const dy = point.y - closestY;
    return Math.sqrt((dx * dx) + (dy * dy));
}

export function resolveDrawingPoint(
    point: DrawingPoint,
    geometry: SeriesGeometry | null,
    api: DrawingCoordinateApi
): DrawingPoint {
    if (!geometry) {
        return point;
    }

    let x = point.x;
    let y = point.y;
    if (point.time !== undefined) {
        const worldX = api.timeToWorldX(point.time, geometry);
        if (worldX !== null) {
            x = worldX;
        }
    }
    if (typeof point.price === "number" && Number.isFinite(point.price)) {
        y = api.priceToWorldY(point.price, geometry);
    }
    return { ...point, x, y };
}

export function resolveDrawingWorldX(
    drawing: StoredDrawing,
    geometry: SeriesGeometry | null,
    api: DrawingCoordinateApi
): number | null {
    if (geometry && drawing.time !== undefined) {
        const worldX = api.timeToWorldX(drawing.time, geometry);
        if (worldX !== null) {
            return worldX;
        }
    }
    return typeof drawing.x === "number" ? drawing.x : null;
}

export function resolveDrawingWorldY(
    drawing: StoredDrawing,
    geometry: SeriesGeometry | null,
    api: DrawingCoordinateApi
): number | null {
    if (geometry && typeof drawing.price === "number" && Number.isFinite(drawing.price)) {
        return api.priceToWorldY(drawing.price, geometry);
    }
    return typeof drawing.y === "number" ? drawing.y : null;
}

export function applyAnchorsToDrawing(
    drawing: StoredDrawing,
    geometry: SeriesGeometry | null,
    api: DrawingCoordinateApi
): void {
    if (!geometry) {
        return;
    }

    if (drawing.points) {
        drawing.points = drawing.points.map((point) => resolveDrawingPoint(point, geometry, api));
    }

    if (drawing.type === "horizontal_line" && typeof drawing.price === "number" && Number.isFinite(drawing.price)) {
        drawing.y = api.priceToWorldY(drawing.price, geometry);
    }

    if (drawing.type === "vertical_line" && drawing.time !== undefined) {
        const worldX = api.timeToWorldX(drawing.time, geometry);
        if (worldX !== null) {
            drawing.x = worldX;
        }
    }
}

export function syncDrawingAnchors(
    drawing: StoredDrawing,
    geometry: SeriesGeometry | null,
    api: DrawingCoordinateApi
): void {
    if (!geometry) {
        return;
    }

    if (drawing.points) {
        drawing.points = drawing.points.map((point) => {
            const time = api.worldXToTime(point.x, geometry);
            const price = api.worldYToPrice(point.y, geometry);
            return {
                ...point,
                time: time ?? point.time,
                price: Number.isFinite(price) ? price : point.price,
            };
        });
    }

    if (drawing.type === "horizontal_line" && typeof drawing.y === "number") {
        const price = api.worldYToPrice(drawing.y, geometry);
        if (Number.isFinite(price)) {
            drawing.price = price;
        }
    }

    if (drawing.type === "vertical_line" && typeof drawing.x === "number") {
        const time = api.worldXToTime(drawing.x, geometry);
        if (time !== null) {
            drawing.time = time;
        }
    }
}

export function applyDragToDrawing(
    drawing: StoredDrawing,
    drag: DrawingDragState,
    world: WorldPoint,
    geometry: SeriesGeometry | null,
    api: DrawingCoordinateApi
): void {
    const dx = world.x - drag.startWorld.x;
    const dy = world.y - drag.startWorld.y;

    if (drawing.type === "line" && drawing.points && drag.startPoints && drag.startPoints.length >= 2) {
        if (drag.mode === "p0") {
            drawing.points[0] = { x: drag.startPoints[0].x + dx, y: drag.startPoints[0].y + dy };
        } else if (drag.mode === "p1") {
            drawing.points[1] = { x: drag.startPoints[1].x + dx, y: drag.startPoints[1].y + dy };
        } else {
            drawing.points = drag.startPoints.map((point) => ({ x: point.x + dx, y: point.y + dy }));
        }
    } else if (drawing.type === "polyline" && drawing.points && drag.startPoints) {
        if (drag.mode === "poly_point" && drag.pointIndex !== undefined) {
            const index = drag.pointIndex;
            if (drag.startPoints[index]) {
                drawing.points[index] = {
                    x: drag.startPoints[index].x + dx,
                    y: drag.startPoints[index].y + dy,
                };
            }
        } else {
            drawing.points = drag.startPoints.map((point) => ({ x: point.x + dx, y: point.y + dy }));
        }
    } else if (drawing.type === "horizontal_line" && typeof drag.startY === "number") {
        drawing.y = drag.startY + dy;
    } else if (drawing.type === "vertical_line" && typeof drag.startX === "number") {
        drawing.x = drag.startX + dx;
    }

    syncDrawingAnchors(drawing, geometry, api);
}
