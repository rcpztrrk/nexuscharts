import type { ChartTheme, DrawingPoint } from "../../types";
import type { StoredDrawing } from "./DrawingManager";

export interface DrawingOverlayRenderOptions {
    hoveredDrawingId: string | null;
    activeDrawingId: string | null;
    currentCenterX: number;
    currentCenterY: number;
    theme: ChartTheme;
    worldToCanvas: (x: number, y: number) => { x: number; y: number };
}

export function renderDrawingOverlay(
    ctx: CanvasRenderingContext2D,
    drawings: Iterable<StoredDrawing>,
    options: DrawingOverlayRenderOptions
): void {
    const toCanvas = (point: DrawingPoint): { x: number; y: number } => options.worldToCanvas(point.x, point.y);

    for (const drawing of drawings) {
        const style = drawing.style ?? {};
        ctx.save();
        ctx.strokeStyle = style.color ?? options.theme.drawings.line;
        ctx.lineWidth = style.width ?? 1.5;
        ctx.setLineDash(style.dash ?? []);

        if (drawing.type === "line" && drawing.points && drawing.points.length >= 2) {
            const p0 = toCanvas(drawing.points[0]);
            const p1 = toCanvas(drawing.points[1]);
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y);
            ctx.lineTo(p1.x, p1.y);
            ctx.stroke();
        } else if (drawing.type === "polyline" && drawing.points && drawing.points.length >= 2) {
            const first = toCanvas(drawing.points[0]);
            ctx.beginPath();
            ctx.moveTo(first.x, first.y);
            for (let i = 1; i < drawing.points.length; i += 1) {
                const p = toCanvas(drawing.points[i]);
                ctx.lineTo(p.x, p.y);
            }
            ctx.stroke();
        } else if (drawing.type === "horizontal_line" && typeof drawing.y === "number") {
            const y = options.worldToCanvas(0, drawing.y).y;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(ctx.canvas.width, y);
            ctx.stroke();
        } else if (drawing.type === "vertical_line" && typeof drawing.x === "number") {
            const x = options.worldToCanvas(drawing.x, 0).x;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, ctx.canvas.height);
            ctx.stroke();
        }

        ctx.restore();

        if (drawing.id !== options.hoveredDrawingId && drawing.id !== options.activeDrawingId) {
            continue;
        }

        const handlePoints: Array<{ x: number; y: number }> = [];
        if ((drawing.type === "line" || drawing.type === "polyline") && drawing.points && drawing.points.length > 0) {
            const pointsToRender = drawing.type === "line"
                ? [drawing.points[0], drawing.points[1]].filter(Boolean)
                : drawing.points;
            for (const point of pointsToRender) {
                handlePoints.push(toCanvas(point));
            }
        } else if (drawing.type === "horizontal_line" && typeof drawing.y === "number") {
            handlePoints.push(options.worldToCanvas(options.currentCenterX, drawing.y));
        } else if (drawing.type === "vertical_line" && typeof drawing.x === "number") {
            handlePoints.push(options.worldToCanvas(drawing.x, options.currentCenterY));
        }

        if (handlePoints.length === 0) {
            continue;
        }

        ctx.save();
        ctx.fillStyle = drawing.id === options.activeDrawingId
            ? options.theme.drawings.activeHandle
            : options.theme.drawings.hoveredHandle;
        ctx.strokeStyle = options.theme.drawings.handleStroke;
        ctx.lineWidth = 1;
        for (const handle of handlePoints) {
            ctx.beginPath();
            ctx.arc(handle.x, handle.y, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }
        ctx.restore();
    }
}
